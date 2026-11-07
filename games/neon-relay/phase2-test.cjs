const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function game(reduced=false){
  const nodes=new Map(),events=new Map(),images=[],draws=[],held=new Set(),noop=()=>{};
  const ctx=new Proxy({drawImage:(...args)=>draws.push(args)},{get:(o,k)=>o[k]??noop,set:(o,k,v)=>(o[k]=v,true)});
  function el(id){if(!nodes.has(id))nodes.set(id,{handlers:{},classList:{add:noop,remove:noop},focus:noop,setAttribute:noop,getContext:()=>ctx,showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},addEventListener(k,f){this.handlers[k]=f;},click(){this.handlers.click?.();}});return nodes.get(id);}
  class Img{constructor(){images.push(this);}set src(v){this.url=v;}load(){const p=fs.readFileSync('dist/'+this.url);this.naturalWidth=p.readUInt32BE(16);this.naturalHeight=p.readUInt32BE(20);this.onload();}}
  let now=0,raf;const env={console,Math,Set,Number,String,Image:Img,HTMLButtonElement:class{},matchMedia:()=>({matches:reduced}),performance:{now:()=>now},localStorage:{getItem:()=>null,setItem:noop},requestAnimationFrame:f=>raf=f,document:{querySelector:el,querySelectorAll:()=>[],addEventListener:noop},window:{addEventListener:(k,f)=>events.set(k,f)}};
  for(const file of ['vfx.js','boss.js','game.js'])vm.runInNewContext(fs.readFileSync('dist/'+file,'utf8'),env);
  images.forEach(i=>i.load());const snap=()=>env.window.punkmanSnapshot();
  function key(code,down){if(held.has(code)===down)return;down?held.add(code):held.delete(code);events.get(down?'keydown':'keyup')({code,target:el('#game'),preventDefault:noop});}
  function tick(s){for(let i=0;i<Math.ceil(s*120);i++){now+=1000/120;raf(now);}}
  function tap(k){key(k,true);tick(.025);key(k,false);tick(.025);}
  function until(fn,max=10){for(let i=0;i<max*120;i++){if(fn(snap()))return;assert.equal(snap().mode,'playing');tick(1/120);}assert.fail('Timed out: '+JSON.stringify(snap().boss));}
  function phase(){el('#practice').click();tap('KeyL');tap('Enter');tick(.8);assert.equal(snap().boss.hp,16);tap('KeyJ');until(s=>s.boss.hp<=15);}
  return{snap,key,tick,tap,until,phase,draws,click:id=>el(id).click()};
}
const g=game();g.phase();assert.equal(g.snap().boss.phase,2);assert.equal(g.snap().boss.state,'transform');assert.equal(g.snap().boss.hp,15);
assert(g.snap().boss.timeScale<.2,'Phase transformation slows the world');assert.equal(g.snap().boss.projectiles,0);
g.tap('KeyP');const frozen=g.snap().boss.clock;g.tick(.7);assert.equal(g.snap().boss.clock,frozen,'Pause freezes transformation');g.click('#start');
for(let i=0;i<4;i++){g.tap('KeyJ');g.tick(.15);}assert.equal(g.snap().boss.hp,15,'Transformation shields the boss without healing it');
assert(g.draws.some(d=>d[0].url==='assets/boss-phase2-cutin.png'));
g.until(s=>s.boss.state!=='transform');assert.equal(g.snap().boss.phaseTransitions,1);assert.equal(g.snap().boss.tempo,1.4);
console.log('PASS: threshold, cinematic slow/cut-in, protected transition, pause and 40 percent faster phase 2.');

const dodge=game();dodge.phase();dodge.until(s=>s.boss.state==='stomp'&&s.boss.clock>=.64);
const before=dodge.snap().player.hp;dodge.key('Space',true);dodge.tick(.7);dodge.key('Space',false);dodge.tick(.5);
assert.equal(dodge.snap().player.hp,before,'A timed jump clears all three ground-wave volleys');
assert(dodge.draws.some(d=>d[0].url==='assets/boss-stomp-left.png'));assert(dodge.draws.some(d=>d[0].url==='assets/fx-boss-quake.png'));
const stand=game();stand.phase();stand.until(s=>s.boss.state==='stomp');const standHP=stand.snap().player.hp;stand.tick(1.3);assert(stand.snap().player.hp<standHP,'Ground waves damage a standing player');
stand.tap('KeyR');assert.equal(stand.snap().boss.phase,1);assert.equal(stand.snap().boss.phaseTransitions,0);assert.equal(stand.snap().boss.quakeProjectiles,0);
console.log('PASS: Sonic Quake damages on the ground, is jumpable, renders real sprites and resets cleanly.');

const calm=game(true);calm.phase();assert.equal(calm.snap().boss.timeScale,1);calm.tick(.5);assert.notEqual(calm.snap().boss.state,'transform');assert(!calm.draws.some(d=>d[0].url==='assets/boss-phase2-cutin.png'));
const cancel=game();cancel.phase();cancel.click('#practice');assert.equal(cancel.snap().boss.phase,1);assert.equal(cancel.snap().boss.phaseTransitions,0);assert.equal(cancel.snap().boss.state,'idle');
console.log('PASS: reduced-motion brief cue and practice restart cancel the transformation.');

const overlap=game();overlap.click('#practice');
for(let i=0;i<2;i++){overlap.key('KeyJ',true);overlap.tick(1.05);overlap.key('KeyJ',false);overlap.tick(.4);}
assert.equal(overlap.snap().boss.hp,16);assert.equal(overlap.snap().combat.meter,100);
overlap.key('KeyJ',true);overlap.tick(.025);overlap.key('KeyJ',false);overlap.tick(.125);overlap.tap('KeyL');
assert.equal(overlap.snap().combat.ultimates,1,'Ultimate is committed before the ordinary shot crosses the threshold');
overlap.until(s=>s.boss.state==='transform');overlap.tick(4);
assert.equal(overlap.snap().boss.hp,1,'Precommitted ultimate survives the phase shield and deals its 14 damage afterward');
assert.equal(overlap.snap().combat.ultimateWaves,1);assert.equal(overlap.snap().boss.phaseTransitions,1);assert.equal(overlap.snap().cinematic.active,false);
console.log('PASS: overlapping player ultimate is preserved across the phase transition and lands once.');
