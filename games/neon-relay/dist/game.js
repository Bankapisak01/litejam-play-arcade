/* LiteJam Play: Arcade — Neon Relay. Local gameplay with Punkman. */
(() => {
  'use strict';
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
  const $ = s => document.querySelector(s), W = 480, H = 270, END = 3180;
  // Keep the same game coordinates while retaining detail in the 128px artwork.
  canvas.width = W * 2; canvas.height = H * 2;
  ctx.setTransform(2,0,0,2,0,0);
  ctx.imageSmoothingEnabled = false;
  const keys = new Set(), pressed = new Set(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const color = { pink:'#ff4ca4', cyan:'#80f4df', white:'#f6e8ec', dark:'#100d1b' };
  let mode = 'ready', time = 0, elapsed = 0, camera = 0, player, enemies, shots, drops, particles, score, checkpoint, kills, boss;
  let soundOn = false, audio, shake = 0, noteTimer = 0, startTime = 0, best = 0, pageActive = true;
  const menu = $('#pause-menu');
  let menuOpen = false, menuReturnFocus = null;
  const fx=window.PunkmanFX;
  const bossArt=window.PunkmanBoss;
  let cinematic=null,cinemaEnabled=!reduced,vfxBursts=[],dashEchoes=[],bossClaws=[],practiceMode=false;
  const bossTransform=()=>boss?.state==='transform';
  const sceneScale=()=>bossTransform()?(boss.transitionDuration>1?.12:1):cinematic&&!cinematic.quick?(cinematic.launched?.45+.55*clamp((cinematic.time-cinematic.releaseAt)/(cinematic.duration-cinematic.releaseAt),0,1):.08):1;
  const sprites=Object.fromEntries(['walk','jump','dash','crouch','shoot','slash','special'].map(name=>[name,{image:new Image(),count:8,loaded:false}]));
  let spriteReady = false, spriteFailed = false;
  function loadSprite(){
    if(!pageActive)return;
    spriteReady=false;spriteFailed=false;$('#start').disabled=true;$('#start').textContent='Loading characters…';
    $('#practice').disabled=true;$('#restart').disabled=true;
    $('#status').textContent='Loading Punkman';
    for(const sprite of Object.values(sprites))sprite.loaded=false;
    for(const [name,sprite] of Object.entries(sprites))sprite.image.src=`assets/punkman-${name}-right.png`;
    fx.load(spritesLoaded,spritesFailed);
    bossArt.load(spritesLoaded,spritesFailed);
  }
  function spritesLoaded(){if(!pageActive||!fx.ready()||!bossArt.ready()||!Object.values(sprites).every(s=>s.loaded))return;spriteReady=true;spriteFailed=false;$('#start').disabled=false;$('#practice').disabled=false;$('#restart').disabled=false;$('#start').innerHTML='Start game <span>↗</span>';$('#status').textContent='Ready to relay';}
  function spritesFailed(){if(!pageActive)return;spriteReady=false;spriteFailed=true;$('#start').disabled=false;$('#start').textContent='Retry loading';$('#status').textContent='Images could not load. Select Retry loading.';}
  for(const sprite of Object.values(sprites)){
    sprite.image.onload=()=>{
      if(sprite.image.naturalWidth!==sprite.count*128||sprite.image.naturalHeight!==128){sprite.image.onerror();return;}
      sprite.loaded=true;
      spritesLoaded();
    };
    sprite.image.onerror=()=>{
      sprite.loaded=false;spritesFailed();
    };
  }
  try { best = Number(localStorage.getItem('punkman-best') || 0); } catch {}
  const platforms = [
    [0,238,435,40],[490,238,350,40],[895,238,365,40],[1315,238,370,40],
    [1740,238,350,40],[2150,238,1030,40],
    [255,197,85,9],[565,194,80,9],[690,154,72,9],[970,195,90,9],[1120,158,85,9],
    [1400,194,96,9],[1530,154,70,9],[1820,194,80,9],[1980,155,80,9],
    [2230,195,88,9],[2380,160,76,9],[2560,195,65,9]
  ].map(([x,y,w,h])=>({x,y,w,h}));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const hit = (a,b) => a.x < b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function label(text,x,y,c='#f1eee8',size=7){ctx.font=`bold ${size}px monospace`;ctx.fillStyle=c;ctx.fillText(text,Math.round(x),Math.round(y));}
  function poly(points,c){ctx.fillStyle=c;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
  function beep(freq=440,duration=.08,type='square',vol=.025,end=freq){
    if(!pageActive||!soundOn)return;
    try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(end,30),audio.currentTime+duration);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}
  }
  function burst(x,y,c,count=10){for(let i=0;i<count;i++)particles.push({x,y,vx:(Math.random()-.5)*140,vy:-Math.random()*120,life:.25+Math.random()*.4,c});}
  function notify(text){$('#notification').textContent=text;$('#notification').classList.add('show');noteTimer=3;}
  function makePlayer(x=45){return{x,y:180,w:14,h:30,vx:0,vy:0,face:1,hp:6,maxHp:6,ground:false,coyote:0,buffer:0,inv:0,fire:0,dash:0,dashCooldown:0,dashRecover:0,airTime:0,land:0,walk:0,walking:false,nextStep:1,
    dashEmit:0,crouch:false,crouchTime:0,shotHeld:false,slashHeld:false,shotCharge:0,slashCharge:0,pendingSlash:0,shootPose:0,attack:null,special:0,specialFace:1,meter:0,shotsFired:0,slashes:0,ultimates:0,ultimateWaves:0};}
  function clearCharge(){player.shotCharge=0;player.slashCharge=0;player.shotHeld=false;player.slashHeld=false;player.pendingSlash=0;}
  function clearInput(){
    keys.clear();pressed.clear();clearCharge();
    for(const button of document.querySelectorAll('[data-key]'))button.classList.remove('held');
  }
  function reset(){
    player=makePlayer();camera=0;elapsed=0;score=0;kills=0;checkpoint=45;shots=[];particles=[];vfxBursts=[];dashEchoes=[];bossClaws=[];practiceMode=false;cinematic=null;shake=0;
    enemies=[
      [365,220,'crawler'],[620,220,'crawler'],[760,178,'drone'],[1020,177,'turret'],[1195,220,'crawler'],
      [1470,176,'turret'],[1570,190,'drone'],[1845,220,'crawler'],[2020,137,'turret'],[2250,177,'turret'],[2460,185,'drone']
    ].map(([x,y,type],i)=>({x,y,baseY:y,w:type==='drone'?21:19,h:18,type,hp:type==='turret'?4:3,fire:1+i*.12,min:x-34,max:x+34,vx:i%2?17:-17,phase:i}));
    drops=[ [300,176],[590,173],[720,133],[980,174],[1150,137],[1440,173],[1550,133],[1860,173],[2000,134],[2260,174],[2410,139],[2595,174] ].map(([x,y])=>({x,y,w:8,h:10,type:'energy',taken:false}));
    drops.push({x:1300-65,y:222,w:10,h:10,type:'health',taken:false},{x:2520,y:222,w:10,h:10,type:'health',taken:false});
    for(const x of [180,400,790,1230,1650,2040,2490])drops.push({x,y:222,w:8,h:10,type:'energy',taken:false});
    boss=bossArt.create();
    $('#status').textContent='Ready to relay';
  }
  function setOverlay(title,description,action,kind){
    $('#overlay').hidden=false;$('#overlay-title').innerHTML=title;$('#overlay-description').textContent=description;$('#start').innerHTML=action+' <span>↗</span>';$('#overlay-label').textContent=kind;$('#start-hint').textContent='Press ENTER to continue';
    $('#start').focus({preventScroll:true});
  }
  function start(){
    if(!pageActive||document.hidden)return;
    if(!spriteReady){if(spriteFailed)loadSprite();return;}
    if(menuOpen){closeMenu(false,false);}
    clearInput();
    if(mode==='paused'){mode='playing';}
    else if(mode==='dead'){
      player=makePlayer(checkpoint);player.inv=2;shots=[];vfxBursts=[];dashEchoes=[];bossClaws=[];cinematic=null;camera=clamp(checkpoint-150,0,END-W);
      if(checkpoint>2000)boss=bossArt.create();
      mode='playing';notify('Back in action!');
    } else {reset();mode='playing';startTime=performance.now();}
    $('#overlay').hidden=true;canvas.focus({preventScroll:true});$('#status').textContent=checkpoint>2000?'Defeat Synth Drake and reach the gate':'Head right →';beep(330,.12,'triangle',.035,660);
  }
  function restart(){if(!pageActive||document.hidden||!spriteReady)return;closeMenu(false,false);mode='ready';start();}
  function practice(){if(!pageActive||document.hidden||!spriteReady)return;restart();practiceMode=true;checkpoint=2705;player=makePlayer(2735);player.y=208;player.ground=true;player.meter=100;enemies=[];drops=[];camera=clamp(player.x-150,0,END-W);$('#status').textContent='SYNTH DRAKE practice · RGB meter full';notify('SYNTH DRAKE · Watch the windup, then dodge!');noteTimer=1.2;}
  function openMenu(){
    if(!pageActive||menuOpen)return;
    menuReturnFocus=mode==='playing'||mode==='paused'?canvas:document.activeElement||canvas;
    if(mode==='playing')mode='paused';
    clearInput();menuOpen=true;
    $('#menu-title').textContent=mode==='paused'?'Take a breather.':'Make some noise.';
    $('#menu-description').textContent=mode==='paused'?'Your run is paused. Pick it up right where you left off.':'Set your sound, learn the moves, then bring the noise.';
    $('#menu-resume').textContent=mode==='paused'?'Resume game ↗':'Back to game ↗';
    menu.showModal();
  }
  function closeMenu(resume=true,restoreFocus=true){
    if(!menuOpen||!pageActive||(resume&&document.hidden))return;
    menuOpen=false;clearInput();
    if(menu.open)menu.close();
    if(resume&&mode==='paused')mode='playing';
    if(restoreFocus)(menuReturnFocus||canvas).focus({preventScroll:true});
  }
  function pause(){
    if(menuOpen)closeMenu();else openMenu();
  }
  function die(){if(mode!=='playing')return;mode='dead';cinematic=null;clearCharge();player.attack=null;player.special=0;beep(190,.5,'sawtooth',.04,35);setOverlay('SIGNAL<br><span>LOST.</span>','Out of energy. Try again from your last checkpoint.','Try again','RECONNECT');$('#status').textContent='Signal lost · Ready to retry';}
  function win(){mode='won';score+=1500;if(!practiceMode){best=Math.max(best,score);try{localStorage.setItem('punkman-best',String(best));}catch{}}beep(440,.25,'triangle',.05,880);setOverlay('CITY<br><span>ONLINE.</span>',`Stage clear! ${score.toLocaleString()} points · ${Math.floor(elapsed)} seconds · ${kills} enemies defeated`,'Play again','MISSION COMPLETE');$('#status').textContent='The city has its sound back';}
  function hurt(damage=1,dir=0){if(player.inv>0||mode!=='playing')return;player.hp-=damage;player.inv=1.2;player.vy=-130;player.vx=dir*85;shake=reduced?0:3;burst(player.x+7,player.y+15,color.pink,10);beep(120,.15,'sawtooth',.035,50);if(player.hp<=0)die();}
  const chargeLevel=value=>value>=1?2:value>=.4?1:0;
  function gainMeter(amount){const before=player.meter;player.meter=clamp(before+amount,0,100);if(before<100&&player.meter===100)notify('RGB SLASH ready! · Press L');}
  function fire(level=0){
    const p=player;if(p.fire>0||p.special>0||p.attack)return;
    const w=[10,18,27][level],h=[3,9,15][level];p.fire=.15;p.shootPose=.22;p.shotsFired++;
    shots.push({x:p.x+p.w/2+(p.face>0?21:-21-w),y:p.y+p.h-(p.crouch?10:18)-(h-3)/2,w,h,vx:p.face*(310+level*35),vy:0,life:1.25,team:'player',damage:[1,3,6][level],charge:level,kind:'shot',piercing:level===2,targets:new Set()});
    vfxBursts.push({x:p.x+p.w/2+p.face*23,y:p.y+p.h-(p.crouch?10:18),age:0,size:14+level*9});
    beep(880+level*180,.07+level*.04,'square',.018,210);
  }
  function slash(level=0){
    const p=player;if(p.attack||p.special>0||p.dash>0)return;
    p.slashes++;p.attack={time:0,duration:level? .38:.26,level,damage:[2,4,7][level],reach:[38,55,74][level],face:p.face,targets:new Set()};
    beep(280+level*100,.12,'sawtooth',.018,70);
    return true;
  }
  function ultimate(){
    const p=player;if(cinematic)return;if(bossTransform()){notify('Boss transforming · Wait for the energy shield to fade');return;}if(p.meter<100){notify('Collect energy or hit enemies to fill the meter first');return;}
    if(p.special>0||p.dash>0)return;
    p.meter=0;p.ultimates++;p.special=.55;p.specialFace=p.face;p.attack=null;clearCharge();p.inv=Math.max(p.inv,.65);
    noteTimer=0;$('#notification').classList.remove('show');
    if(p.crouch){p.y+=p.h-30;p.h=30;p.crouch=false;}
    const quick=!cinemaEnabled||reduced;
    cinematic={time:0,releaseAt:quick?.1:.9,duration:quick?.25:1.5,quick,launched:false,face:p.face,x:p.x,y:p.y,vy:p.vy,ground:p.ground};
    p.vx=0;p.vy=0;beep(165,.35,'triangle',.025,660);
  }
  function releaseUltimate(){
    const c=cinematic,p=player;if(!c||c.launched)return;c.launched=true;p.ultimateWaves++;p.special=.55;p.inv=Math.max(p.inv,.65);p.vy=c.vy;
    shots.push({x:p.x+p.w/2+(c.face>0?8:-40),y:p.y+p.h-70,w:32,h:70,vx:c.face*380,vy:0,life:1.3,team:'player',damage:14,charge:2,kind:'ultimate',piercing:true,targets:new Set()});
    vfxBursts.push({x:p.x+p.w/2+c.face*15,y:p.y+p.h-28,age:0,size:92});
    notify('RGB SLASH!');beep(220,.4,'sawtooth',.025,880);shake=c.quick?0:3;
  }
  function tickCinematic(dt){
    if(!cinematic)return;const c=cinematic;c.time+=dt;
    if(!c.launched&&(pressed.has('Space')||pressed.has('Enter'))){c.time=Math.max(c.time,c.releaseAt);for(const key of ['Space','Enter']){pressed.delete(key);keys.delete(key);}player.buffer=0;}
    if(c.time>=c.releaseAt)releaseUltimate();
    if(c.time>=c.duration)cinematic=null;
  }
  function damageTarget(target,damage,earn=true){
    if(target.hp<=0||(target===boss&&bossTransform()))return;const amount=Math.min(target.hp,damage);target.hp=Math.max(0,target.hp-damage);
    if(earn)gainMeter(amount*3);burst(target.x+target.w/2,target.y+target.h/2,color.cyan,5);
    vfxBursts.push({x:target.x+target.w/2,y:target.y+target.h/2,age:0,size:damage>=7?58:damage>=3?42:27});
    if(target===boss){if(bossArt.hit(boss)){boss.transitionDuration=reduced||!cinemaEnabled?.45:1.7;bossClaws=[];for(const s of shots)if(s.owner==='boss')s.life=0;player.inv=Math.max(player.inv,.1);noteTimer=0;$('#notification').classList.remove('show');$('#status').textContent='PHASE II · OVERDRIVE — Jump over SONIC QUAKE';beep(100,.45,'sawtooth',.025,440);}if(!boss.hp){bossArt.defeat(boss);bossClaws=[];for(const s of shots)if(s.owner==='boss')s.life=0;burst(boss.x+40,boss.y+38,color.pink,25);notify('DRAKE DOWN · Reach the gate on the right →');$('#status').textContent='Synth Drake defeated · Reach the gate on the right →';beep(180,.45,'sawtooth',.04,30);}}
    else if(!target.hp){score+=100;kills++;if(earn)gainMeter(8);burst(target.x+9,target.y+9,color.pink,14);beep(90,.14,'sawtooth',.025,35);}
  }
  function combatInput(dt){
    const p=player,shoot=keys.has('KeyJ')||keys.has('KeyZ'),melee=keys.has('KeyX');
    if(cinematic&&!cinematic.launched){p.special=.55;return;}
    const beforeLevel=chargeLevel(Math.max(p.shotCharge,p.slashCharge));
    p.shootPose=Math.max(0,p.shootPose-dt);p.special=Math.max(0,p.special-dt);
    if(p.attack){p.attack.time+=dt;if(p.attack.time>=p.attack.duration)p.attack=null;}
    if(pressed.has('KeyL'))ultimate();
    if(p.special<=0){
      if(!p.shotHeld&&(shoot||pressed.has('KeyJ')||pressed.has('KeyZ')))fire();
      if(!p.slashHeld&&(melee||pressed.has('KeyX')))slash();
      if(!shoot&&p.shotHeld&&chargeLevel(p.shotCharge))fire(chargeLevel(p.shotCharge));
      if(!melee&&p.slashHeld&&chargeLevel(p.slashCharge))p.pendingSlash=chargeLevel(p.slashCharge);
      if(p.pendingSlash&&slash(p.pendingSlash))p.pendingSlash=0;
      p.shotCharge=shoot&&!melee?Math.min(1.2,p.shotCharge+dt):0;
      p.slashCharge=melee?Math.min(1.2,p.slashCharge+dt):0;
    }
    p.shotHeld=shoot;p.slashHeld=melee;
    const afterLevel=chargeLevel(Math.max(p.shotCharge,p.slashCharge));
    if(afterLevel>beforeLevel)beep(afterLevel===2?1100:660,.09,'triangle',.025);
  }
  function meleeHits(){
    const p=player,a=p.attack;if(!a||a.time<a.duration*.3||a.time>a.duration-.065)return;
    const zone={x:a.face>0?p.x+p.w/2:p.x+p.w/2-a.reach,y:p.y+p.h-(p.crouch?24:42),w:a.reach,h:p.crouch?24:42};
    for(const target of [...enemies,...(boss.active?[boss]:[])])if(target.hp>0&&!a.targets.has(target)&&hit(zone,target)){a.targets.add(target);damageTarget(target,a.damage);}
    for(const shot of shots)if(shot.team==='enemy'&&hit(zone,shot))shot.life=0;
  }
  function enemyShot(e,angle=0,speed=95){let dx=player.x+7-(e.x+e.w/2),dy=player.y+player.h/2-(e.y+e.h/2),a=Math.atan2(dy,dx)+angle;shots.push({x:e.x+e.w/2,y:e.y+e.h/2,w:5,h:5,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:5,team:'enemy'});}
  function bossEvents(dt){
    for(const event of bossArt.tick(boss,dt,player)){
      if(event.kind==='breath'){
        const m=bossArt.mouth(boss),a=Math.atan2(clamp(player.y+player.h/2-m.y,-40,75),event.face*Math.max(60,Math.abs(player.x+7-m.x)));
        for(const spread of [-.15,0,.15])shots.push({x:m.x-5,y:m.y-5,w:10,h:10,vx:Math.cos(a+spread)*event.speed,vy:Math.sin(a+spread)*event.speed,life:3.2,team:'enemy',owner:'boss',kind:'sonic'});
        vfxBursts.push({x:m.x,y:m.y,age:0,size:35});beep(130,.18,'sawtooth',.02,70);
      }else if(event.kind==='claw'){
        bossClaws.push({...event.zone,face:event.face,age:0});if(hit(player,event.zone))hurt(2,event.face);beep(230,.18,'sawtooth',.025,50);
      }else if(event.kind==='quake'){
        for(const face of [-1,1])shots.push({x:boss.x+boss.w/2+face*45-13,y:210,w:26,h:28,vx:face*180,vy:0,life:2.8,team:'enemy',owner:'boss',kind:'quake'});
        vfxBursts.push({x:boss.x+boss.w/2,y:232,age:0,size:76});shake=reduced?0:2;beep(80,.13,'sawtooth',.025,40);
      }else if(event.kind==='phaseBurst'){
        vfxBursts.push({x:boss.x+boss.w/2,y:boss.y+boss.h/2,age:0,size:reduced?65:150});if(!reduced)burst(boss.x+40,boss.y+38,color.cyan,28);beep(220,.3,'triangle',.025,880);
      }else if(event.kind==='deathBurst'){
        vfxBursts.push({x:boss.x+15+event.index*25,y:boss.y+25+(event.index%2)*20,age:0,size:65});burst(boss.x+40,boss.y+30,color.cyan,12);
      }
    }
  }
  function update(dt){
    const realDt=dt;
    if(noteTimer>0){noteTimer-=dt;if(noteTimer<=0)$('#notification').classList.remove('show');}
    if(mode!=='playing'){pressed.clear();return;}
    if(!bossTransform()||cinematic?.launched)tickCinematic(realDt);dt*=sceneScale();time+=dt;
    if(bossTransform())player.inv=Math.max(player.inv,.15);
    const locked=cinematic&&!cinematic.launched;
    elapsed+=realDt;let p=player,oldY=p.y,oldX=p.x,wasGround=p.ground,wasDash=p.dash;
    p.inv=Math.max(0,p.inv-dt);p.fire=Math.max(0,p.fire-dt);p.dashCooldown=Math.max(0,p.dashCooldown-dt);p.dash=Math.max(0,p.dash-dt);p.coyote=p.ground?.1:Math.max(0,p.coyote-dt);p.buffer=Math.max(0,p.buffer-dt);
    p.land=Math.max(0,p.land-dt);p.dashRecover=Math.max(0,p.dashRecover-dt);
    if(wasDash>0&&p.dash===0)p.dashRecover=.08;
    const left=!locked&&(keys.has('KeyA')||keys.has('ArrowLeft')),right=!locked&&(keys.has('KeyD')||keys.has('ArrowRight'));
    if(!locked&&(pressed.has('Space')||pressed.has('KeyW')||pressed.has('ArrowUp')))p.buffer=.12;
    if(left!==right)p.face=left?-1:1;
    if(!locked&&(pressed.has('KeyK')||pressed.has('ShiftLeft'))&&p.dashCooldown===0){p.dash=.14;p.dashCooldown=.7;p.dashRecover=0;p.dashEmit=.03;vfxBursts.push({x:p.x+p.w/2-p.face*9,y:p.y+p.h-12,age:0,size:reduced?24:38});beep(180,.12,'sawtooth',.014,500);}
    p.crouch=(keys.has('KeyS')||keys.has('ArrowDown'))&&p.ground&&p.dash===0&&p.buffer===0&&p.special===0;
    p.crouchTime=p.crouch?p.crouchTime+dt:0;
    const height=p.crouch?19:30;if(height!==p.h){p.y+=p.h-height;p.h=height;oldY=p.y;}
    if(p.dash>0){p.vx=p.face*275;p.vy=0;}else p.vx=p.crouch||left===right?0:(left?-108:108);
    if(p.buffer>0&&p.coyote>0){p.vy=-270;p.buffer=0;p.coyote=0;p.ground=false;beep(220,.12,'square',.015,660);}
    if(!(keys.has('Space')||keys.has('KeyW')||keys.has('ArrowUp'))&&p.vy< -120)p.vy+=850*dt;
    p.vy=Math.min(380,p.vy+650*dt);p.x=clamp(p.x+p.vx*dt,0,END-p.w);
    for(const f of platforms)if(f.h>10&&hit(p,f)){if(p.vx>0)p.x=f.x-p.w;else if(p.vx<0)p.x=f.x+f.w;}
    p.y+=p.vy*dt;p.ground=false;
    for(const f of platforms)if(hit(p,f)&&p.vy>=0&&oldY+p.h<=f.y+3){p.y=f.y-p.h;p.vy=0;p.ground=true;}
    if(locked){p.x=cinematic.x;p.y=cinematic.y;p.vy=0;p.ground=cinematic.ground;p.buffer=0;p.inv=Math.max(p.inv,.1);}
    p.airTime=p.ground?0:p.airTime+dt;
    if(p.ground&&!wasGround)p.land=.12;
    const walking=p.ground&&p.dash<=0&&Math.abs(p.x-oldX)>.001;
    // Start with a lifted foot on the first input frame. Short taps alternate feet;
    // reversing while moving preserves the cycle. A blocked character stays idle.
    if(walking){
      if(!p.walking){p.walk=p.nextStep;p.nextStep=p.nextStep===1?5:1;}
      p.walk=(p.walk+Math.abs(p.x-oldX)*16/108)%8;
    }
    p.walking=walking;
    if(p.dash>0&&!reduced&&Math.abs(p.x-oldX)>.001){p.dashEmit+=dt;if(p.dashEmit>=.03){p.dashEmit-=.03;const pose=playerAnimation();dashEchoes.push({x:p.x+p.w/2,y:p.y+p.h,face:p.face,state:pose.state,frame:pose.frame,age:0});}}
    if(p.y>H+55){die();return;}
    if(p.x>1605&&checkpoint<1605){checkpoint=1610;p.hp=6;notify('CHECKPOINT · Health restored');beep(660,.15,'triangle',.03,990);}
    if(p.x>2700&&checkpoint<2700){checkpoint=2705;p.hp=6;notify('SYNTH DRAKE · Watch for sonic blasts and claws');}
    camera=clamp(p.x-150,0,END-W);
    combatInput(dt);
    for(const e of enemies){
      if(e.hp<=0||Math.abs(e.x-p.x)>480)continue;
      if(e.type==='crawler'){e.x+=e.vx*dt;if(e.x<e.min||e.x>e.max)e.vx*=-1;}
      if(e.type==='drone')e.y=e.baseY+Math.sin(time*2+e.phase)*15;
      e.fire-=dt;if(e.type!=='crawler'&&e.fire<=0&&Math.abs(e.x-p.x)<330){enemyShot(e);e.fire=e.type==='drone'?2.2:1.7;}
      if(hit(p,e))hurt(1,Math.sign(p.x-e.x));
    }
    if(p.x>2670&&!boss.dead&&!boss.active){boss.active=true;boss.clock=0;}
    bossEvents(bossTransform()?realDt:dt);if(boss.active&&!bossTransform()&&hit(p,boss))hurt(2,Math.sign(p.x-boss.x));
    meleeHits();
    for(const s of shots){
      // Preserve an already committed ultimate until the phase shield opens.
      if(s.kind==='ultimate'&&bossTransform())continue;
      s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
      if(s.team==='player'){
        for(const target of [...enemies,...(boss.active?[boss]:[])])if(target.hp>0&&s.life>0&&!s.targets.has(target)&&hit(s,target)){s.targets.add(target);damageTarget(target,s.damage,s.kind!=='ultimate');if(!s.piercing)s.life=0;}
        if(s.kind==='ultimate')for(const other of shots)if(other.team==='enemy'&&hit(s,other))other.life=0;
      }else if(s.life>0&&hit(s,p)){s.life=0;hurt(1,Math.sign(s.vx));}
      if(s.kind!=='ultimate'&&platforms.some(f=>hit(s,f)))s.life=0;
    }
    shots=shots.filter(s=>s.life>0);
    for(const d of drops)if(!d.taken&&hit(p,d)){d.taken=true;if(d.type==='health'){p.hp=Math.min(6,p.hp+3);notify('Health +3');}else{score+=25;gainMeter(20);}burst(d.x+4,d.y+5,color.cyan,6);beep(900,.09,'triangle',.025,1400);}
    for(const z of particles){z.life-=dt;z.x+=z.vx*dt;z.y+=z.vy*dt;z.vy+=240*dt;}particles=particles.filter(z=>z.life>0);shake=Math.max(0,shake-dt*18);
    for(const effect of vfxBursts)effect.age+=dt;vfxBursts=vfxBursts.filter(effect=>effect.age<.34).slice(-40);
    for(const echo of dashEchoes)echo.age+=dt;dashEchoes=dashEchoes.filter(echo=>echo.age<.18).slice(-6);
    for(const claw of bossClaws)claw.age+=dt;bossClaws=bossClaws.filter(claw=>claw.age<.3);
    if(p.x>3115&&boss.dead)win();
    pressed.clear();
  }
  function skyline(){
    rect(0,0,W,H,'#141328');
    for(let i=0;i<7;i++)rect(0,30+i*28,W,28,['#19162f','#1c1733','#241939','#2c1c40','#342044','#3c2248','#45244b'][i]);
    rect(362-camera*.04,33,33,33,'#c76c95');rect(356-camera*.04,42,45,15,'#c76c95');
    for(let layer=0;layer<3;layer++){
      const step=[60,49,72][layer],parallax=[.12,.25,.45][layer],base=[205,228,245][layer];
      for(let i=-2;i<Math.ceil(END/step)+2;i++){
        const x=Math.floor(i*step-camera*parallax),bh=35+((i*31+layer*19)%85+85)%85,bw=step-5;if(x>W+10||x+bw<0)continue;
        rect(x,base-bh,bw,bh,['#272039','#201b32','#171827'][layer]);rect(x+3,base-bh-5,bw-9,5,['#322440','#2b2340','#242137'][layer]);
        if(i%3===0){rect(x+9,base-bh-22,2,20,'#39304a');rect(x+8,base-bh-23,4,2,color.pink);}
        for(let row=0;row<7;row++)for(let col=0;col<4;col++)if((i+row*3+col*7)%4===0)rect(x+6+col*10,base-bh+9+row*12,3,4,layer===1?'#6f4a75':'#473251');
        if(layer===1&&i%4===1){rect(x+8,base-bh+12,27,13,'#66345c');label('NOISE',x+10,base-bh+21,'#d982ae',6);}
      }
    }
    ctx.strokeStyle='#45334e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,110);ctx.quadraticCurveTo(240,149,480,113);ctx.stroke();
    for(let i=0;i<8;i++)rect((i*67-camera*.2)%540,128+(i%3)*5,3,2,'#dd568f');
    if(!reduced)for(let i=0;i<18;i++){const x=(i*53+time*10)%W,y=(i*41+time*21)%H;rect(x,y,1,2,'#77667c');}
  }
  function drawPlatform(f){
    if(f.x+f.w<camera||f.x>camera+W)return;
    rect(f.x,f.y,f.w,f.h,'#252538');rect(f.x,f.y,f.w,3,'#77969e');rect(f.x,f.y+3,f.w,3,'#3d5864');rect(f.x,f.y+6,f.w,2,'#141b2a');
    for(let x=f.x+5;x<f.x+f.w-6;x+=22){rect(x,f.y+11,17,2,'#3c354a');rect(x,f.y+13,2,8,'#3c354a');}
    if(f.h>15){rect(f.x,f.y+f.h-7,f.w,2,'#593c57');for(let x=f.x;x<f.x+f.w;x+=32){rect(x,f.y+2,9,2,color.cyan);}}
  }
  function playerAnimation(){
    const p=player;
    if(cinematic&&!cinematic.launched)return{state:'special',frame:Math.min(3,Math.floor(cinematic.time/cinematic.releaseAt*4))};
    if(p.special>0)return{state:'special',frame:Math.min(7,Math.floor((.55-p.special)/.55*8))};
    if(p.attack&&!p.crouch)return{state:'slash',frame:Math.min(7,Math.floor(p.attack.time/p.attack.duration*8))};
    if(p.dash>0)return{state:'dash',frame:Math.min(5,Math.floor((.14-p.dash)/.14*6))};
    if(p.crouch)return{state:'crouch',frame:Math.min(3,Math.floor(p.crouchTime*24))};
    if(p.shootPose>0)return{state:'shoot',frame:Math.min(7,Math.floor((.22-p.shootPose)/.22*8))};
    // Use velocity for jump phases so short hops, long jumps and falling off ledges
    // all show the right pose. Never delay movement for anticipation or recovery.
    if(!p.ground)return{state:'jump',frame:p.vy>=80?5:p.vy>=-30?4:p.airTime<.055?0:p.airTime<.12?1:p.vy< -130?2:3};
    if(p.walking)return{state:'walk',frame:Math.floor(p.walk)%8};
    if(p.slashCharge>.15)return{state:'slash',frame:1};
    if(p.shotCharge>.15)return{state:'shoot',frame:1};
    if(p.dashRecover>0)return{state:'dash',frame:p.dashRecover>.04?6:7};
    if(p.land>0)return{state:'jump',frame:p.land>.06?6:7};
    return{state:'idle',frame:0};
  }
  function drawDash(){
    if(!spriteReady)return;
    for(const echo of dashEchoes){ctx.save();ctx.translate(Math.round(echo.x),Math.round(echo.y));ctx.scale(echo.face,1);ctx.globalAlpha=.36*(1-echo.age/.18);ctx.globalCompositeOperation='screen';ctx.drawImage(sprites[echo.state==='idle'?'walk':echo.state].image,echo.frame*128,0,128,128,-24,-44.25,48,48);ctx.restore();}
    const p=player;if(p.dash>0||p.dashRecover>0){const active=p.dash>0;fx.draw(ctx,'dash',p.x+p.w/2-p.face*34,p.y+p.h-20,110,100,reduced?3:active?(1-p.dash/.14)*7:7,p.face,active?(reduced?.65:.95):p.dashRecover/.08*.5);}
  }
  function drawPlayer(){
    const p=player;if(!spriteReady||(p.inv>0&&p.special===0&&Math.floor(time*14)%2))return;
    const charge=Math.max(p.shotCharge,p.slashCharge),level=chargeLevel(charge),focus=cinematic&&!cinematic.launched;
    if(charge>.15||focus){
      const size=focus?66+cinematic.time/cinematic.releaseAt*17:level===2?63:level===1?51:39;
      fx.draw(ctx,'charge',p.x+p.w/2,p.y+p.h-21,size,size,reduced?0:Math.floor((focus?cinematic.time:time)*18)%8,1,focus||level===2?.9:.6);
    }
    ctx.save();ctx.translate(Math.round(p.x+p.w/2),Math.round(p.y+p.h));ctx.scale(p.attack?p.attack.face:p.special>0?p.specialFace:p.face,1);
    // Every frame shares the same 128px cell and floor anchor (64,118).
    const pose=playerAnimation(),sprite=sprites[pose.state==='idle'?'walk':pose.state];
    ctx.drawImage(sprite.image,pose.frame*128,0,128,128,-24,-44.25,48,48);
    ctx.restore();
    if(charge>.15){
      const cx=p.x+p.w/2,c=level===2?color.cyan:color.pink;
      rect(cx-16,p.y-11,32,3,'#261b35');rect(cx-16,p.y-11,32*Math.min(1,charge),3,c);
      label((p.slashCharge>0?'SLASH':'SHOT')+(level===2?' II':level===1?' I':''),cx-16,p.y-15,c,5);
    }
  }
  const rainbow=['#ff50c9','#ad62ff','#578fff','#4effdc','#d8ff65','#fff0b3'];
  function drawCombat(){
    const p=player,a=p.attack;
    if(a&&a.time>=a.duration*.2){
      const progress=clamp((a.time/a.duration-.2)/.8,0,1),size=a.reach*1.45;
      fx.draw(ctx,a.level===2?'ultimate':'slash',p.x+p.w/2+a.face*(a.reach-size*.39),p.y+p.h-(p.crouch?12:23),size,p.crouch?size*.65:size,a.level===2?Math.floor(time*18)%8:progress*7,a.face,a.level===2?Math.sin(progress*Math.PI):1);
    }
    for(const s of shots){
      if(s.team==='enemy'){if(s.kind==='sonic')fx.draw(ctx,'boss-breath',s.x+s.w/2-Math.sign(s.vx)*14,s.y+s.h/2,43,43,Math.floor(time*18)%8,-Math.sign(s.vx));else if(s.kind==='quake')fx.draw(ctx,'boss-quake',s.x+s.w/2,s.y+s.h/2,40,40,reduced?0:Math.floor(time*18)%8,Math.sign(s.vx));else{rect(s.x,s.y,s.w,s.h,'#ffae72');rect(s.x+1,s.y+1,Math.max(1,s.w-2),1,color.white);}continue;}
      const face=Math.sign(s.vx),size=s.kind==='ultimate'?106:s.charge===2?73:s.charge===1?51:31;
      const name=s.kind==='ultimate'?'ultimate':s.charge?'charged-bolt':'bolt',cx=face>0?s.x+s.w-size*.37:s.x+size*.37,cy=s.y+s.h/2,f=Math.floor(time*18)%8;
      if(s.charge&&!reduced)for(let i=2;i>0;i--)fx.draw(ctx,name,cx-face*i*12,cy,size,size,f,face,.14/i);
      fx.draw(ctx,name,cx,cy,size,size,f,face);
    }
    for(const effect of vfxBursts)fx.draw(ctx,'impact',effect.x,effect.y,effect.size,effect.size,effect.age/.34*8);
    for(const claw of bossClaws)fx.draw(ctx,'boss-claw',claw.x+claw.w/2,claw.y+claw.h/2,90,76,claw.age/.3*8,-claw.face);
  }
  function drawEnemy(e){
    if(e.hp<=0)return;const x=Math.round(e.x),y=Math.round(e.y);
    if(e.type==='drone'){rect(x-3,y+5,5,3,'#9c6eab');rect(x+19,y+5,5,3,'#9c6eab');rect(x+2,y+2,17,11,'#67537f');rect(x+4,y,13,3,'#b3a0c1');rect(x+5,y+5,11,4,'#251d3b');rect(x+9,y+5,4,3,color.pink);rect(x+6,y+14,9,2,color.cyan);if(Math.floor(time*12)%2)rect(x+8,y+17,5,3,'#5a9e9c');}
    else if(e.type==='turret'){rect(x+2,y+11,17,7,'#80718d');rect(x+4,y,13,13,'#504963');rect(x+3,y+2,15,3,'#a08ea6');rect(x-4,y+6,14,4,'#aaa1b9');rect(x+10,y+6,4,4,color.pink);rect(x,y+16,20,2,'#b5a4bb');}
    else{const k=Math.floor(time*7)%2;rect(x+1,y+7,17,8,'#655072');rect(x+3,y+2,13,9,'#a08ba7');rect(x+5,y,9,3,'#d5b4c9');rect(x+4,y+5,11,3,'#35192f');rect(x+5,y+6,3,1,'#ffae72');rect(x+12,y+6,3,1,'#ffae72');rect(x+k*2,y+15,6,3,'#3a2b4b');rect(x+12-k*2,y+15,6,3,'#3a2b4b');}
  }
  function drawBoss(){
    if(boss.x+boss.w<camera-60||boss.x>camera+W+60)return;
    if(boss.phase===2&&!boss.dead){const transforming=bossTransform(),progress=transforming?boss.clock/boss.transitionDuration:0,size=transforming?105+progress*110:143;fx.draw(ctx,'boss-overdrive',boss.x+boss.w/2,boss.y+boss.h/2,size,size,reduced?0:Math.floor((transforming?boss.clock:time)*14)%8,1,transforming?.7:reduced?.12:.22);}
    bossArt.draw(ctx,boss);
    if(boss.active&&boss.state==='charge'){
      const m=bossArt.mouth(boss),progress=boss.clock/bossArt.windup(boss),size=30+progress*23;
      if(boss.attack==='stomp'){fx.draw(ctx,'boss-quake',boss.x+boss.w/2,230,55+progress*45,20,reduced?0:Math.floor(time*18)%8,1,.6);label('SONIC QUAKE - JUMP!',boss.x-26,boss.y-15,'#ffd381',6);}
      else{fx.draw(ctx,'boss-charge',m.x,m.y,size,size,reduced?0:Math.floor(time*18)%8);label(boss.attack==='claw'?'CLAW STRIKE':'SONIC BREATH',boss.x+3,boss.y-9,color.cyan,6);}
    }
  }
  function drawWorld(){
    ctx.save();ctx.translate(-Math.round(camera),0);
    // Rooftop details and checkpoint beacons.
    for(const x of [190,790,1100,1350,1700,2320,2630]){rect(x,214,18,24,'#302a42');rect(x+2,214,14,2,'#7d697e');for(let y=220;y<232;y+=4)rect(x+4,y,10,1,'#514058');}
    for(const x of [1610,2705]){rect(x,202,3,36,'#86748e');rect(x+3,202,18,12,checkpoint>=x?'#3c8e86':'#662c61');rect(x+6,206,10,3,checkpoint>=x?color.cyan:color.pink);}
    rect(3107,172,45,66,'#544360');rect(3111,176,37,62,'#111021');rect(3114,180,31,58,boss.dead?'#153d43':'#2f1836');rect(3112,175,35,3,boss.dead?color.cyan:color.pink);rect(3112,178,3,60,boss.dead?color.cyan:color.pink);rect(3144,178,3,60,boss.dead?color.cyan:color.pink);label('RELAY',3114,168,color.white,6);
    for(const f of platforms)drawPlatform(f);
    for(const d of drops){if(d.taken)continue;const y=d.y+Math.sin(time*3+d.x)*2;if(d.type==='health'){rect(d.x,y,10,10,'#253d3a');rect(d.x+4,y+1,2,8,color.cyan);rect(d.x+1,y+4,8,2,color.cyan);}else{poly([[d.x+4,y],[d.x+8,y+5],[d.x+4,y+10],[d.x,y+5]],color.cyan);rect(d.x+3,y+3,2,4,'#effff4');}}
    enemies.forEach(drawEnemy);drawBoss();drawDash();drawPlayer();
    drawCombat();
    for(const z of particles)rect(z.x,z.y,2,2,z.c);
    ctx.restore();
  }
  function hud(){
    rect(10,9,111,25,'#100d1bdd');label('PUNKMAN',16,19,color.white,7);for(let i=0;i<6;i++){rect(16+i*15,23,12,5,i<player.hp?color.pink:'#4b324f');if(i<player.hp)rect(16+i*15,23,12,1,'#ffb3d8');}
    rect(10,36,111,19,'#100d1bdd');label(player.meter===100?'RGB READY [L]':'RGB '+Math.floor(player.meter)+'/100',16,44,player.meter===100?color.cyan:'#bba9c6',6);
    rect(16,48,96,3,'#4b324f');rect(16,48,96*player.meter/100,3,player.meter===100?color.cyan:color.pink);
    label('SCORE',W-90,17,'#bba9c6',6);label(String(score).padStart(6,'0'),W-55,17,color.white,8);
    label('BEST '+String(best).padStart(6,'0'),W-90,29,'#bba9c6',6);
    rect(145,13,170,3,'#483346');rect(145,13,Math.min(170,player.x/END*170),3,color.cyan);label(boss.dead?'RELAY OPEN':'ROOFTOP DISTRICT',178,26,'#bba9c6',6);
    if(boss.active){rect(150,38,180,19,'#130d20dd');label(boss.phase===2?'SYNTH DRAKE II - OVERDRIVE':'SYNTH DRAKE I',boss.phase===2?164:185,46,boss.phase===2?'#ffd381':color.pink,6);rect(156,50,168,3,'#493248');rect(156,50,168*boss.hp/boss.maxHp,3,boss.phase===2?'#ff8b60':color.pink);}
    if(mode==='playing'&&elapsed<7)label('S CROUCH  J SHOT  X SLASH  HOLD TO CHARGE  L RGB',85,H-12,'#e8dfef',6);
  }
  function drawCinematic(){
    const c=cinematic;if(!c||bossTransform())return;
    if(c.quick){rect(151,64,178,23,'#130b25dd');label('RGB SLASH',186,80,color.cyan,13);return;}
    const fade=c.launched?clamp(1-(c.time-c.releaseAt)/.6,0,1):1;
    ctx.save();ctx.globalAlpha=fade*.55;rect(0,0,W,H,'#100820');ctx.restore();
    rect(0,0,W,Math.round(17*fade),'#090612');rect(0,H-Math.round(17*fade),W,Math.round(17*fade),'#090612');
    if(c.time>.12&&!c.launched){
      const enter=clamp((c.time-.12)/.13,0,1),leave=clamp((c.releaseAt-c.time)/.12,0,1),offset=-90*(1-enter)*(1-enter);
      ctx.save();ctx.globalAlpha=leave;ctx.beginPath();ctx.rect(0,56,W,158);ctx.clip();
      rect(0,56,W,158,'#24023d');fx.cutin(ctx,offset-8,53,350,175,leave);
      for(let i=0;i<6;i++)rect(184+i*46,57,44,2,rainbow[i]);
      label('CHROMATIC OVERDRIVE',218+offset*.3,101,color.cyan,8);
      label('RGB',216+offset*.3,142,'#361346',31);label('RGB',213+offset*.3,139,color.white,31);
      label('SLASH',216+offset*.3,178,'#361346',31);label('SLASH',213+offset*.3,175,color.pink,31);
      label('P U N K M A N',216,198,'#e0b7e9',7);ctx.restore();
      label('SPACE / ENTER : SKIP',181,239,'#d8c7e7',6);
    }
    if(c.launched&&c.time-c.releaseAt<.12){ctx.save();ctx.globalAlpha=.13*(1-(c.time-c.releaseAt)/.12);rect(0,0,W,H,'#f9b4e9');ctx.restore();}
  }
  function drawBossTransition(){
    if(!bossTransform())return;
    const progress=clamp(boss.clock/boss.transitionDuration,0,1),calm=boss.transitionDuration<1;
    if(calm){rect(145,67,190,25,'#170c2ddd');label('PHASE II : OVERDRIVE',157,84,'#ffd381',10);return;}
    const fade=Math.min(1,progress/.15,(1-progress)/.18);
    ctx.save();ctx.globalAlpha=fade*.5;rect(0,0,W,H,'#10081f');ctx.restore();
    rect(0,0,W,16*fade,'#080611');rect(0,H-16*fade,W,16*fade,'#080611');
    if(progress>.12&&progress<.78){
      const enter=clamp((progress-.12)/.12,0,1),leave=clamp((.78-progress)/.12,0,1),offset=-65*(1-enter);
      ctx.save();ctx.globalAlpha=leave;ctx.beginPath();ctx.rect(0,53,W,158);ctx.clip();rect(0,53,W,158,'#300949');
      fx.cutin(ctx,offset-8,49,350,175,1,'bossCutin');rect(188,55,276,2,'#ff50c9');rect(188,207,276,2,'#80f4df');
      label('SYNTH DRAKE',218+offset*.3,88,color.cyan,10);label('PHASE II',215+offset*.3,121,'#fff1d5',23);
      label('OVERDRIVE',214+offset*.3,154,'#ff77c5',24);label('SONIC QUAKE // JUMP TO DODGE',214,181,'#ffd381',6);ctx.restore();
    }
  }
  function render(){
    ctx.save();
    if(cinematic&&!cinematic.quick&&!bossTransform()){const c=cinematic,amount=c.launched?clamp(1-(c.time-c.releaseAt)/.6,0,1):clamp(c.time/.3,0,1),zoom=1+amount*.12,cx=clamp(player.x-camera+7,50,W-50),cy=player.y+12;ctx.translate(cx,cy);ctx.scale(zoom,zoom);ctx.translate(-cx,-cy);}
    else if(bossTransform()&&boss.transitionDuration>1){const amount=Math.sin(clamp(boss.clock/boss.transitionDuration,0,1)*Math.PI),zoom=1+amount*.1,cx=clamp(boss.x+boss.w/2-camera,80,W-80);ctx.translate(cx,190);ctx.scale(zoom,zoom);ctx.translate(-cx,-190);}
    if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);skyline();drawWorld();ctx.restore();hud();drawCinematic();drawBossTransition();
  }
  const gameKeys=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyA','KeyD','KeyW','KeyS','KeyJ','KeyZ','KeyX','KeyL','KeyK','ShiftLeft','KeyP','KeyR','KeyM','Enter','Escape']);
  window.addEventListener('keydown',e=>{
    if(!pageActive||!gameKeys.has(e.code)||e.ctrlKey||e.metaKey||e.altKey)return;
    const editing=e.target?.isContentEditable||e.target?.closest?.('input,select,textarea');
    // Escape belongs to the native dialog cancel event. Other menu keys never
    // reach the simulation, including events from buttons and non-form content.
    if(menuOpen){
      if(e.code==='Escape'&&e.repeat)e.preventDefault();
      if(e.code==='KeyP'&&!editing){e.preventDefault();if(!e.repeat)closeMenu();}
      return;
    }
    if(editing)return;
    if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();if(!e.repeat)openMenu();return;}
    if(e.target?.closest?.('a,button'))return;
    e.preventDefault();if(e.repeat)return;
    if(e.code==='KeyR'){restart();return;}if(e.code==='KeyM'){$('#sound').click();return;}
    if(e.code==='Enter'&&mode!=='playing'){start();return;}
    if(mode!=='playing')return;
    if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code);
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);});
  window.addEventListener('blur',()=>{clearInput();if(mode==='playing')openMenu();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(mode==='playing')openMenu();}});
  window.addEventListener('pagehide',()=>{
    if(!pageActive)return;
    pageActive=false;spriteReady=false;clearInput();cinematic=null;
    if(mode==='playing')mode='paused';
    $('#start').disabled=true;$('#practice').disabled=true;$('#restart').disabled=true;
    try{audio?.close().catch(()=>{});}catch{}
  });
  window.addEventListener('pageshow',e=>{if(e.persisted)window.location.reload();});
  $('#start').addEventListener('click',start);$('#pause').addEventListener('click',pause);$('#fullscreen-pause').addEventListener('click',pause);$('#restart').addEventListener('click',restart);
  $('#menu-resume').addEventListener('click',()=>closeMenu());$('#menu-close').addEventListener('click',()=>closeMenu());
  menu.addEventListener('cancel',e=>{e.preventDefault();closeMenu();});
  // A queued close event may arrive after another menu was opened.
  menu.addEventListener('close',()=>{if(!menu.open)closeMenu();});
  $('#practice').addEventListener('click',practice);
  function cinemaLabel(){$('#cinema').textContent=cinemaEnabled?'CINEMA ON':'CINEMA OFF';$('#cinema').setAttribute('aria-pressed',String(cinemaEnabled));}
  $('#cinema').addEventListener('click',()=>{cinemaEnabled=!cinemaEnabled;cinemaLabel();if(mode==='playing')canvas.focus({preventScroll:true});});cinemaLabel();
  $('#sound').addEventListener('click',()=>{soundOn=!soundOn;$('#sound').textContent=soundOn?'SOUND ON':'SOUND OFF';$('#sound').setAttribute('aria-pressed',String(soundOn));$('#sound').setAttribute('aria-label',soundOn?'Mute sound':'Enable sound');if(soundOn)beep(440,.1,'triangle',.03,660);if(mode==='playing')canvas.focus({preventScroll:true});});
  $('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.game-panel').requestFullscreen();}catch{notify('Fullscreen is unavailable in this browser');}});
  document.addEventListener('fullscreenchange',()=>$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen'));
  for(const button of document.querySelectorAll('[data-key]')){
    button.addEventListener('pointerdown',e=>{e.preventDefault();if(!pageActive||mode!=='playing'||menuOpen)return;button.setPointerCapture(e.pointerId);const k=button.dataset.key;if(!keys.has(k))pressed.add(k);keys.add(k);button.classList.add('held');});
    const release=()=>{keys.delete(button.dataset.key);button.classList.remove('held');};
    const cancel=()=>{const k=button.dataset.key;if(!keys.has(k))return;release();pressed.delete(k);if(k==='KeyJ'||k==='KeyZ'){player.shotHeld=false;player.shotCharge=0;}if(k==='KeyX'){player.slashHeld=false;player.slashCharge=0;}};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',cancel);button.addEventListener('lostpointercapture',cancel);
  }
  reset();loadSprite();let last=performance.now(),accumulator=0;
  function frame(now){if(!pageActive)return;const dt=Math.min((now-last)/1000,.05);last=now;accumulator+=dt;while(accumulator>=1/120){update(1/120);accumulator-=1/120;}render();requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  // Read-only diagnostics: useful to verify a run without changing game state.
  window.punkmanSnapshot=()=>({mode,player:{x:player.x,y:player.y,h:player.h,hp:player.hp,ground:player.ground,face:player.face,crouch:player.crouch},sprite:{loaded:spriteReady,...playerAnimation(),frameCount:8},
    vfx:{loaded:fx.ready(),dashEchoes:dashEchoes.length},cinematic:{active:!!cinematic,time:cinematic?.time??0,launched:cinematic?.launched??false,timeScale:sceneScale(),enabled:cinemaEnabled},
    combat:{meter:player.meter,shotCharge:player.shotCharge,slashCharge:player.slashCharge,shotLevel:chargeLevel(player.shotCharge),slashLevel:chargeLevel(player.slashCharge),shotsFired:player.shotsFired,slashes:player.slashes,ultimates:player.ultimates,ultimateWaves:player.ultimateWaves,attack:player.attack?{level:player.attack.level,damage:player.attack.damage,reach:player.attack.reach}:null},
    projectiles:shots.filter(s=>s.team==='player').map(s=>({x:s.x,y:s.y,w:s.w,h:s.h,damage:s.damage,charge:s.charge,kind:s.kind})),enemies:enemies.map(e=>({x:e.x,y:e.y,hp:e.hp})),score,checkpoint,kills,shots:shots.length,boss:{hp:boss.hp,dead:boss.dead,active:boss.active,state:boss.state,clock:boss.clock,pose:bossArt.pose(boss),loaded:bossArt.ready(),x:boss.x,y:boss.y,face:boss.face,attack:boss.attack,projectiles:shots.filter(s=>s.owner==='boss').length,claws:bossClaws.length,practice:practiceMode,phase:boss.phase,phaseTransitions:boss.phaseTransitions,tempo:bossArt.tempo(boss),timeScale:sceneScale(),transitionDuration:boss.transitionDuration,quakeProjectiles:shots.filter(s=>s.kind==='quake').length},elapsed,canvas:{width:W,height:H,pixelWidth:canvas.width,pixelHeight:canvas.height}});
})();
