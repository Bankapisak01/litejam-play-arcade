const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),events=new Map(),images=[],noop=()=>{};
const ctx=new Proxy({}, {get:(t,p)=>t[p]??noop,set:(t,p,v)=>(t[p]=v,true)});
const drawnFaces=[];ctx.scale=x=>drawnFaces.push(x);
function el(id){if(!elements.has(id))elements.set(id,{handlers:{},classList:{add:noop,remove:noop},
  setAttribute:noop,focus:noop,addEventListener(k,f){this.handlers[k]=f;},getContext:()=>ctx,
  showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},
  click(){this.handlers.click?.();}});return elements.get(id);}
class FakeImage{constructor(){images.push(this);}set src(v){this.url=v;}load(){const data=fs.readFileSync('dist/'+this.url);this.naturalWidth=data.readUInt32BE(16);this.naturalHeight=data.readUInt32BE(20);this.onload();}}
const touchButtons=['KeyJ','KeyX'].map(code=>Object.assign(el('touch-'+code),{dataset:{key:code},setPointerCapture:noop}));
let now=0,raf;
const sandbox={console,Math,Set,Number,String,Image:FakeImage,HTMLButtonElement:class{},
  matchMedia:()=>({matches:true}),performance:{now:()=>now},localStorage:{getItem:()=>null,setItem:noop},
  requestAnimationFrame:f=>raf=f,document:{querySelector:el,querySelectorAll:()=>touchButtons,addEventListener:noop},
  window:{addEventListener:(k,f)=>events.set(k,f)}};
for(const file of ['vfx.js','boss.js','game.js'])vm.runInNewContext(fs.readFileSync('dist/'+file,'utf8'),sandbox);
images.forEach(im=>im.load());
const held=new Set(),snap=()=>sandbox.window.punkmanSnapshot();
function key(code,down){if(held.has(code)===down)return;down?held.add(code):held.delete(code);events.get(down?'keydown':'keyup')({code,target:el('#game'),preventDefault:noop});}
function tick(s){for(let i=0;i<Math.ceil(s*120);i++){now+=1000/120;raf(now);}}
function release(){for(const code of [...held])key(code,false);}
function reset(){release();el('#restart').click();tick(.5);}
function tap(code,s=.025){key(code,true);tick(s);key(code,false);tick(.025);}

reset();const feet=snap().player.y+snap().player.h;
key('KeyS',true);tick(.03);assert.equal(snap().player.crouch,true,'S crouches');
assert(snap().player.h<30,'Crouch reduces the collision box');assert.equal(snap().player.y+snap().player.h,feet);
assert.equal(snap().sprite.state,'crouch');const crouchX=snap().player.x;
key('KeyD',true);tick(.1);assert.equal(snap().player.x,crouchX,'Crouching stays planted');key('KeyD',false);
key('Space',true);tick(.08);assert.equal(snap().player.ground,false);assert.equal(snap().player.h,30,'Jump exits crouch immediately');
release();tick(.8);key('ArrowDown',true);tick(.03);assert(snap().player.crouch);tap('KeyK');assert.equal(snap().player.h,30);release();
console.log('PASS: crouch height, feet anchor, down alias, jump/dash from crouch.');

reset();key('KeyJ',true);tick(.025);assert.equal(snap().combat.shotsFired,1,'Press fires immediately');
tick(1.05);assert.equal(snap().combat.shotLevel,2);key('KeyJ',false);tick(.025);
assert.equal(snap().combat.shotsFired,2);assert(snap().projectiles.some(s=>s.charge===2&&s.damage===6));
reset();tap('KeyJ');tick(.3);assert.equal(snap().combat.shotsFired,1,'Short tap does not double fire');
key('KeyJ',true);tick(.3);key('KeyZ',true);tick(.8);key('KeyJ',false);tick(.03);
assert.equal(snap().combat.shotLevel,2,'Releasing one shooting alias keeps charging');
const beforeRelease=snap().combat.shotsFired;key('KeyZ',false);tick(.025);assert.equal(snap().combat.shotsFired,beforeRelease+1);
key('KeyJ',true);tick(.5);tap('KeyP');const pausedShots=snap().combat.shotsFired;release();el('#start').click();tick(.2);
assert.equal(snap().combat.shotCharge,0);assert.equal(snap().combat.shotsFired,pausedShots,'Pause cancels pending charge');
console.log('PASS: quick shot, two charge thresholds, alias release and pause cancellation.');
reset();key('KeyJ',true);key('KeyJ',false);tick(.02);assert.equal(snap().combat.shotsFired,1,'A tap within one simulation step still fires');
reset();const touchShot=touchButtons[0],pointer={pointerId:1,preventDefault:noop};
touchShot.handlers.pointerdown(pointer);tick(1.05);touchShot.handlers.pointercancel();tick(.03);
assert.equal(snap().combat.shotsFired,1,'Cancelled touch does not fire the stored charge');
touchShot.handlers.pointerdown(pointer);tick(1.05);touchShot.handlers.pointerup();touchShot.handlers.lostpointercapture();tick(.03);
assert.equal(snap().combat.shotsFired,3,'Normal touch release fires charged shot exactly once');
reset();key('KeyJ',true);tick(.5);events.get('blur')();release();el('#start').click();tick(.1);assert.equal(snap().combat.shotCharge,0);
reset();key('KeyD',true);key('KeyJ',true);tick(5);assert.equal(snap().mode,'dead');assert.equal(snap().combat.shotCharge,0,'Pit death clears charge');release();
console.log('PASS: sub-frame taps, touch release/cancellation, focus loss and death clear pending charge.');

reset();key('KeyD',true);
for(let i=0;i<600&&snap().enemies[0].x-snap().player.x>31;i++)tick(1/120);
key('KeyD',false);tap('KeyX');tick(.18);
assert.equal(snap().enemies[0].hp,1,'Normal slash deals exactly two damage once');
tick(.15);assert.equal(snap().enemies[0].hp,1,'Overlapping attack frames cannot repeat damage');
const meter=snap().combat.meter;tap('KeyX');tick(.2);assert.equal(snap().enemies[0].hp,0);assert(snap().combat.meter>meter);
reset();key('KeyX',true);tick(1.08);assert.equal(snap().combat.slashLevel,2);key('KeyX',false);tick(.03);
assert.equal(snap().combat.attack.level,2);assert.equal(snap().combat.attack.damage,7);assert.equal(snap().combat.attack.reach,74);
tap('KeyL');assert.equal(snap().combat.ultimates,0,'Cannot use ultimate without full meter');
console.log('PASS: melee damage, one hit per swing, kill meter, charged slash, empty-meter rejection.');
reset();key('KeyX',true);tick(1.05);key('KeyK',true);tick(.03);key('KeyX',false);tick(.16);
assert.equal(snap().combat.attack?.level,2,'A charged slash released during dash executes when the dash ends');release();
reset();key('KeyX',true);tick(.02);key('KeyX',false);key('KeyA',true);tick(.08);
assert.equal(snap().player.face,-1);assert.equal(drawnFaces.at(-1),1,'Swing artwork preserves the same direction as its active hitbox');release();
console.log('PASS: charged slash survives dash, attack artwork matches hit direction when turning.');

reset();const edges=[435,840,1260,1685,2090];let jumpUntil=0,retries=0;
for(let i=0;i<120*100;i++){
  const s=snap();if(s.player.x>=2760)break;
  if(s.mode==='dead'){assert(++retries<9);release();el('#start').click();jumpUntil=0;continue;}
  key('KeyD',true);key('KeyJ',s.player.x<2520&&i%28<4);
  const edge=edges.find(x=>x-s.player.x>0&&x-s.player.x<26);
  if(edge&&s.player.ground&&now>jumpUntil){jumpUntil=now+700;key('Space',true);}
  if(now>jumpUntil)key('Space',false);tick(1/120);
}
release();tick(.4);assert.equal(snap().combat.meter,100,'Attacks and pickups fill and cap the meter');
const bossBefore=snap().boss.hp;tap('KeyL');assert.equal(snap().combat.meter,0);assert.equal(snap().combat.ultimates,1);
tick(.85);assert(snap().boss.hp<=bossBefore-14,'Rainbow wave damages the boss');assert.equal(snap().combat.meter,0,'Ultimate hits cannot recharge themselves');
tap('KeyL');assert.equal(snap().combat.ultimates,1,'Cannot reuse spent meter');
console.log('PASS: earned meter/cap, ultimate consumption, boss damage and no self-refill.');
