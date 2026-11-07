// Deterministic simulation of the actual game loop, with no browser dependency.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map(), events = new Map();
const noop = () => {};
const context2d = new Proxy({}, { get: (t,p) => t[p] ?? noop, set: (t,p,v) => (t[p]=v,true) });
const spriteDraws=[], images=[], flips=[];
context2d.drawImage=(...args)=>{if(args[0].url?.match(/punkman-(walk|jump|dash|crouch|shoot|slash|special)-right/))spriteDraws.push(args);};
context2d.scale=(x,y)=>flips.push([x,y]);
class SpriteImage {
  constructor(){images.push(this);this.complete=false;this.naturalWidth=0;this.naturalHeight=0;}
  set src(value){this.url=value;}
  load(){const data=fs.readFileSync('dist/'+this.url);this.complete=true;this.naturalWidth=data.readUInt32BE(16);this.naturalHeight=data.readUInt32BE(20);this.onload?.();}
}
function el(name) {
  if (!elements.has(name)) elements.set(name, { handlers:{}, textContent:'', hidden:false,
    classList:{add:noop,remove:noop}, setAttribute:noop, focus:noop,
    showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},
    addEventListener(type,fn){this.handlers[type]=fn;}, getContext(){return context2d;},
    click(){this.handlers.click?.();}, requestFullscreen:async()=>{}, scrollIntoView:noop });
  return elements.get(name);
}
let now=0, raf;
const sandbox={ console, Math, Set, Number, String, Image:SpriteImage, HTMLButtonElement:class{},
  matchMedia:()=>({matches:true}), performance:{now:()=>now},
  localStorage:{getItem:()=>null,setItem:noop},requestAnimationFrame:fn=>raf=fn,
  document:{querySelector:el,querySelectorAll:()=>[],addEventListener:noop},
  window:{addEventListener:(type,fn)=>events.set(type,fn)} };
for(const file of ['vfx.js','boss.js','game.js'])vm.runInNewContext(fs.readFileSync('dist/'+file,'utf8'),sandbox);
const snapshot=()=>sandbox.window.punkmanSnapshot();
const held=new Set();
function key(code,down){if(down===held.has(code))return;down?held.add(code):held.delete(code);events.get(down?'keydown':'keyup')({code,target:el('#game'),preventDefault:noop});}
function tick(seconds){for(let i=0;i<Math.ceil(seconds*120);i++){now+=1000/120;raf(now);}}
function start(){held.clear();el('#start').click();}
assert.equal(images.length,29,'Character and VFX sheets plus cut-in must all be loaded');
start();assert.equal(snapshot().mode,'ready','Gameplay must wait for the character image');
images[0].onerror();assert.equal(el('#start').disabled,false,'A failed image can be retried');
start();assert.equal(snapshot().mode,'ready');
images[0].load();assert.equal(el('#start').disabled,true,'Wait for the other two actions');
images[1].load();assert.equal(el('#start').disabled,true);
images.slice(2).forEach(image=>image.load());assert.equal(el('#start').disabled,false);
start();tick(.5);assert(snapshot().player.ground);
assert.equal(spriteDraws.at(-1)[1],0,'Standing uses the first frame');
let tapX=snapshot().player.x;
key('KeyD',true);tick(1/60);
assert(snapshot().player.x>tapX,'Movement starts within the first displayed frame');
assert.notEqual(spriteDraws.at(-1)[1],0,'A short tap must show a stepping pose immediately');
const firstStep=snapshot().sprite.frame;
key('KeyD',false);tick(1/60);
key('KeyA',true);tick(1/60);
assert.notEqual(spriteDraws.at(-1)[1],0,'A short reverse tap must also step immediately');
assert.notEqual(snapshot().sprite.frame,firstStep,'Repeated taps alternate the stepping leg');
key('KeyA',false);tick(1/60);
spriteDraws.length=0;
let x=snapshot().player.x;key('KeyD',true);tick(1);key('KeyD',false);assert(snapshot().player.x>x+100);
assert.equal(new Set(spriteDraws.map(draw=>draw[1])).size,8,'Walking uses all eight distinct atlas frames');
assert(spriteDraws.every(draw=>draw[3]===128&&draw[4]===128));
key('KeyA',true);tick(.1);key('KeyA',false);assert(flips.some(([x])=>x===-1),'Left movement mirrors the character');
tick(.1);assert.equal(spriteDraws.at(-1)[1],0,'Stopping resets to the standing frame');
key('KeyD',true);tick(.1);key('KeyD',false);
for(let i=0;i<7;i++){key('KeyJ',true);tick(.04);key('KeyJ',false);tick(.22);}assert.equal(snapshot().kills,1);
spriteDraws.length=0;
key('Space',true);tick(.3);assert(snapshot().player.y<175);
assert.equal(snapshot().sprite.state,'jump');
assert(spriteDraws.at(-1)[0].url.includes('jump-right'),'Airborne uses the generated jump sheet');
key('Space',false);tick(.8);assert(snapshot().player.ground);
assert(new Set(spriteDraws.filter(d=>d[0].url.includes('jump-right')).map(d=>d[1])).size>=5,'Jump changes pose through ascent, apex, fall and landing');
spriteDraws.length=0;
x=snapshot().player.x;key('KeyK',true);tick(.12);key('KeyK',false);assert(snapshot().player.x>x+25);
assert.equal(snapshot().sprite.state,'dash');
assert(spriteDraws.at(-1)[0].url.includes('dash-right'),'Dashing uses the generated dash sheet');
tick(.04);assert.equal(snapshot().sprite.state,'dash','Dash has a short recovery pose');
tick(.4);assert.equal(snapshot().sprite.state,'idle');
assert.equal(new Set(spriteDraws.filter(d=>d[0].url.includes('dash-right')).map(d=>d[1])).size,8,'Dash includes all anticipation, travel and recovery frames');
key('KeyP',true);key('KeyP',false);assert.equal(snapshot().mode,'paused');const elapsed=snapshot().elapsed;tick(1);assert.equal(snapshot().elapsed,elapsed);start();assert.equal(snapshot().mode,'playing');
console.log('PASS: movement, shooting damage, jump/landing, dash, pause/resume.');
console.log('PASS: seven sprite sheets load/retry, immediate alternating short taps, eight walk/dash frames, jump phases, left-facing flip.');
// Follow the level using ordinary input. Retry at checkpoints if hit by enemies.
const edges=[435,840,1260,1685,2090];let jumpUntil=0,retries=0,checkpointSeen=false;
for(let t=0;t<150*120;t++){
  const s=snapshot();
  if(s.mode==='won')break;
  if(s.mode==='dead'){retries++;assert(retries<9,'Repeatedly unable to cross level');start();jumpUntil=0;continue;}
  key('KeyD',!s.boss.dead?s.player.x<2760:true);key('KeyJ',t%28<4);
  if(s.checkpoint>45)checkpointSeen=true;
  const edge=edges.find(e=>e-s.player.x>0&&e-s.player.x<26);
  if(edge&&s.player.ground&&now>jumpUntil){jumpUntil=now+700;key('Space',true);}
  if(now>jumpUntil)key('Space',false);
  tick(1/120);
}
assert(checkpointSeen,'Checkpoint should activate');
assert.equal(snapshot().mode,'won',JSON.stringify(snapshot()));
console.log('PASS: traversable gaps, checkpoint, boss damage/death, exit victory.',JSON.stringify(snapshot()));
for(const code of [...held])key(code,false);
key('KeyR',true);key('KeyR',false);tick(.5);key('KeyD',true);key('KeyJ',true);tick(5);key('KeyD',false);key('KeyJ',false);
assert.equal(snapshot().mode,'dead','Walking off the first roof should kill the player: '+JSON.stringify(snapshot()));start();tick(.5);assert.equal(snapshot().player.hp,6);assert.equal(snapshot().mode,'playing');
console.log('PASS: restart, pit death, respawn.');
