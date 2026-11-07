/* Local Wan2.2 animation atlases and deterministic mechanical-dragon attack timing. */
(() => {
  'use strict';
  const states=['idle','walk','charge','breath','claw','hurt','death','stomp'];
  const assets=Object.fromEntries(states.map(state=>[state,{image:new Image(),loaded:false}]));
  const ready=()=>Object.values(assets).every(a=>a.loaded);
  function load(onReady,onError){
    for(const a of Object.values(assets))a.loaded=false;
    for(const [state,a] of Object.entries(assets)){
      a.image.onload=()=>{if(a.image.naturalWidth!==2048||a.image.naturalHeight!==192){a.image.onerror();return;}a.loaded=true;if(ready())onReady();};
      a.image.onerror=()=>{a.loaded=false;onError();};a.image.src=`assets/boss-${state}-left.png`;
    }
  }
  function create(){return{x:2860,y:162,w:80,h:76,hp:30,maxHp:30,active:false,dead:false,face:-1,state:'idle',clock:0,hitTime:0,flash:0,attack:'breath',bursts:0,deathTime:0,deathBursts:0,phase:1,phaseTransitions:0,phaseAttacks:0,transitionDuration:1.7,phaseBurst:false};}
  function enter(b,state){b.state=state;b.clock=0;b.bursts=0;}
  const tempo=b=>b.phase===2?1.4:1;
  const windup=b=>b.attack==='stomp'?1.26:.65;
  function hit(b){
    if(b.dead||b.hp<=0||b.state==='transform')return false;
    if(b.phase===1&&b.hp<=b.maxHp/2){b.phase=2;b.phaseTransitions++;b.phaseAttacks=0;b.phaseBurst=false;b.hitTime=0;enter(b,'transform');return true;}
    b.hitTime=.16;b.flash=.08;return false;
  }
  function defeat(b){b.dead=true;b.active=false;b.hitTime=0;b.deathTime=0;b.deathBursts=0;enter(b,'death');}
  function tick(b,dt,p){
    const events=[];b.clock+=dt*(b.dead||b.state==='transform'?1:tempo(b));b.hitTime=Math.max(0,b.hitTime-dt);b.flash=Math.max(0,b.flash-dt);
    if(b.dead){b.deathTime+=dt;while(b.deathBursts<3&&b.deathTime>=.22+b.deathBursts*.22){events.push({kind:'deathBurst',index:b.deathBursts++});}return events;}
    if(b.state==='transform'){
      if(!b.phaseBurst&&b.clock>=b.transitionDuration*.52){b.phaseBurst=true;events.push({kind:'phaseBurst'});}
      if(b.clock>=b.transitionDuration)enter(b,'idle');return events;
    }
    if(!b.active){b.state='idle';return events;}
    if(b.state==='idle'&&b.clock>=1){enter(b,'walk');}
    else if(b.state==='walk'){
      b.face=p.x+p.w/2<b.x+b.w/2?-1:1;b.x=Math.max(2810,Math.min(2990,b.x+b.face*18*tempo(b)*dt));
      if(b.clock>=.7){b.attack=b.phase===2&&b.phaseAttacks++%3===0?'stomp':Math.abs(p.x+p.w/2-(b.x+b.w/2))<125?'claw':'breath';enter(b,'charge');}
    }else if(b.state==='charge'&&b.clock>=windup(b)){enter(b,b.attack);}
    else if(b.state==='breath'){
      while(b.bursts<(b.phase===2?3:2)&&b.clock>=.12+b.bursts*(b.phase===2?.2:.26)){events.push({kind:'breath',face:b.face,index:b.bursts++,speed:b.phase===2?155:125});}
      if(b.clock>=.72)enter(b,'recover');
    }else if(b.state==='claw'){
      if(!b.bursts&&b.clock>=.19){b.bursts=1;events.push({kind:'claw',face:b.face,zone:{x:b.face<0?b.x-55:b.x+b.w-9,y:b.y+b.h-48,w:64,h:48}});}
      if(b.clock>=.55)enter(b,'recover');
    }else if(b.state==='stomp'){
      while(b.bursts<3&&b.clock>=.26+b.bursts*.18){events.push({kind:'quake',index:b.bursts++});}
      if(b.clock>=1.04)enter(b,'recover');
    }else if(b.state==='recover'&&b.clock>=.65)enter(b,'idle');
    return events;
  }
  function pose(b){
    if(b.dead)return{state:'death',frame:Math.min(7,Math.floor(b.deathTime/.9*8))};
    if(b.state==='transform')return{state:'charge',frame:Math.min(7,Math.floor(b.clock/b.transitionDuration*8))};
    if(b.state==='charge'&&b.attack==='stomp')return{state:'stomp',frame:Math.min(3,Math.floor(b.clock/windup(b)*4))};
    if(b.state==='stomp')return{state:'stomp',frame:Math.min(7,4+Math.floor(b.clock/1.04*4))};
    if(b.hitTime>0)return{state:'hurt',frame:Math.min(7,Math.floor((.16-b.hitTime)/.16*8))};
    const durations={charge:.65,breath:.72,claw:.55};
    if(durations[b.state])return{state:b.state,frame:Math.min(7,Math.floor(b.clock/durations[b.state]*8))};
    return{state:b.state==='walk'?'walk':'idle',frame:Math.floor(b.clock*(b.state==='walk'?10:7))%8};
  }
  function mouth(b){const frame=pose(b),sourceY=frame.state==='charge'?[105,104,117,128,135,92,85,98][frame.frame]:108;return{x:b.face<0?b.x-14:b.x+b.w+14,y:b.y+b.h+(sourceY-180)*.625};}
  function draw(ctx,b){
    if(!ready()||(b.dead&&b.deathTime>1.6))return;
    const p=pose(b);ctx.save();ctx.translate(Math.round(b.x+b.w/2),Math.round(b.y+b.h));ctx.scale(-b.face,1);
    ctx.globalAlpha=b.dead?Math.max(0,Math.min(1,(1.6-b.deathTime)/.5)):1;
    ctx.drawImage(assets[p.state].image,p.frame*256,0,256,192,-80,-112.5,160,120);ctx.restore();
  }
  window.PunkmanBoss={load,ready,create,tick,pose,mouth,hit,defeat,draw,tempo,windup};
})();
