const COLORS=['#68eee7','#ffd677','#f198ce','#bca2ff'];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const SPRITES={
  walk:['punkman-walk-right.png',128,128],shoot:['punkman-shoot-right.png',128,128],slash:['punkman-slash-right.png',128,128],special:['punkman-special-right.png',128,128],dash:['punkman-dash-right.png',128,128],
  bossIdle:['boss-idle-left.png',256,192],bossCharge:['boss-charge-left.png',256,192],bossBreath:['boss-breath-left.png',256,192],bossHurt:['boss-hurt-left.png',256,192],
  bolt:['fx-bolt.png',192,192],charged:['fx-charged-bolt.png',192,192],slashFX:['fx-slash.png',192,192],charge:['fx-charge.png',192,192],impact:['fx-impact.png',192,192],ultimate:['fx-ultimate.png',192,192],breath:['fx-boss-breath.png',192,192],overdrive:['fx-boss-overdrive.png',192,192]
};

export class TempoRenderer {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.sprites={};this.reducedMotion=false;this.reset();}
  async load(){
    await Promise.all(Object.entries(SPRITES).map(([key,[file,w,h]])=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{if(image.naturalWidth!==w*8||image.naturalHeight!==h)return reject(new Error(`Invalid atlas: ${file}`));this.sprites[key]={image,w,h};resolve();};image.onerror=()=>reject(new Error(`Missing sprite: ${file}`));image.src=`assets/${file}`;
    })));
  }
  reset(){this.time=0;this.effects=[];this.shots=[];this.pulses=[-10,-10,-10,-10];this.heroPose=null;this.bossPose=null;this.message=null;this.overdriveUntil=0;}
  sprite(ctx,key,frame,x,y,w,h,alpha=1,screen=false){
    const s=this.sprites[key];if(!s)return;
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=alpha;if(screen)ctx.globalCompositeOperation='screen';
    ctx.drawImage(s.image,clamp(Math.floor(frame),0,7)*s.w,0,s.w,s.h,Math.round(x-w/2),Math.round(y-h/2),w,h);ctx.restore();
  }
  effect(key,x,y,size,life=.5){this.effects.push({key,x,y,size,start:this.time,life});if(this.effects.length>30)this.effects.shift();}
  event(e){
    if(e.type==='holdStart'||e.type==='holdResume'){
      this.pulses[e.lane]=this.time;this.heroPose={key:'special',start:this.time,life:.5};this.effect('charge',180,465,160,.6);return;
    }
    if(e.type==='ghost'||e.judgement==='miss'){
      this.message={text:e.type==='ghost'?'OFF BEAT':'MISS',color:'#f198ce',start:this.time};
      this.heroPose={key:'dash',start:this.time,life:.4};this.bossPose={key:'bossBreath',start:this.time,life:.55};
      this.shots.push({key:'breath',enemy:true,start:this.time,life:.65});return;
    }
    if(e.type!=='judgement')return;
    this.pulses[e.lane]=this.time;this.message={text:e.judgement.toUpperCase()+(e.judgement==='perfect'?'!':''),color:e.judgement==='perfect'?COLORS[e.lane]:'#f5f3ff',start:this.time};
    const ultimate=e.combo>0&&e.combo%20===0,hold=e.note.type==='hold';
    this.heroPose={key:ultimate?'special':e.combo%5===0?'slash':'shoot',start:this.time,life:ultimate?.8:.35};
    this.bossPose={key:'bossHurt',start:this.time,life:.3};
    this.shots.push({key:ultimate?'ultimate':hold?'charged':'bolt',enemy:false,start:this.time,life:ultimate?.8:.5});
    this.effect(ultimate?'ultimate':e.combo%5===0?'slashFX':'impact',255,470,ultimate?260:110,.45);
    this.effect('impact',1000,470,ultimate?220:110,.4);
    if(ultimate){this.overdriveUntil=this.time+2;this.effect('overdrive',1050,465,260,.9);}
  }
  rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  poly(ctx,points,color,stroke){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(color){ctx.fillStyle=color;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  background(ctx,heavy,beat,width=1200,height=640){
    const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#090b21');bg.addColorStop(.65,heavy?'#33163e':'#201b40');bg.addColorStop(1,'#151b34');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    const shift=this.reducedMotion?0:Math.sin(this.time*.1)*4;
    for(let i=0;i<65;i++){const x=(i*157+37)%width,y=(i*79+23)%(height*.55);this.rect(ctx,x+shift,y,i%7?2:3,2,i%4?'#786f9b':'#c4b8e9');}
    const sunX=width*.5,sunY=height*.39,r=height*.17;
    ctx.save();ctx.beginPath();ctx.arc(sunX,sunY,r,0,Math.PI*2);ctx.clip();
    const sun=ctx.createLinearGradient(0,sunY-r,0,sunY+r);sun.addColorStop(0,heavy?'#bd5699':'#fa9a99');sun.addColorStop(1,'#7554ad');ctx.fillStyle=sun;ctx.fillRect(sunX-r,sunY-r,r*2,r*2);
    for(let y=sunY;y<sunY+r;y+=12)this.rect(ctx,sunX-r,y,r*2,3+(y-sunY)/20,'#201635');ctx.restore();
    for(let layer=0;layer<2;layer++){
      const size=layer?49:38,base=height*(layer?.89:.76);
      for(let i=0;i<Math.ceil(width/size)+1;i++){
        const h=40+(i*47+layer*31)%(height*.32),x=i*size-10;
        this.rect(ctx,x,base-h,size-4,h,layer?'#121529':'#211d3a');
        for(let j=0;j<Math.floor(h/15)-1;j++)for(let k=0;k<3;k++)if((i+j+k)%3)this.rect(ctx,x+7+k*10,base-h+9+j*15,3,5,layer?(heavy?'#753d75':'#32546e'):'#5d3d69');
      }
    }
    this.rect(ctx,0,height*.89,width,height*.11,'#0c1021');
    const pulse=this.reducedMotion?.2:.15+Math.pow(1-(beat%1+1)%1,3)*.3;
    ctx.globalAlpha=pulse;this.rect(ctx,0,height*.89,width,3,heavy?COLORS[2]:COLORS[0]);ctx.globalAlpha=1;
  }
  cover(canvas,index){
    const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;this.background(c,Boolean(index),0,512,160);
    this.sprite(c,index?'bossIdle':'walk',index?1:0,386,96,index?200:160,index?150:160);
    c.fillStyle=index?'#f198ce':'#68eee7';c.font='bold 10px Segoe UI, sans-serif';c.fillText(index?'02 / BOSS CIRCUIT':'01 / NEON ROOFTOPS',22,29);
    c.fillStyle='#f6f0ff';c.font='900 24px Segoe UI, sans-serif';c.fillText(index?'UNLEASH THE':'FIND YOUR',22,110);c.fillText(index?'OVERDRIVE.':'HEARTBEAT.',22,136);
  }
  geometry(lane,p){const t=Math.pow(clamp(p,0,1.07),1.6),left=490-190*t,width=220+380*t;return {x:left+(lane+.5)*width/4,left:left+lane*width/4,right:left+(lane+1)*width/4,y:85+465*t,t};}
  drawNotes(ctx,session,time,travel){
    // Draw distant notes first. Held tails and notes always sit above battle effects.
    for(const n of [...session.notes].reverse()){
      if(n.status==='resolved'||n.time-time>travel+.1||n.time+n.duration<time-.22)continue;
      const head=n.status==='holding'?1:1-(n.time-time)/travel;
      const a=this.geometry(n.lane,head),color=COLORS[n.lane],pad=3+9*a.t;
      if(n.type==='hold'){
        const b=this.geometry(n.lane,1-(n.time+n.duration-time)/travel),bp=3+9*b.t;
        ctx.globalAlpha=n.status==='holding'?.72:.4;
        this.poly(ctx,[[a.left+pad,a.y],[a.right-pad,a.y],[b.right-bp,b.y],[b.left+bp,b.y]],color);
        ctx.globalAlpha=1;ctx.strokeStyle=color;ctx.lineWidth=n.status==='holding'?3:1;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        this.rect(ctx,b.left+bp,b.y-2,b.right-b.left-bp*2,4,color);
      }
      if(head<0)continue;
      const h=7+10*a.t;ctx.save();ctx.shadowColor=color;ctx.shadowBlur=this.reducedMotion?0:9;
      this.poly(ctx,[[a.left+pad,a.y-h/2],[a.right-pad,a.y-h/2],[a.right-pad+2,a.y+h/2],[a.left+pad-2,a.y+h/2]],color);
      ctx.restore();this.rect(ctx,a.left+pad+3,a.y-h/2+2,a.right-a.left-2*pad-6,2,'#fff7');
    }
  }
  draw(track,session,time,dt,{state='playing',difficulty='easy'}={}){
    if(state==='playing'||state==='countdown')this.time+=dt;
    const ctx=this.ctx,heavy=track.id==='drake-overdrive',beat=Math.max(0,time)*track.bpm/60;
    ctx.clearRect(0,0,1200,640);ctx.imageSmoothingEnabled=false;this.background(ctx,heavy,beat);
    for(const [x,color] of [[30,COLORS[0]],[920,COLORS[2]]]){
      this.rect(ctx,x,574,250,5,color);this.rect(ctx,x,579,250,5,'#43395e');
      for(let i=0;i<7;i++)this.rect(ctx,x+i*37,586,34,28,i%2?'#27223f':'#342844');
    }
    const pose=this.heroPose&&this.time-this.heroPose.start<this.heroPose.life?this.heroPose:null;
    const bossPose=this.bossPose&&this.time-this.bossPose.start<this.bossPose.life?this.bossPose:null;
    const bob=this.reducedMotion?0:Math.sin(beat*Math.PI*2)*2;
    if(session.notes.some(n=>n.status==='holding'))this.sprite(ctx,'charge',this.reducedMotion?3:Math.floor(this.time*12)%8,180,477,210,210,.6,true);
    this.sprite(ctx,pose?.key||'walk',pose?(this.reducedMotion?4:(this.time-pose.start)/pose.life*8):(this.reducedMotion?0:Math.floor(beat*2)%8),165,458+bob,240,240);
    this.sprite(ctx,bossPose?.key||'bossIdle',bossPose?(this.reducedMotion?4:(this.time-bossPose.start)/bossPose.life*8):(this.reducedMotion?0:Math.floor(beat*2)%8),1055,478-bob,288,216);
    this.effects=this.effects.filter(e=>this.time-e.start<e.life);this.shots=this.shots.filter(e=>this.time-e.start<e.life);
    for(const s of this.shots){const p=(this.time-s.start)/s.life;this.sprite(ctx,s.key,Math.floor(p*8),this.reducedMotion?(s.enemy?200:1010):(s.enemy?980-750*p:230+750*p),465,s.key==='ultimate'?240:120,s.key==='ultimate'?240:120,this.reducedMotion?.6:1,true);}
    for(const e of this.effects){const p=(this.time-e.start)/e.life;this.sprite(ctx,e.key,this.reducedMotion?4:p*8,e.x,e.y,e.size,e.size,this.reducedMotion?(1-p)*.4:1,true);}
    // Opaque lane surface keeps combat sprites and flashes away from the notes.
    this.poly(ctx,[[486,79],[714,79],[915,585],[285,585]],'#0a0d20','#4a3c6b');
    for(let lane=0;lane<4;lane++){
      const a=this.geometry(lane,0),b=this.geometry(lane,1.04);
      this.poly(ctx,[[a.left,85],[a.right,85],[b.right,b.y],[b.left,b.y]],`${COLORS[lane]}07`);
      ctx.strokeStyle=`${COLORS[lane]}78`;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(a.left,85);ctx.lineTo(b.left,b.y);ctx.stroke();
    }
    ctx.strokeStyle='#bca2ff88';ctx.beginPath();ctx.moveTo(710,85);ctx.lineTo(915,585);ctx.stroke();
    const travel=difficulty==='easy'?3.0:2.5;
    for(let n=Math.floor(Math.max(0,time)*track.bpm/60);n<Math.ceil((Math.max(0,time)+travel)*track.bpm/60);n++){
      const p=1-(n*60/track.bpm-time)/travel;if(p<0||p>1)continue;
      const a=this.geometry(0,p),b=this.geometry(3,p);ctx.strokeStyle=n%4===0?'#ffffff1b':'#ffffff08';ctx.lineWidth=n%4===0?2:1;ctx.beginPath();ctx.moveTo(a.left,a.y);ctx.lineTo(b.right,a.y);ctx.stroke();
    }
    this.rect(ctx,300,548,600,3,'#fff9');
    for(let lane=0;lane<4;lane++){
      const g=this.geometry(lane,1),age=this.time-this.pulses[lane],pulse=age<.28?1-age/.28:0,pressed=session.down[lane];
      ctx.save();ctx.strokeStyle=COLORS[lane];ctx.fillStyle=pressed?`${COLORS[lane]}78`:`${COLORS[lane]}16`;ctx.lineWidth=3;ctx.shadowColor=COLORS[lane];ctx.shadowBlur=this.reducedMotion?0:pressed?25:12;
      ctx.beginPath();ctx.ellipse(g.x,551,43+pulse*5,13+pulse*3,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
      if(pulse>0&&!this.reducedMotion){ctx.globalAlpha=pulse;ctx.strokeStyle=COLORS[lane];ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(g.x,551,45+(1-pulse)*24,15+(1-pulse)*15,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    }
    this.drawNotes(ctx,session,time,travel);
    ctx.textAlign='center';ctx.fillStyle='#bbc0d9';ctx.font='bold 11px Segoe UI, sans-serif';ctx.fillText('PUNKMAN',165,612);ctx.fillText('SYNTH DRAKE',1055,612);
    ctx.fillStyle=COLORS[0];ctx.font='bold 11px Segoe UI, sans-serif';ctx.fillText('RHYTHM GUITAR',165,322);ctx.fillStyle=COLORS[2];ctx.fillText(heavy?'OVERDRIVE STAGE':'LIVE ON THE ROOFTOPS',1055,322);
    if(this.message){const p=(this.time-this.message.start)/.65;if(p<1){ctx.globalAlpha=1-clamp((p-.65)/.35);ctx.fillStyle=this.message.color;ctx.font='900 29px Segoe UI, sans-serif';ctx.fillText(this.message.text,165,369);ctx.globalAlpha=1;}}
    if(this.overdriveUntil>this.time){ctx.fillStyle=COLORS[2];ctx.font='900 19px Segoe UI, sans-serif';ctx.fillText('OVERDRIVE!',1055,365);}
    if(session.combo>0){ctx.fillStyle='#f3ebff';ctx.font='900 32px Segoe UI, sans-serif';ctx.fillText(`${session.combo}`,600,43);ctx.fillStyle='#a8aec7';ctx.font='9px Segoe UI, sans-serif';ctx.fillText('COMBO',600,61);}
    if(state==='countdown'){
      ctx.fillStyle='#101329c9';ctx.fillRect(380,220,440,150);ctx.fillStyle=COLORS[0];ctx.font='900 77px Segoe UI, sans-serif';ctx.fillText(String(Math.max(1,Math.ceil(-time))),600,315);ctx.fillStyle='#dedcf0';ctx.font='bold 12px Segoe UI, sans-serif';ctx.fillText('GET READY · D   F   J   K',600,349);
    }
    ctx.textAlign='start';
  }
}
