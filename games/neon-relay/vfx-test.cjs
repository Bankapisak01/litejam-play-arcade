const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function game(reduced=false){
  const elements=new Map(),events=new Map(),images=[],draws=[],specialFaces=[],held=new Set(),noop=()=>{};let facing=1;
  const ctx=new Proxy({scale:x=>facing=x,drawImage:(...args)=>{args.face=facing;draws.push(args);if(args[0].url?.includes('punkman-special-right'))specialFaces.push(facing);}}, {get:(t,p)=>t[p]??noop,set:(t,p,v)=>(t[p]=v,true)});
  function el(id){if(!elements.has(id))elements.set(id,{handlers:{},classList:{add:noop,remove:noop},setAttribute:noop,focus:noop,
    showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},
    addEventListener(k,f){this.handlers[k]=f;},getContext:()=>ctx,click(){this.handlers.click?.();}});return elements.get(id);}
  class FakeImage{constructor(){images.push(this);}set src(v){this.url=v;}load(){const data=fs.readFileSync('dist/'+this.url);this.naturalWidth=data.readUInt32BE(16);this.naturalHeight=data.readUInt32BE(20);this.onload();}}
  let now=0,raf;const env={console,Math,Set,Number,String,Image:FakeImage,HTMLButtonElement:class{},matchMedia:()=>({matches:reduced}),
    performance:{now:()=>now},localStorage:{getItem:()=>null,setItem:noop},requestAnimationFrame:f=>raf=f,
    document:{querySelector:el,querySelectorAll:()=>[],addEventListener:noop},window:{addEventListener:(k,f)=>events.set(k,f)}};
  for(const file of ['vfx.js','boss.js','game.js'])if(fs.existsSync('dist/'+file))vm.runInNewContext(fs.readFileSync('dist/'+file,'utf8'),env);
  images.forEach(im=>im.load());
  const snap=()=>env.window.punkmanSnapshot();
  function key(code,down){if(held.has(code)===down)return;down?held.add(code):held.delete(code);events.get(down?'keydown':'keyup')({code,target:el('#game'),preventDefault:noop});}
  function tick(s){for(let i=0;i<Math.ceil(s*120);i++){now+=1000/120;raf(now);}}
  function release(){for(const k of [...held])key(k,false);}
  function tap(k){key(k,true);tick(.025);key(k,false);tick(.025);}
  function start(){el('#start').click();tick(.5);}
  function earnMeter(){
    const edges=[435,840,1260,1685,2090];let jumpUntil=0;
    for(let i=0;i<120*80;i++){
      const s=snap();if(s.combat.meter===100&&s.player.ground){release();tick(1.35);return;}
      assert.equal(s.mode,'playing','Meter collection should remain playable');
      key('KeyD',true);key('KeyJ',i%28<4);
      if(edges.some(e=>e-s.player.x>0&&e-s.player.x<26)&&s.player.ground&&now>jumpUntil){jumpUntil=now+700;key('Space',true);}
      if(now>jumpUntil)key('Space',false);tick(1/120);
    }
    assert.fail('Failed to earn a full meter');
  }
  return{images,draws,specialFaces,snap,key,tick,tap,release,start,earnMeter,click:id=>el(id).click(),blur:()=>events.get('blur')()};
}
const g=game();g.start();assert.equal(g.snap().vfx?.loaded,true,'All raster effects and cut-in load before play');
g.key('KeyJ',true);g.tick(1.05);assert(g.draws.some(d=>d[0].url==='assets/fx-charge.png'),'Charge uses the new aura atlas');
g.key('KeyJ',false);g.tick(.03);assert(g.draws.some(d=>d[0].url==='assets/fx-charged-bolt.png'));
g.tap('KeyX');g.tick(.12);assert(g.draws.some(d=>d[0].url==='assets/fx-slash.png'));
g.earnMeter();g.tap('KeyL');assert(g.snap().cinematic.active);assert.equal(g.snap().combat.meter,0);
assert.equal(g.snap().combat.ultimateWaves,0,'Do not launch before the cinematic release');
const enemyX=g.snap().enemies[0].x;g.tick(.25);assert(g.snap().cinematic.timeScale<.2,'Opening slows the simulation');
assert(Math.abs(g.snap().enemies[0].x-enemyX)<2);assert(g.draws.some(d=>d[0].url==='assets/punkman-ultimate-cutin.png'));
g.tap('KeyP');const frozen=g.snap().cinematic.time;g.tick(.5);assert.equal(g.snap().cinematic.time,frozen,'Pause freezes cinematic clock');g.click('#start');
g.tap('Space');assert.equal(g.snap().combat.ultimateWaves,1,'Skipping releases exactly one wave');
g.tap('Enter');g.tap('KeyL');g.tick(1.8);assert.equal(g.snap().combat.ultimateWaves,1);assert.equal(g.snap().cinematic.active,false);assert.equal(g.snap().combat.meter,0);
assert(g.draws.some(d=>d[0].url==='assets/fx-ultimate.png'));console.log('PASS: VFX atlases, cinematic slow/cut-in/pause/skip and one spend/one wave.');

const quick=game(true);quick.start();quick.earnMeter();quick.tap('KeyL');assert.equal(quick.snap().cinematic.timeScale,1,'Reduced motion keeps normal simulation speed');
quick.tick(.3);assert.equal(quick.snap().combat.ultimateWaves,1);assert.equal(quick.snap().cinematic.active,false,'Reduced-motion intro is brief');
assert(!quick.draws.some(d=>d[0].url==='assets/punkman-ultimate-cutin.png'),'Reduced motion avoids moving portrait');
console.log('PASS: reduced-motion brief cue, no zoom or slow simulation.');

const natural=game();natural.start();natural.earnMeter();natural.tap('KeyL');natural.key('KeyA',true);natural.tick(.91);
assert.equal(natural.snap().combat.ultimateWaves,1,'Cinematic releases naturally without a skip');
assert.equal(natural.snap().player.face,-1);assert.equal(natural.specialFaces.at(-1),1,'Ultimate follow-through faces the same way as its emitted wave');
natural.release();natural.tick(.7);assert.equal(natural.snap().cinematic.active,false);
console.log('PASS: natural release and special pose direction while turning.');

const reset=game();reset.start();reset.earnMeter();reset.tap('KeyL');reset.tap('KeyR');reset.tick(1.5);
assert.equal(reset.snap().cinematic.active,false);assert.equal(reset.snap().combat.ultimateWaves,0);assert.equal(reset.snap().combat.meter,0);
console.log('PASS: restart cancels cinematic and queued wave.');

const dash=game();dash.start();dash.key('KeyK',true);dash.tick(.035);dash.key('KeyK',false);
assert(dash.draws.some(d=>d[0].url==='assets/fx-dash.png'&&d.face===1),'Right dash must render its energy wake sprite');
assert(dash.draws.some(d=>d[0].url==='assets/fx-impact.png'),'Dash launch has a burst');
assert(dash.snap().vfx.dashEchoes>0,'Dash leaves fading character afterimages');
dash.tap('KeyP');const echoes=dash.snap().vfx.dashEchoes;dash.tick(.4);assert.equal(dash.snap().vfx.dashEchoes,echoes,'Pause preserves the trail');dash.click('#start');
dash.tick(.8);assert.equal(dash.snap().vfx.dashEchoes,0,'Afterimages expire after the dash');
dash.key('KeyA',true);dash.key('ShiftLeft',true);dash.tick(.035);dash.release();
assert(dash.draws.some(d=>d[0].url==='assets/fx-dash.png'&&d.face===-1),'Left dash mirrors its wake');
dash.tap('KeyR');assert.equal(dash.snap().vfx.dashEchoes,0,'Restart clears afterimages');
dash.tick(.5);dash.key('Space',true);dash.tick(.08);dash.draws.length=0;dash.key('KeyK',true);dash.tick(.035);dash.release();
assert.equal(dash.snap().player.ground,false);assert(dash.draws.some(d=>d[0].url==='assets/fx-dash.png'),'Air dash also has a wake');
const calmDash=game(true);calmDash.start();calmDash.tap('KeyK');assert.equal(calmDash.snap().vfx.dashEchoes,0,'Reduced motion omits afterimages');
assert(calmDash.draws.some(d=>d[0].url==='assets/fx-dash.png'),'Reduced motion keeps a readable dash cue');
console.log('PASS: dash wake in both directions and air, launch burst, trail pause/expiry/reset and reduced motion.');

const arena=game();arena.click('#practice');arena.tick(.1);
assert.equal(arena.snap().boss.practice,true);assert.equal(arena.snap().boss.hp,30);assert.equal(arena.snap().combat.meter,100);
assert(arena.snap().boss.loaded);assert(arena.draws.some(d=>d[0].url==='assets/boss-idle-left.png'));
while(arena.snap().boss.state!=='charge')arena.tick(1/120);
assert.equal(arena.snap().boss.projectiles,0,'No projectiles during anticipation');
assert(arena.draws.some(d=>d[0].url==='assets/fx-boss-charge.png'));
arena.tap('KeyP');const bossClock=arena.snap().boss.clock;arena.tick(.5);assert.equal(arena.snap().boss.clock,bossClock);arena.click('#start');
arena.tick(.8);assert(arena.snap().boss.projectiles>0);assert(arena.draws.some(d=>d[0].url==='assets/fx-boss-breath.png'));
arena.click('#practice');arena.key('KeyD',true);arena.tick(.65);arena.release();
for(let i=0;i<600&&!arena.snap().boss.claws;i++)arena.tick(1/120);
assert.equal(arena.snap().boss.attack,'claw');assert.equal(arena.snap().player.hp,4,'Claw damages once at the active strike');
assert(arena.draws.some(d=>d[0].url==='assets/fx-boss-claw.png'));arena.tick(.3);assert.equal(arena.snap().player.hp,4);
arena.click('#practice');arena.tap('KeyL');arena.tap('Enter');arena.tick(1.1);
for(let i=0;i<80&&!arena.snap().boss.dead;i++){arena.tap('KeyJ');arena.tick(.17);}
assert(arena.snap().boss.dead);assert.equal(arena.snap().boss.projectiles,0,'Defeat clears boss projectiles');arena.tick(.4);
assert(arena.draws.some(d=>d[0].url==='assets/boss-death-left.png'));
arena.tap('KeyR');assert.equal(arena.snap().boss.practice,false);assert.equal(arena.snap().boss.hp,30);assert.equal(arena.snap().boss.active,false);
console.log('PASS: boss practice, animated assets, pause, charged breath, claw damage, defeat and restart integration.');
