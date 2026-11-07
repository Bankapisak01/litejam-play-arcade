/* Reuses the locally generated Punkman/Synth Drake atlases, at their original pixels. */
(function () {
  'use strict';
  const W = 960, H = 390, FLOOR = 333;
  // A relaxed guitar/shoulder loop from the existing atlas. No combat events.
  const IDLE_FRAMES = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function image(file, width, height) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => img.naturalWidth === width && img.naturalHeight === height ? resolve(img) : reject(new Error('Invalid sprite: ' + file));
      img.onerror = () => reject(new Error('Cannot load ' + file));
      img.src = 'assets/' + file;
    });
  }
  class Scene {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.time = 0;
      this.hero = {}; this.drake = {}; this.fx = window.PunkmanFX;
      this.motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.reset();
      this.ready = Promise.all([
        ...['walk', 'jump', 'dash', 'shoot', 'slash', 'special'].map(n => image('punkman-' + n + '-right.png', 1024, 128).then(img => this.hero[n] = img)),
        ...['idle', 'walk', 'charge', 'breath', 'claw', 'hurt', 'death', 'stomp'].map(n => image('boss-' + n + '-left.png', 2048, 192).then(img => this.drake[n] = img)),
        new Promise((resolve, reject) => this.fx.load(resolve, () => reject(new Error('Cannot load effects'))))
      ]).then(() => this.loaded = true);
    }
    reset() {
      this.effects = []; this.particles = []; this.shots = []; this.heroPose = null;
      this.bossPose = null; this.cinema = null; this.hurt = 0; this.death = null;
      this.playerHurt = 0; this.flash = 0; this.time = 0;
      this.heroX=180;this.bossX=750;this.heroStep=0;this.bossStep=0;this.actors={heroX:180,bossX:750};
    }
    burst(x, y, color = '#7ef8e1', count = 12) {
      if (!this.motion) return;
      for (let i = 0; i < count; i++) this.particles.push({ x, y, vx: (Math.random() - .5) * 210, vy: -50 - Math.random() * 130, t: 0, life: .4 + Math.random() * .4, color });
    }
    effect(name, x, y, size, life = .5, face = 1) {
      this.effects.push({ name, x, y, size, life, t: 0, face });
      if (this.effects.length > 35) this.effects.shift();
    }
    event(e) {
      const hx=this.heroX,bx=this.bossX;
      if (e.type === 'key') { this.burst(hx+12, 278, '#79eddf', 2); return; }
      if (e.type === 'stored') { this.effect('charge',hx,270,90,.35);this.burst(hx,245,e.critical?'#ffd18a':'#79eddf',7);return; }
      if (e.type === 'bossWindup') { this.effect(e.critical?'boss-overdrive':'boss-charge',bx-90,245,170,.8);return; }
      if (e.type === 'attack') {
        const ultimate = e.kind === 'ultimate', slash = e.kind === 'slash';
        this.heroPose = { state: ultimate ? 'special' : slash ? 'slash' : 'shoot', t: 0, life: ultimate ? 1.05 : .55 };
        this.shots.push({ kind: e.kind, t: 0, life: ultimate ? 1.1 : .68, hit: false, from:hx+40,to:bx-85 });
        if (ultimate) { this.cinema = { kind: 'ultimate', t: 0, life: 1.2 }; this.effect('charge', hx, 265, 220, .55); }
        else if (slash) this.effect('slash', hx+85, 260, 190, .6);
        else this.effect('impact', hx+45, 265, e.kind === 'charged' ? 100 : 64, .25);
        return;
      }
      if (e.type === 'dodge') {
        // Keep the attack pose if a special is playing; the body still evades.
        if (this.heroPose?.state !== 'special') this.heroPose = { state: e.kind, t: 0, life: .65 };
        this.bossPose = { state: e.kind === 'jump' ? 'stomp' : e.kind==='slash'?'claw':'breath', t: 0, life: .85 };
        this.shots.push({kind:e.attack||'breath',enemy:true,miss:true,t:0,life:.8,hit:false,from:bx-100,to:hx-100});
        if(e.kind==='slash'){this.effect('slash',hx+100,260,210,.7);this.effect('boss-claw',bx-170,260,180,.7,-1);}
        else this.effect('dash', hx-50, 290, 185, .55);return;
      }
      if (e.type === 'bossAttack') {
        this.bossPose = { state: e.kind === 'quake' ? 'stomp' : e.kind==='claw'?'claw':'breath', t: 0, life: e.kind==='ultimate'?1.35:.8 };
        this.shots.push({ kind: e.kind, enemy: true, t: 0, life: e.kind==='ultimate'?1.15:.7, hit: false,from:bx-100,to:hx });
        if(e.kind==='ultimate'){this.cinema={kind:'enemyUltimate',t:0,life:1.3};this.effect('boss-overdrive',bx,245,360,1.25);this.effect('boss-quake',470,325,260,1.2,-1);}
        return;
      }
      if (e.type === 'phase') {
        this.cinema = { kind: 'phase', t: 0, life: 1.5 };
        this.bossPose = { state: 'charge', t: 0, life: 1.5 };
        this.effect('boss-overdrive', bx, 230, 360, 1.5); return;
      }
      if (e.type === 'finish' && e.reason === 'victory') this.death = { t: 0 };
    }
    tick(dt, paused) {
      if (paused) return;
      this.time += dt;
      for (const name of ['heroPose', 'bossPose', 'cinema']) {
        if (this[name]) { this[name].t += dt; if (this[name].t >= this[name].life) this[name] = null; }
      }
      if (this.death) this.death.t += dt;
      this.hurt = Math.max(0, this.hurt - dt); this.playerHurt = Math.max(0, this.playerHurt - dt);
      for (const s of this.shots) {
        s.t += dt;
        if (!s.hit && s.t >= s.life * .82) {
          s.hit = true;
          if(s.miss)continue;
          const x = s.to, y = s.kind === 'quake' ? 315 : 267;
          this.effect('impact', x, y, s.kind === 'ultimate' ? 240 : 110, .5);
          this.burst(x, y, s.enemy ? '#ff6ab7' : '#79eddf', 18);
          if (s.enemy) this.playerHurt = .5; else this.hurt = .2;
        }
      }
      this.shots = this.shots.filter(s => s.t < s.life);
      for (const e of this.effects) e.t += dt;
      this.effects = this.effects.filter(e => e.t < e.life);
      for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 180; }
      this.particles = this.particles.filter(p => p.t < p.life);
    }
    rect(x, y, w, h, color) { const c = this.ctx; c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
    poly(points, color) {
      const c = this.ctx; c.fillStyle = color; c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill();
    }
    background(phase,stage) {
      const c = this.ctx, overdrive = phase === 2;
      const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a0920'); bg.addColorStop(.7, overdrive ? '#31133d' : '#1d153d'); bg.addColorStop(1, '#301a43');
      c.fillStyle = bg; c.fillRect(0,0,W,H);
      const glow = c.createRadialGradient(480,190,5,480,190,300); glow.addColorStop(0,overdrive ? '#e943ba24' : '#6236d22b'); glow.addColorStop(1,'#1b0e2400'); c.fillStyle=glow;c.fillRect(0,0,W,H);
      for(let i=0;i<62;i++){const x=(i*157+37)%W,y=(i*83+29)%255;const alpha=this.motion?.35+.3*Math.sin(this.time*.7+i):.5;c.globalAlpha=Math.max(.15,alpha);this.rect(x,y,i%9===0?3:2,2,i%3?'#958dc9':'#dda3ee');}c.globalAlpha=1;
      // A segmented synthwave moon, distant mountains and city lights.
      c.save();c.beginPath();c.arc(475,158,74,0,Math.PI*2);c.clip();
      const sun=c.createLinearGradient(0,80,0,238);sun.addColorStop(0,'#794cbf44');sun.addColorStop(1,'#fd6aaa77');c.fillStyle=sun;c.fillRect(395,80,160,160);
      for(let y=170;y<240;y+=11)this.rect(395,y,160,4+(y-170)/18,'#1b1234');c.restore();
      this.poly([[0,277],[0,229],[67,191],[100,234],[164,183],[219,255],[301,214],[368,255],[440,220],[510,255],[588,192],[639,252],[696,213],[744,248],[803,193],[869,243],[925,214],[960,237],[960,290]],'#191631');
      for(let i=0;i<24;i++){const x=i*44-14,h=28+(i*31)%70;this.rect(x,310-h,31,h,'#211c39');this.rect(x+8,304-h,15,6,'#211c39');for(let j=0;j<4;j++){if((i+j)%3)this.rect(x+6+(j%2)*12,320-h+Math.floor(j/2)*17,3,5,(i+j)%2?'#a755a744':'#57a8b544');}}
      for(let i=0;i<8;i++){const x=i*130+14;this.rect(x,302,3,29,'#403052');this.rect(x-8,301,19,2,'#685376');}
      if(stage===2){
        this.rect(48,165,11,168,'#47335b');this.rect(902,165,11,168,'#47335b');
        c.strokeStyle='#75548a';c.lineWidth=2;c.beginPath();c.moveTo(54,180);c.quadraticCurveTo(480,345,908,180);c.stroke();
        for(let i=0;i<9;i++){const x=98+i*95,y=211+Math.sin(i/8*Math.PI)*55;this.rect(x,y,2,330-y,'#573a70');}
      }
      if(stage===3){for(const x of [62,415,878]){this.rect(x,206,14,125,'#3f254f');this.rect(x+5,214,4,104,'#d85bba88');this.rect(x-5,204,24,5,'#92549d');}this.rect(370,319,180,5,'#bf4bca55');}
      this.rect(0,331,W,3,'#9f68d5');this.rect(0,334,W,3,'#443059');this.rect(0,337,W,53,'#171326');
      for(let row=0;row<3;row++)for(let i=0;i<25;i++){const x=i*43-(row%2)*21;this.rect(x,341+row*20,40,17,(i+row)%3?'#241c34':'#30223f');this.rect(x,341+row*20,40,2,'#463050');}
      this.rect(50,331,242,3,'#6fe5cf');this.rect(608,331,285,3,overdrive?'#ff80c4':'#bc78e7');
      c.globalAlpha=.1;for(let y=1;y<H;y+=4)this.rect(0,y,W,1,'#060512');c.globalAlpha=1;
    }
    draw(session, dt = 0) {
      const c = this.ctx, paused = session.status === 'paused';
      this.tick(dt, paused); c.clearRect(0,0,W,H); c.imageSmoothingEnabled=false;
      this.background(session.phase,session.mode==='battle'?session.stage:1);
      if (!this.loaded) return;
      let heroMoving=false,bossMoving=false;
      if(this.motion&&session.status==='playing'&&session.started){
        const beat=session.mode==='battle'?session.beat:'charge';
        const heroTargets={charge:185+Math.sin(this.time*.85)*45,volley:225,defend:145,counter:350,retaliate:130,recover:180};
        const bossTargets={charge:745+Math.sin(this.time*.65+1)*32,volley:742,defend:680,counter:698,retaliate:678,recover:750};
        const nextHero=this.heroX+clamp(heroTargets[beat]-this.heroX,-dt*95,dt*(beat==='counter'?220:65));
        const nextBoss=this.bossX+clamp(bossTargets[beat]-this.bossX,-dt*42,dt*35);
        heroMoving=Math.abs(nextHero-this.heroX)>.08;bossMoving=Math.abs(nextBoss-this.bossX)>.04;
        this.heroStep+=Math.abs(nextHero-this.heroX)*.17;this.bossStep+=Math.abs(nextBoss-this.bossX)*.12;
        this.heroX=nextHero;this.bossX=nextBoss;
      }
      if(!this.motion){this.heroX=180;this.bossX=750;}
      const p=this.heroPose, d=this.bossPose;
      const idle=this.motion&&!heroMoving&&!p;
      let px=this.heroX, py=FLOOR, pf=heroMoving?Math.floor(this.heroStep)%8:idle?IDLE_FRAMES[Math.floor(this.time*5)%IDLE_FRAMES.length]:0, state=heroMoving?'walk':'idle';
      if(p){state=p.state;pf=clamp(Math.floor(p.t/p.life*8),0,7);if(state==='dash')px+=Math.sin(p.t/p.life*Math.PI)*85;if(state==='jump')py-=Math.sin(p.t/p.life*Math.PI)*87;if(state==='slash')px+=Math.sin(p.t/p.life*Math.PI)*85;}
      if(!this.motion){px=180;py=FLOOR;if(p)pf=4;}
      if(session.charge>0)this.fx.draw(c,'charge',px,py-70,100+session.charge*.5,125+session.charge*.6,this.motion?Math.floor(this.time*10)%8:3,1,.22+session.charge*.004);
      if(p?.state==='dash'&&this.motion){c.save();c.globalAlpha=.16;c.drawImage(this.hero.dash,pf*128,0,128,128,px-145,py-162,176,176);c.restore();}
      // Anchor the sprite's sole (source row 118) while the shoulders breathe.
      // Integer destination pixels keep the small motion crisp at pixel scale.
      const heroHeight=176-(idle?Math.round((1-Math.cos(this.time*Math.PI))*1.5):0);
      c.save(); if(this.playerHurt>0)c.globalAlpha=.6;
      c.drawImage(this.hero[state==='idle'?'shoot':state],pf*128,0,128,128,Math.round(px-88),Math.round(py-heroHeight*118/128),176,heroHeight);c.restore();
      if(session.mode==='battle'&&session.ammo.length){for(let i=0;i<Math.min(8,session.ammo.length);i++){const angle=this.motion?this.time*.9+i*.7:i*.7,x=px+Math.cos(angle)*65,y=py-92+Math.sin(angle)*27;this.poly([[x,y-4],[x+4,y],[x,y+4],[x-4,y]],i%3===2?'#ffb0dc':'#8bffdf');}}
      let bs=bossMoving?'walk':'idle',bf=bossMoving?Math.floor(this.bossStep)%8:this.motion?Math.floor(this.time*6)%8:0;
      if(session.mode==='battle'&&session.beat==='defend'){bs=session.reaction?.attack==='quake'?'stomp':'charge';bf=clamp(Math.floor((1-session.wordLeft/session.wordDuration)*(bs==='stomp'?4:8)),0,bs==='stomp'?3:7);this.fx.draw(c,session.critical?'boss-overdrive':'boss-charge',this.bossX-105,236,session.critical?230:145,session.critical?230:145,bf,1,.8);}
      if(d){bs=d.state;bf=clamp(Math.floor(d.t/d.life*8),0,7);}
      if(this.hurt>0&&!d){bs='hurt';bf=clamp(Math.floor((.2-this.hurt)/.2*8),0,7);}
      if(this.death){bs='death';bf=clamp(Math.floor(this.death.t/1.2*8),0,7);}
      if(!this.motion&&bs!=='idle')bf=4;
      if(session.phase===2&&!this.death)this.fx.draw(c,'boss-overdrive',this.bossX,224,325,280,this.motion?Math.floor(this.time*8)%8:3,1,.22);
      c.save();if(this.death)c.globalAlpha=clamp(1-(this.death.t-1.2)*.8,.1,1);
      c.drawImage(this.drake[bs],bf*256,0,256,192,Math.round(this.bossX-180),FLOOR-253.125,360,270);c.restore();
      this.actors={heroX:px,heroY:py,heroState:state,heroFrame:pf,bossX:this.bossX,bossState:bs,bossFrame:bf};
      for(const s of this.shots){
        const t=clamp(s.t/s.life,0,1),x=s.from+(s.to-s.from)*t;
        const name=s.enemy?(s.kind==='quake'?'boss-quake':s.kind==='claw'?'boss-claw':s.kind==='ultimate'?'boss-overdrive':'boss-breath'):s.kind==='ultimate'?'ultimate':s.kind==='charged'?'charged-bolt':s.kind==='slash'?'slash':'bolt';
        const size=s.kind==='ultimate'?275:s.kind==='charged'?150:s.kind==='slash'?180:s.kind==='quake'?140:105;
        this.fx.draw(c,name,this.motion?x:s.to,s.kind==='quake'?314:270,size,size,this.motion?Math.floor(t*8):4,s.enemy?-1:1,this.motion?1:Math.sin(t*Math.PI));
      }
      for(const e of this.effects)this.fx.draw(c,e.name,e.x,e.y,e.size,e.size,this.motion?Math.floor(e.t/e.life*8):4,e.face,this.motion?1:Math.sin(e.t/e.life*Math.PI)*.55);
      for(const p of this.particles){c.globalAlpha=1-p.t/p.life;this.rect(p.x,p.y,3,3,p.color);}c.globalAlpha=1;
      if(this.cinema&&this.motion){
        const ci=this.cinema,enemy=ci.kind!=='ultimate',alpha=Math.min(1,ci.t/.16,(ci.life-ci.t)/.3)*.9;
        c.save();c.globalAlpha=alpha;
        this.poly([[265,113],[780,113],[720,238],[205,238]],enemy?'#180e2ae8':'#121629e8');
        this.rect(270,112,510,2,enemy?'#ff6ab7':'#79eddf');
        this.fx.cutin(c,enemy?460:240,115,250,125,.95,enemy?'bossCutin':'cutin');
        c.fillStyle=enemy?'#ff8ac7':'#9bffe4';c.font='bold 25px Consolas,monospace';c.textAlign='center';
        c.fillText(ci.kind==='phase'?'PHASE II':ci.kind==='enemyUltimate'?'DRAKE NOVA':'RGB SLASH',enemy?379:628,167);
        c.fillStyle='#d6c7e8';c.font='11px Consolas,monospace';c.fillText(ci.kind==='phase'?'SYNTH OVERDRIVE':ci.kind==='enemyUltimate'?'CRITICAL WORD MISSED · −2 HP':'PERFECT WORDS. FULL POWER.',enemy?379:628,190);c.restore();
      }
    }
  }
  window.KeyBattleScene = Scene;
})();
