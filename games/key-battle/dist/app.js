/* Browser adapter: keyboard -> lesson -> battle events. Entirely local. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const { Session, LESSONS } = window.KeyBattle;
  const scene = new window.KeyBattleScene($('#scene'));
  const input = $('#typing-input');
  const menu = $('#session-menu');
  let mode = 'battle', session = new Session({mode}), loaded = false, sound = false, audio, pageActive = true;
  let last = performance.now(), lastHud = 0, messageUntil = 0, calloutUntil = 0, finishAt = 0;
  let resultShown = false, lastTarget = '', bestRecords = {};
  let pausedAt = 0;
  try { const data=JSON.parse(localStorage.getItem('punkman-key-battle-records') || '{}'); if(data&&typeof data==='object'&&!Array.isArray(data))bestRecords=data; } catch {}
  const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const recordKey = () => (mode==='battle'?'round-battle-v2':mode) + ':' + $('#lesson').value;
  function bestDisplay() {
    const best = bestRecords[recordKey()];
    $('#best').innerHTML = `${Number.isFinite(best?.wpm) ? best.wpm : '—'} <small>WPM</small>`;
    $('#best-detail').textContent = best ? `${best.accuracy}% accuracy · ${LESSONS[$('#lesson').value].title}` : 'Set your first personal best';
  }
  function beep(frequency = 440, length = .07, volume = .025, end = frequency) {
    if (!pageActive || !sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), gain = audio.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(frequency, audio.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(end,40),audio.currentTime+length);
      gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+length);
      o.connect(gain);gain.connect(audio.destination);o.start();o.stop(audio.currentTime+length);
    } catch {}
  }
  function hint(text, error = false, duration = 2200) {
    $('#typing-hint').textContent = text; $('#typing-hint').classList.toggle('error-hint', error);
    messageUntil = performance.now() + duration;
  }
  function callout(text, color = '#79eddf', duration = 1000) {
    $('#battle-callout').textContent = text;$('#battle-callout').style.color=color;
    $('#battle-callout').classList.add('visible');calloutUntil=performance.now()+duration;
  }
  function processEvents() {
    let refresh=false;
    for (const e of session.drain()) {
      scene.event(e);
      if(['word','beat','stored','start','finish'].includes(e.type))refresh=true;
      if (e.type === 'key') beep(300 + session.buffer.length * 36,.035,.009);
      if (e.type === 'mistake') { beep(125,.07,.025,80); hint(session.mode==='battle'?'Use Backspace to fix it before submitting!':'Typo spotted · Use Backspace, then keep typing',true); }
      if (e.type === 'incomplete') hint('Match the whole word, then press Space',true);
      if(e.type==='stored'){beep(430+e.count*30,.08,.018);hint(e.critical?'Danger word cleared! This shot hits harder':'Ammo stored · A volley fires after the charge phase',false,1400);}
      if(e.type==='release'){callout(e.count?`RELEASE ×${e.count}`:'NO AMMO','#79eddf',800);hint('Take a breath · Your stored ammo is firing',false,2000);}
      if(e.type==='bossWindup'){callout(e.critical?'DANGER!':'INCOMING','#ff9ec9',900);hint('Type the dodge word + Space in time to open a counterattack',false,3000);}
      if(e.type==='beat'&&e.beat==='counter')hint('Weak spot exposed! Type this word to counter',false,3000);
      if(e.type==='beat'&&e.beat==='charge')messageUntil=0;
      if (e.type === 'attack') {
        messageUntil=0;
        if(e.kind==='ultimate'){beep(220,.6,.07,1100);if(!scene.motion)callout('RGB OVERDRIVE','#ffc0e4',1300);else{$('#battle-callout').classList.remove('visible');$('#battle-callout').textContent='';}}
        else if(e.kind==='charged'){beep(350,.2,.04,950);callout('CHARGED SHOT','#79eddf',750);}
        else if(e.kind==='slash'){beep(850,.13,.035,220);callout('SONIC SLASH','#b59dff',650);}
        else beep(540,.1,.025,900);
      }
      if(e.type==='dodge'){if(!scene.cinema)callout(e.kind==='jump'?'JUMP!':e.kind==='slash'?'REFLECT!':'DASH!','#79eddf',700);}
      if(e.type==='phase'){if(!scene.motion)callout('PHASE II','#ff82c5',1500);else{$('#battle-callout').classList.remove('visible');$('#battle-callout').textContent='';}hint(session.mode==='battle'?'Phase 2 · The boss is faster. Watch for danger words':'Halfway there · Keep typing with care',false,2500);beep(140,.65,.045,420);}
      if(e.type==='bossAttack'){if(e.damage===2&&scene.motion){$('#battle-callout').classList.remove('visible');$('#battle-callout').textContent='';}else callout(e.damage===2?'DRAKE ULTIMATE · −2 ♥':'COUNTER! · −1 ♥','#ff91b5',e.damage===2?1500:1100);hint(`${e.reason==='wrong'?'Wrong word':'Word timed out'}: ${e.word} · Counterattack −${e.damage} ♥`,true,2300);beep(130,.3,.035,50);}
      if(e.type==='finish') {
        finishAt=performance.now()+(e.reason==='victory'?1350:e.reason==='defeat'?1500:150);input.disabled=true;
        $('#finish').disabled=true;
        if(e.reason==='victory'){callout('STAGE CLEAR','#a2ffe4',1600);beep(440,.6,.04,880);}
      }
    }
    if(refresh){controls();drawWords();hud();}
  }
  function keyboard() {
    for(const row of ['qwertyuiop','asdfghjkl','zxcvbnm',' ']) {
      const div=document.createElement('div');div.className='key-row';
      for(const key of row){const span=document.createElement('span');span.className='keycap'+(key===' '?' space':'');span.dataset.key=key;span.textContent=key===' '?'SPACE':key.toUpperCase();div.append(span);}
      $('#keyboard').append(div);
    }
  }
  function drawWords() {
    const stream=$('#word-stream');stream.replaceChildren();
    const current=document.createElement('span');current.className='current-word';
    const target=session.target;
    for(let i=0;i<Math.max(target.length,session.buffer.length);i++) {
      const char=document.createElement('span');char.textContent=target[i]||session.buffer[i];
      if(i<session.buffer.length)char.className=session.buffer[i]===target[i]?'letter-correct':'letter-wrong';
      else if(i===session.buffer.length)char.className='letter-cursor';
      current.append(char);
    }
    if(session.buffer===target&&target){const space=document.createElement('span');space.className='space-cue';space.textContent='SPACE ↵';current.append(space);}
    stream.append(current);
    const reaction=session.mode==='battle'&&['defend','counter'].includes(session.beat);
    if(reaction){const caption=document.createElement('span');caption.className='reaction-preview';caption.textContent=session.beat==='defend'?'Type this word + Space to dodge':'Type this word + Space to counter';stream.append(caption);}
    else for(const word of session.words.slice(1,5)){const span=document.createElement('span');span.className='upcoming';span.textContent=word;stream.append(span);}
    const incorrect=!target.startsWith(session.buffer);$('#typing-panel').classList.toggle('has-error',incorrect);
    input.setAttribute('aria-invalid',String(incorrect));
    if(target!==lastTarget){$('#target-accessible').textContent='Current word: '+target;lastTarget=target;}
    let next=incorrect?'Backspace':session.buffer===target?' ':target[session.buffer.length];
    if(!session.acceptingInput)next='';
    $('#next-key').textContent=next===' '?'SPACE':next?.toUpperCase()||'—';
    for(const cap of document.querySelectorAll('.keycap'))cap.classList.toggle('next',cap.dataset.key===next);
    input.value=session.buffer;
  }
  function controls() {
    const active=['playing','paused'].includes(session.status);
    for(const button of document.querySelectorAll('[data-mode]'))button.disabled=active;
    $('#lesson').disabled=active;$('#settings-note').hidden=!active;
    $('#pause').disabled=session.status==='finished';$('#finish').disabled=!active;input.disabled=session.status!=='playing';input.readOnly=!session.acceptingInput;
    $('#start-overlay').hidden=session.status!=='ready';
    $('#pause').innerHTML=active?'Pause <kbd>Esc</kbd>':'Menu <kbd>Esc</kbd>';
    $('#pause').setAttribute('aria-expanded',String(!!menu.open));
    $('#menu-title').textContent=active?'Session paused':'Session setup';
    $('#menu-description').textContent=active?'Your word, timer and battle turn are waiting right here.':'Choose your mode and word set. Start when you are ready.';
    $('#menu-start').hidden=active;$('#resume').hidden=!active;$('#finish').hidden=!active;
    $('#keyboard-guide').hidden=active;
    document.body.classList.toggle('session-active',active);
    $('#threat').hidden=session.mode!=='battle'||session.status==='ready';
    $('#beat-strip').hidden=session.mode!=='battle';$('#word-deadline').hidden=session.mode!=='battle';$('#encounter-route').hidden=session.mode!=='battle';
    $('#arena-mode').textContent=session.mode==='battle'?'BOSS BATTLE':'FREE PRACTICE';
    $('#clock-label').textContent=session.mode==='battle'?'TIME LEFT':'TIME';
    const prompts={charge:'CHARGE · Type to store ammo',volley:'RELEASE · Volley firing',defend:'DEFEND · Type to dodge',counter:'COUNTER · Type to strike the weak spot',retaliate:'ENEMY COUNTER · Boss attacking',recover:'RECOVER · Get ready for the next round'};
    $('#prompt-label').textContent=session.mode==='battle'?prompts[session.beat]:session.lesson==='sentences'?'TYPE THE SENTENCE · SPACE AFTER EACH WORD':'TYPE THE WORD + SPACE';
  }
  function hud() {
    const s=session.stats();
    $('#wpm').innerHTML=`${s.wpm} <small>WPM</small>`;$('#accuracy').innerHTML=`${s.accuracy}<small>%</small>`;
    $('#words').textContent=s.words;$('#clock').textContent=formatTime(session.mode==='battle'?s.remaining:s.elapsed);
    $('#combo').innerHTML=`${s.combo} <small>COMBO</small>`;
    $('#energy-fill').style.width=session.charge+'%';$('#energy-label').textContent=session.charge+'%';
    $('#boss-fill').style.width=session.bossHp+'%';$('#boss-hp').textContent=session.bossHp+' / 100';
    $('.boss-track').setAttribute('aria-valuenow',session.bossHp);
    $('.arena').classList.toggle('phase-two',session.phase===2);$('#phase-tag').textContent='PHASE 0'+session.phase;
    $('#hearts').innerHTML=Array.from({length:session.maxHp},(_,i)=>`<span${i>=session.hp?' class="heart-empty"':''}>♥</span>`).join(' ');
    $('#hearts').setAttribute('aria-label',`Health ${session.hp} of ${session.maxHp}`);
    $('#round-label').textContent=`ROUND ${String(session.round).padStart(2,'0')}`;
    $('.scene-caption span:first-child').textContent=session.mode==='battle'?['01 / NEON APPROACH','02 / COUNTER BRIDGE','03 / DRAKE CORE'][session.stage-1]:'01 / NEON ROOFTOPS';
    $('#ammo-count').textContent=session.beat==='volley'?Math.max(0,session.volley.length-session.volleyIndex):session.ammo.length;
    for(const step of document.querySelectorAll('[data-beat]'))step.classList.toggle('active',step.dataset.beat===session.beat);
    for(const stage of document.querySelectorAll('[data-stage]')){stage.classList.toggle('current',Number(stage.dataset.stage)===session.stage);stage.classList.toggle('cleared',Number(stage.dataset.stage)<session.stage);}
    const danger=session.mode==='battle'&&session.critical&&session.acceptingInput;
    $('#typing-panel').classList.toggle('danger-word',danger);$('#typing-panel').classList.toggle('word-urgent',session.wordLeft<2.5&&session.acceptingInput);
    $('#typing-panel').classList.toggle('input-locked',session.status==='playing'&&!session.acceptingInput);$('#typing-panel').dataset.beat=session.beat;
    $('#word-risk').textContent=danger?'! DANGER · Miss triggers an ultimate −2 ♥':session.acceptingInput?'Normal word · Wrong or late −1 ♥':'Word timer paused · Wait for the next beat';
    $('#word-clock').textContent=!session.started?'Starts when you type':!session.acceptingInput?'Timer paused':session.readGrace>0?'Read the word…':session.wordLeft.toFixed(1)+'s';
    $('#word-time-fill').style.width=Math.max(0,session.wordLeft/session.wordDuration*100)+'%';
    const timing={charge:'Your stored ammo will fire soon',volley:'Take a breath · Your guitar is firing',defend:'Type the dodge word before the boss attacks',counter:'Type to counter while the weak spot is open',retaliate:'One incoming hit · Get ready to type again',recover:'Returning to the charge phase'};
    $('#threat-label').textContent=!session.started?'Timer starts with your first letter':timing[session.beat];
    $('#threat-time').textContent=Math.max(0,session.beatLeft).toFixed(1)+'s';
    $('#threat-fill').style.width=Math.max(0,Math.min(100,session.beatLeft/Math.max(.01,session.beatDuration)*100))+'%';
    $('#threat').classList.toggle('urgent',session.beat==='defend');
    if(performance.now()>messageUntil){
      if(session.acceptingInput) {
        if(!session.target.startsWith(session.buffer))hint('Typo spotted · Use Backspace, then keep typing',true,100);
        else if(session.buffer===session.target)hint('Complete! Press Space before time runs out',false,100);
        else hint(session.mode==='battle'?'Backspace to edit · Space to submit when correct':'Match the word, then press Space · Backspace to edit',false,100);
      }
    }
  }
  function prepare() {
    session=new Session({mode,lesson:$('#lesson').value});scene.reset();resultShown=false;finishAt=0;lastTarget='';
    $('#results').close();$('#battle-callout').classList.remove('visible');$('#battle-callout').textContent='';calloutUntil=0;
    $('#lesson-note').textContent=LESSONS[session.lesson].thai+' · Lowercase, no punctuation';
    const battle=mode==='battle';
    $('#session-summary').textContent=(battle?'Boss battle':'Free practice')+' · '+LESSONS[session.lesson].title;
    $('#start-description').textContent=battle?'Type to charge → Fire a volley → Dodge → Counter':'Type the word correctly, then press Space to attack';
    $('#start-note').textContent=battle?'Wrong word or timeout −1 ♥ · Danger word −2 ♥':'Starts with your first letter · No time limit or lost hearts';
    $('#how-charge').textContent=battle?'Charge ammo · Release a volley each round':'Fire a shot from your guitar';
    $('#how-defense-title').textContent=battle?'Type to dodge, then counter':'Three perfect words in a row';
    $('#how-defense').textContent=battle?'The boss can attack every round':'Earn a powerful charged shot';
    $('#how-danger-title').textContent=battle?'Watch for danger words':'Fill the energy meter';
    $('#how-danger').textContent=battle?'Wrong or late: boss ultimate −2 ♥':'Unleash RGB Slash automatically';
    $('#mode-tip').textContent=battle?'Backspace fixes typos. Submit a wrong word and the boss strikes back!':'Typos cost no hearts. Use Backspace to fix them and keep typing.';
    $('#typing-hint').textContent='Use an English keyboard • Backspace to correct';$('#typing-hint').classList.remove('error-hint');
    input.placeholder='Start a session, then type here…';
    for(const b of document.querySelectorAll('[data-mode]')){const selected=b.dataset.mode===mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);}
    controls();drawWords();hud();bestDisplay();
  }
  function start() {
    if(!pageActive||!loaded||document.hidden||session.status!=='ready')return;
    session.start();last=performance.now();processEvents();controls();drawWords();
    closeMenu();
    input.placeholder='Type the word shown above…';input.focus({preventScroll:true});hint(session.mode==='battle'?'Space submits · Fix typos first or the boss strikes back!':'Start with the first word · Press Space after each word',false,5000);
  }
  function openMenu() {
    if(!pageActive||session.status==='finished'||menu.open)return;
    if(session.status==='playing'){session.pause();pausedAt=performance.now();}
    processEvents();drawWords();
    menu.showModal();controls();
    (session.status==='paused'?$('#resume'):$('#menu-start')).focus({preventScroll:true});
  }
  function resumeFromMenu() {
    if(menu.open||!pageActive||document.hidden)return;
    if(session.status==='paused'){
      const held=performance.now()-pausedAt;
      messageUntil+=held;calloutUntil+=held;
      session.resume();last=performance.now();processEvents();controls();drawWords();
      input.focus({preventScroll:true});
    }else if(session.status==='ready')$('#setup').focus({preventScroll:true});
  }
  function closeMenu() {
    if(menu.open)menu.close();
    resumeFromMenu();controls();
  }
  function toggleMenu() { if(menu.open)closeMenu();else openMenu(); }
  function finish() { session.finish('finished');processEvents();closeMenu();controls(); }
  function results() {
    resultShown=true;const s=session.stats(),won=session.reason==='victory';
    $('#result-kicker').textContent=won?'STAGE CLEAR / '+LESSONS[session.lesson].title.toUpperCase():'SESSION COMPLETE';
    $('#result-title').textContent=won?'You found your rhythm.':session.reason==='defeat'?'One more beat.':'Nice practice.';
    $('#result-description').textContent=won?'Synth Drake defeated! Every word helped power your victory.':session.reason==='defeat'?'The boss won this round. Try Free practice to build confidence at your own pace.':session.reason==='timeout'?'Time is up. Try again and keep building your accuracy.':'Take a break and come back when you are ready.';
    $('#result-wpm').textContent=s.wpm;$('#result-accuracy').textContent=s.accuracy+'%';$('#result-combo').textContent=s.bestCombo;
    $('#result-details').textContent=`${s.words} words completed · ${formatTime(s.elapsed)} elapsed · ${s.ultimates} ultimates`+(session.mode==='battle'?` · ${s.parries} dodges · ${s.failedWords} missed words (${s.criticalMisses} danger words)`:` · ${s.perfectWords} words correct on the first try`);
    const review=$('#result-review');review.replaceChildren();
    if(s.reviewWords.length){review.append('Practice these words: ');const b=document.createElement('b');b.textContent=s.reviewWords.join(' · ');review.append(b);review.append(document.createElement('br'));review.append('Keys to review: '+s.mistakes.map(([k,n])=>`${k} (${n})`).join(' · '));}
    else review.textContent=s.words?'Great accuracy! Try Everyday words or Short sentences next.':'Start with short words and put accuracy before speed.';
    if(s.elapsed>=15&&s.words>=5){
      const key=recordKey(),previous=bestRecords[key];
      if(!previous||s.wpm>previous.wpm||(s.wpm===previous.wpm&&s.accuracy>previous.accuracy)){
        bestRecords[key]={wpm:s.wpm,accuracy:s.accuracy};try{localStorage.setItem('punkman-key-battle-records',JSON.stringify(bestRecords));}catch{}
      }
    }
    $('#results').showModal();$('#again').focus();bestDisplay();
  }
  input.addEventListener('keydown',e=>{
    if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Escape')return;
    if(!session.acceptingInput){if(e.key.length===1||e.key==='Backspace')e.preventDefault();return;}
    if(e.key==='Backspace'||e.key===' '||/^[a-zA-Z]$/.test(e.key)){
      e.preventDefault();
      if(e.repeat&&e.key!=='Backspace')return;
      if(e.key==='Backspace'&&input.selectionStart===0&&input.selectionEnd===session.buffer.length){while(session.buffer)session.input('Backspace');}
      else session.input(e.key);
      processEvents();drawWords();hud();
      if(e.getModifierState?.('CapsLock'))hint('Caps Lock is on · This word set uses lowercase',true,2400);
    } else if(e.key.length===1){e.preventDefault();hint('Switch to an English keyboard (EN) · Use a–z',true);}
  });
  input.addEventListener('paste',e=>{e.preventDefault();hint('Type the words yourself to build fluency',false);});
  input.addEventListener('drop',e=>e.preventDefault());
  // Mobile keyboards can use input events without a meaningful keydown.
  input.addEventListener('input',e=>{
    if(e.isComposing)return;
    if(menu.open||session.status!=='playing'){drawWords();return;}
    if(e.inputType==='deleteContentBackward')session.input('Backspace');
    else if(e.inputType==='insertText'&&typeof e.data==='string'&&e.data.length===1){if(!session.input(e.data))hint('Use an English keyboard and type one letter at a time',true);}
    else hint('Type one letter at a time · Turn off autocomplete',false);
    processEvents();drawWords();hud();
  });
  input.addEventListener('compositionend',()=>{drawWords();hint('Switch to an English keyboard (EN) before typing',true);});
  document.addEventListener('keydown',e=>{
    if(!pageActive||$('#results').open)return;
    // Let the dialog handle its native Escape/cancel and every form shortcut.
    if(menu.open){
      if(e.key==='Escape'&&e.repeat)e.preventDefault();
      return;
    }
    if(e.target!==input&&(e.target?.isContentEditable||e.target?.closest?.('a,button,input,select,textarea')))return;
    if(e.key==='Escape'&&!e.repeat){e.preventDefault();toggleMenu();}
  });
  window.addEventListener('blur',()=>{if(session.status==='playing')openMenu();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&session.status==='playing')openMenu();});
  window.addEventListener('pagehide',()=>{
    if(!pageActive)return;
    pageActive=false;loaded=false;finishAt=0;session.pause();scene.reset();input.disabled=true;$('#start').disabled=true;$('#menu-start').disabled=true;
    try{audio?.close().catch(()=>{});}catch{}
  });
  window.addEventListener('pageshow',e=>{if(e.persisted)window.location.reload();});
  $('#start').addEventListener('click',start);$('#menu-start').addEventListener('click',start);
  $('#setup').addEventListener('click',openMenu);$('#pause').addEventListener('click',toggleMenu);
  $('#resume').addEventListener('click',closeMenu);$('#menu-close').addEventListener('click',closeMenu);
  menu.addEventListener('cancel',e=>{e.preventDefault();closeMenu();});
  menu.addEventListener('close',resumeFromMenu);
  $('#finish').addEventListener('click',finish);
  $('#again').addEventListener('click',()=>{prepare();start();});
  $('#change-session').addEventListener('click',()=>{prepare();openMenu();$('#lesson').focus();});
  $('#results').addEventListener('cancel',e=>{e.preventDefault();prepare();openMenu();});
  for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>{if(session.status!=='ready')return;mode=button.dataset.mode;prepare();});
  $('#lesson').addEventListener('change',()=>{if(session.status==='ready')prepare();else $('#lesson').value=session.lesson;});
  $('#sound').addEventListener('click',()=>{sound=!sound;$('#sound').textContent='Sound: '+(sound?'On':'Off');$('#sound').setAttribute('aria-pressed',sound);beep(660,.08);});
  function motionUI(){document.body.classList.toggle('reduced-motion',!scene.motion);$('#motion').textContent='Effects: '+(scene.motion?'On':'Reduced');$('#motion').setAttribute('aria-pressed',scene.motion);}
  $('#motion').addEventListener('click',()=>{scene.motion=!scene.motion;motionUI();});
  function fitViewport() {
    const viewport=window.visualViewport;
    const height=viewport?.height||window.innerHeight;
    if(Number.isFinite(height))document.documentElement?.style.setProperty('--play-viewport-height',height+'px');
    document.body.classList.toggle('keyboard-open',!!viewport&&window.innerHeight-viewport.height>140);
  }
  window.addEventListener('resize',fitViewport);
  window.visualViewport?.addEventListener?.('resize',fitViewport);
  window.visualViewport?.addEventListener?.('scroll',fitViewport);
  function frame(now) {
    if(!pageActive)return;
    const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
    session.tick(dt);processEvents();
    if(session.status!=='paused'&&!menu.open&&!document.hidden)scene.draw(session,dt);
    if(now-lastHud>100){hud();lastHud=now;}
    if(session.status!=='paused'&&now>calloutUntil){$('#battle-callout').classList.remove('visible');$('#battle-callout').textContent='';}
    if(finishAt&&now>=finishAt&&!resultShown)results();
    requestAnimationFrame(frame);
  }
  keyboard();prepare();motionUI();fitViewport();requestAnimationFrame(frame);
  scene.ready.then(()=>{if(!pageActive)return;loaded=true;for(const button of [$('#start'),$('#menu-start')]){button.disabled=false;button.textContent='Start typing →';}}).catch(error=>{if(!pageActive)return;for(const button of [$('#start'),$('#menu-start')])button.textContent='Images could not load';hint('Some game images could not load. Refresh the page to try again.',true,600000);console.error(error);});
  // Read-only diagnostics used during local QA; gameplay never depends on them.
  window.keyBattleSnapshot=()=>({...session.stats(),status:session.status,mode:session.mode,lesson:session.lesson,target:session.target,buffer:session.buffer,hp:session.hp,bossHp:session.bossHp,phase:session.phase,charge:session.charge,beat:session.beat,beatLeft:session.beatLeft,wordLeft:session.wordLeft,critical:session.critical,round:session.round,ammo:session.ammo.length,acceptingInput:session.acceptingInput,parked:session.parked,started:session.started,loaded,actors:scene.actors,results:$('#results').open});
})();
