/* Tempo Rush × Scale Flow demo — one scale as a falling-note chart: rounds, patterns, a rising tempo, real pitches. Entirely local. */
import {RhythmSession} from './engine.js';
import {AudioTransport} from './transport.js';
import {TempoRenderer} from './renderer.js';
import {buildScaleChart, renderBackingTrack, midiHz, roundStats, LANE_KEYS, advancePracticeClock, nextPendingTime, isFrozen, dueAutoPresses, crossed} from './scale-chart.js?v=2';

const ScaleFlow=window.ScaleFlow;
const $=id=>document.getElementById(id),KEYS=['KeyD','KeyF','KeyJ','KeyK'];
const formatTime=t=>`${Math.floor(Math.max(0,t)/60)}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function readSaved(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
let best=readSaved('tempo-rush-scale-flow-best-v1',{});if(!best||typeof best!=='object'||Array.isArray(best))best={};
const settings=readSaved('tempo-rush-settings-v1',{})||{};
const config={mode:'battle',root:'C',type:'major',position:'r5',octave:'full',routine:ScaleFlow.RULES.defaultRoutine,bpm:ScaleFlow.RULES.defaultBpm};
let guide=true,auto=false,autoUsed=false,state='menu',session=null,built=null,activeTrack=null,runToken=0,assetsReady=false,pauseRequested=false,calloutUntil=0,lastRound=-1;
// Practice · notes wait: a manual clock (seconds, starts at −3 like the lead-in) that freezes on the next note until it is hit.
let clock=0,frozen=false,lastAuto=-Infinity;const autoHeld=new Set();
const transport=new AudioTransport(),physicalKeys=new Set();
const now=()=>config.mode==='practice'?clock:transport.time();
const practice=()=>config.mode==='practice';
const laneButtons=[...document.querySelectorAll('[data-lane]')];
let inputOffset=Number.isFinite(settings.offset)?clamp(settings.offset,-200,200):0;
let volume=Number.isFinite(settings.volume)?clamp(settings.volume,0,100):70;

/** Falling notes carry their note name (and fret) so the lane becomes a position on the neck. */
class ScaleRenderer extends TempoRenderer{
  drawNotes(ctx,session,time,travel){
    super.drawNotes(ctx,session,time,travel);
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
    for(const n of session.notes){
      if(n.status!=='pending')continue;const head=1-(n.time-time)/travel;if(head<0||head>1)continue;
      const g=this.geometry(n.lane,head),size=9+9*g.t;
      if(n.isRoot){ctx.strokeStyle='#ff5a86';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(g.x,g.y,(g.right-g.left)/2-2,size*.95,0,0,Math.PI*2);ctx.stroke();}
      ctx.font=`bold ${size}px Consolas,"Courier New",monospace`;ctx.fillStyle='#ffffff';ctx.fillText(n.label,g.x,g.y-size*.15);
      if(g.t>.35){ctx.font=`${Math.max(8,size*.6)}px Consolas,"Courier New",monospace`;ctx.fillStyle='#e8e2ff';ctx.fillText(`fr ${n.fret}`,g.x,g.y+size*.8);}
    }
    ctx.restore();
  }
}
const renderer=new ScaleRenderer($('stage'));
renderer.reducedMotion=typeof settings.reduceMotion==='boolean'?settings.reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches;
$('volume').value=volume;$('volume-value').value=`${volume}%`;$('reduce-motion').checked=renderer.reducedMotion;$('guide').checked=guide;transport.setVolume(volume/100);
for(let value=-200;value<=200;value+=10){const option=document.createElement('option');option.value=String(value);option.textContent=`${value>0?'+':''}${value} ms`;option.selected=value===inputOffset;$('offset').appendChild(option);}
function saveSettings(){save('tempo-rush-settings-v1',{...settings,volume,offset:inputOffset,reduceMotion:renderer.reducedMotion});}
$('volume').addEventListener('input',()=>{volume=Number($('volume').value);$('volume-value').value=`${volume}%`;transport.setVolume(volume/100);saveSettings();});
$('offset').addEventListener('change',()=>{inputOffset=Number($('offset').value);saveSettings();});
$('reduce-motion').addEventListener('change',()=>{renderer.reducedMotion=$('reduce-motion').checked;saveSettings();});
$('guide').addEventListener('change',()=>{guide=$('guide').checked;updateSelection();});
$('auto').addEventListener('change',()=>{auto=$('auto').checked;updateSelection();});

// ---------- Scale setup ----------
for(const n of ScaleFlow.NOTE_NAMES){const o=document.createElement('option');o.value=n;o.textContent=n;$('root').appendChild(o);}
for(const t of Object.keys(ScaleFlow.DATA.titles)){const o=document.createElement('option');o.value=t;o.textContent=ScaleFlow.DATA.titles[t];$('scale-type').appendChild(o);}
$('root').addEventListener('change',()=>{config.root=$('root').value;updateSelection();});
$('scale-type').addEventListener('change',()=>{config.type=$('scale-type').value;updateSelection();});
$('bpm').addEventListener('input',()=>{config.bpm=Number($('bpm').value);$('bpm-value').value=`${config.bpm} BPM`;updateSelection();});
for(const [attr,key] of [['mode','mode'],['position','position'],['octave','octave'],['routine','routine']])document.querySelectorAll(`[data-${attr}]`).forEach(button=>button.addEventListener('click',()=>{if(state!=='menu')return;config[key]=button.dataset[attr];updateSelection();}));
const title=()=>`${config.root} ${ScaleFlow.DATA.titles[config.type]}`;
const positionLabel=()=>config.position==='r5'?'R 5th string':'R 6th string';
const octaveLabel=()=>config.octave==='full'?'Full':config.octave==='lower'?'Oct 1':'Oct 2';
const routineLabel=()=>ScaleFlow.ROUTINES[config.routine].title;
const modeLabel=()=>practice()?'Practice · notes wait':'Flow battle';
const recordKey=()=>[config.mode,config.root,config.type,config.position,config.octave,config.routine,practice()?0:config.bpm,guide?'guide':'noguide'].join('|');
const tempoRange=rounds=>{const list=rounds.map(r=>r.bpm),lo=Math.min(...list),hi=Math.max(...list);return lo===hi?`${lo} BPM`:`${lo}→${hi} BPM`;};
function preview(){return buildScaleChart({...config,seed:1},ScaleFlow);}
function updateSelection(){
  const busy=state==='loading';
  for(const [attr,key] of [['mode','mode'],['position','position'],['octave','octave'],['routine','routine']])document.querySelectorAll(`[data-${attr}]`).forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset[attr]===config[key]));button.disabled=busy;});
  $('root').value=config.root;$('scale-type').value=config.type;$('bpm').value=config.bpm;$('bpm-value').value=`${config.bpm} BPM`;$('root').disabled=busy;$('scale-type').disabled=busy;$('bpm').disabled=busy;
  const p=preview(),names=p.rounds.map(r=>r.name).join(' → ');
  $('selection-detail').textContent=`${p.rounds.length} round${p.rounds.length>1?'s':''} · ${p.chart.notes.length} notes · ${names} · ${practice()?'notes wait for you · no tempo':`${tempoRange(p.rounds)} · about ${formatTime(p.totalMs/1000)}`}`;
  const record=best[recordKey()];
  $('best-line').textContent=auto?'Auto run on · the flow plays itself and scores are not saved':Number.isFinite(record?.score)?`BEST ${record.score.toLocaleString()} · ${record.accuracy.toFixed(1)}% · ${title()} · ${positionLabel()} · ${octaveLabel()} · ${routineLabel()}${practice()?' · practice':` · ${config.bpm} BPM`}`:'No personal best yet for this setup';
  $('bpm').disabled=busy;$('footer-hint').textContent=practice()?'Notes wait for your key · Esc to pause':'Lane = string · Esc to pause';
}
function showScreen(name){$('lobby').hidden=name!=='menu';$('game').hidden=name!=='game';$('results').hidden=name!=='results';}
async function loadSprites(){
  $('start').disabled=true;
  try{await renderer.load();assetsReady=true;$('start').innerHTML='Start the flow <span aria-hidden="true">↗</span>';$('load-status').textContent='';}
  catch(error){assetsReady=false;$('load-status').textContent='Artwork could not load. Select Retry artwork to try again.';$('start').textContent='Retry artwork';console.error(error);}
  $('start').disabled=false;
}

// ---------- Sounds: the note itself, live, on a hit ----------
function pluck(midi,volumeLevel=.5,length=.4){
  const context=transport.context;if(!context||!transport.gain)return;
  try{
    const hz=midiHz(midi),t=context.currentTime,gain=context.createGain();
    gain.gain.setValueAtTime(volumeLevel,t);gain.gain.exponentialRampToValueAtTime(.001,t+length);gain.connect(transport.gain);
    for(const [type,mult,level] of [['triangle',1,1],['sawtooth',1,.3],['sine',2,.2]]){const o=context.createOscillator(),g=context.createGain();o.type=type;o.frequency.setValueAtTime(hz*mult,t);g.gain.setValueAtTime(level,t);o.connect(g);g.connect(gain);o.start(t);o.stop(t+length);}
  }catch{}
}
function click(accent){
  const context=transport.context;if(!context||!transport.gain)return;
  try{const t=context.currentTime,o=context.createOscillator(),g=context.createGain();o.type='square';o.frequency.setValueAtTime(accent?1500:1000,t);o.frequency.exponentialRampToValueAtTime(accent?900:700,t+.035);g.gain.setValueAtTime(accent?.22:.14,t);g.gain.exponentialRampToValueAtTime(.001,t+.035);o.connect(g);g.connect(transport.gain);o.start(t);o.stop(t+.04);}catch{}
}
function thud(){
  const context=transport.context;if(!context||!transport.gain)return;
  try{const t=context.currentTime,o=context.createOscillator(),g=context.createGain();o.type='square';o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(50,t+.25);g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g);g.connect(transport.gain);o.start(t);o.stop(t+.25);}catch{}
}
function callout(text,duration=1500){$('round-callout').textContent=text;$('round-callout').classList.add('visible');calloutUntil=performance.now()+duration;}

// ---------- Run lifecycle (mirrors app.js) ----------
async function startRun(){
  if(state==='loading')return;
  if(!assetsReady){await loadSprites();return;}
  const token=++runToken;transport.stop();physicalKeys.clear();
  state='loading';pauseRequested=false;showScreen('menu');$('pause-panel').hidden=true;$('start').disabled=true;$('start').textContent='Preparing your scale…';$('load-status').textContent='Rendering the backing track… Press Esc to cancel.';updateSelection();
  try{
    await transport.unlock();
    if(token!==runToken)return;
    built=buildScaleChart({...config,seed:(Date.now()^Math.floor(Math.random()*0x7fffffff))>>>0},ScaleFlow);
    const context=transport.context;let buffer=null;
    if(!practice()){const samples=renderBackingTrack({beats:built.beats,notes:built.chart.notes,totalMs:built.totalMs},context.sampleRate,{guide});buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.copyToChannel(samples,0);}
    if(token!==runToken)return;
    session=new RhythmSession(built.chart);renderer.reset();state='countdown';lastRound=-1;calloutUntil=0;$('round-callout').classList.remove('visible');
    clock=-3;frozen=false;lastAuto=-Infinity;autoHeld.clear();autoUsed=false;$('auto-tag').hidden=!auto;$('mode-tag').textContent=practice()?'PRACTICE · NOTES WAIT':'';
    activeTrack={id:'scale-flow',title:title(),bpm:config.bpm,key:title(),duration:built.totalMs/1000,sections:built.rounds.map(r=>({id:`round-${r.index}`,label:`ROUND ${r.index+1}/${built.rounds.length} · ${r.name.toUpperCase()} · ${r.bpm} BPM`,start:r.start,end:r.end}))};
    $('game-title').firstChild.textContent=title()+' ';$('game-difficulty').textContent=`${positionLabel()} · ${octaveLabel()} · ${routineLabel()} · ${tempoRange(built.rounds)}`.toUpperCase();
    $('pause').disabled=false;$('resume').disabled=false;$('load-status').textContent='';showScreen('game');
    if(buffer)transport.start(buffer,()=>{if(token===runToken)finishRun();},3);$('stage').focus({preventScroll:true});
    $('announcement').textContent=practice()?`Starting ${title()} practice, ${built.rounds.length} rounds. Each note waits for its key.`:`Starting ${title()}, ${built.rounds.length} rounds. Press D F J K to the beat.`;
    if(pauseRequested||document.hidden||!document.hasFocus())await pauseRun('Paused automatically when the game window lost focus.');
  }catch(error){
    if(token!==runToken)return;
    transport.stop();state='menu';showScreen('menu');$('load-status').textContent=`${error.message} — Select Start the flow to try again.`;console.error(error);
  }finally{
    if(token===runToken){$('start').disabled=false;$('start').innerHTML='Start the flow <span aria-hidden="true">↗</span>';updateSelection();}
  }
}
function toMenu(message=''){
  ++runToken;transport.stop();physicalKeys.clear();session=null;state='menu';$('pause-panel').hidden=true;showScreen('menu');
  $('start').disabled=!assetsReady;$('start').innerHTML='Start the flow <span aria-hidden="true">↗</span>';$('load-status').textContent=message;updateSelection();$('start').focus({preventScroll:true});
}
async function pauseRun(reason='Backing track and notes are paused together. Resume when you are ready.'){
  if(['loading','resuming'].includes(state)){pauseRequested=true;return;}
  if(!['playing','countdown'].includes(state))return;
  const token=runToken;state='pausing';physicalKeys.clear();releaseAuto();
  if(!practice()){try{await transport.pause();}catch(error){if(token===runToken){console.error(error);toMenu('Audio could not pause. Try restarting the flow.');}return;}}
  if(token!==runToken||state!=='pausing')return;
  session.advance(now()-(practice()?0:inputOffset/1000));flushEvents();session.suspendInputs();state='paused';
  $('pause-reason').textContent=reason;$('pause-panel').hidden=false;$('resume').disabled=false;$('resume').focus({preventScroll:true});
}
async function resumeRun(){
  if(state!=='paused')return;const token=runToken;state='resuming';pauseRequested=false;$('resume').disabled=true;
  session.resumeAt(now()-(practice()?0:inputOffset/1000));
  if(!practice()){try{await transport.resume();}catch(error){if(token===runToken){state='paused';$('resume').disabled=false;$('pause-reason').textContent='Audio could not resume. Please try again.';}return;}}
  if(token!==runToken||state!=='resuming')return;
  state=now()<0?'countdown':'playing';$('pause-panel').hidden=true;$('resume').disabled=false;$('stage').focus({preventScroll:true});
  if(pauseRequested||document.hidden||!document.hasFocus())await pauseRun('Paused automatically when the game window lost focus.');
}
function finishRun(){
  if(!session||state==='results'||state==='menu')return;
  session.finish();const result=session.summary();transport.stop();physicalKeys.clear();state='results';$('pause-panel').hidden=true;$('round-callout').classList.remove('visible');
  const key=recordKey(),previous=best[key],newBest=!autoUsed&&(!Number.isFinite(previous?.score)||result.score>previous.score);
  let stored=true;if(newBest){best[key]={score:result.score,accuracy:result.accuracy,rank:result.rank};stored=save('tempo-rush-scale-flow-best-v1',best);}
  $('result-title').textContent=title();$('result-level').textContent=`${positionLabel()} · ${octaveLabel()} · ${routineLabel()} · ${modeLabel()}${practice()?'':` · ${tempoRange(built.rounds)} · ${formatTime(built.totalMs/1000)}`}${autoUsed?' · AUTO RUN':''}`;
  $('rank').textContent=result.rank;$('result-score').textContent=result.score.toLocaleString();
  $('result-accuracy').textContent=`${result.accuracy.toFixed(1)}%`;$('result-combo').textContent=result.maxCombo;$('result-notes').textContent=result.total;
  $('best-message').textContent=autoUsed?'AUTO RUN · not saved':!stored?'This score could not be saved in your browser.':newBest?'NEW PERSONAL BEST':Number.isFinite(best[key]?.score)?`PERSONAL BEST ${best[key].score.toLocaleString()}`:'Personal best on this device';
  $('result-counts').innerHTML=Object.entries(result.counts).map(([name,count])=>`<div>${name==='ghost'?'EXTRA / WRONG LANE':name.toUpperCase()}<b>${count}</b></div>`).join('');
  const table=$('round-table');table.replaceChildren();
  for(const r of roundStats(session.notes,built.rounds)){const row=document.createElement('div');for(const [tag,text] of [['b',String(r.index+1).padStart(2,'0')],['span',`${r.name} · ${r.bpm} BPM`],['strong',`${r.hits}/${r.total}`],['em',`${r.accuracy.toFixed(0)}%`]]){const c=document.createElement(tag);c.textContent=text;row.appendChild(c);}table.appendChild(row);}
  const longer=config.routine==='single'?'set':config.routine==='set'?'marathon':null;
  $('result-tip').textContent=result.fullCombo?`FULL COMBO! Every note of ${title()} hit.${longer?` Go longer: the ${ScaleFlow.ROUTINES[longer].title} (${ScaleFlow.ROUTINES[longer].tag}).`:config.bpm+10<=ScaleFlow.RULES.maxBpm?` Try ${config.bpm+10} BPM.`:' Try a new scale type or the other position.'}`:result.accuracy>=80?`You found the scale. ${longer?`Next: the ${ScaleFlow.ROUTINES[longer].title} adds patterns and raises the tempo.`:`Try ${Math.min(ScaleFlow.RULES.maxBpm,config.bpm+10)} BPM or the other position.`}`:'Watch the note names and listen to the pitches. Start with one octave or a slower tempo, then rebuild the flow.';
  showScreen('results');$('retry-result').focus({preventScroll:true});$('announcement').textContent=`${title()} complete. Score ${result.score}. Accuracy ${result.accuracy.toFixed(1)} percent.`;
}
function flushEvents(){
  for(const event of session?.drainEvents()||[]){
    renderer.event(event);
    if(event.type==='judgement'&&event.judgement!=='miss')pluck(event.note.pitch,event.judgement==='perfect'?.6:.45);
    else if(event.type==='ghost'||event.judgement==='miss')thud();
  }
}
function lanePress(lane){
  if(state!=='playing')return;
  if(practice()){
    // Notes wait: the right lane resolves the waiting note (PERFECT); a wrong lane only shows which lane it is.
    const next=session.notes.find(n=>n.status==='pending');if(!next)return;
    if(next.lane===lane&&(frozen||Math.abs(clock-next.time)<=.18)){session.press(lane,frozen?next.time:clock);flushEvents();}
    else{callout(`LANE ${LANE_KEYS[next.lane]} · STRING ${next.string} · ${next.label}`,900);thud();}
    return;
  }
  session.press(lane,transport.time()-inputOffset/1000);flushEvents();
}
function laneRelease(lane){if(state!=='playing')return;session.release(lane,now()-(practice()?0:inputOffset/1000));flushEvents();}
/** Auto run: press the right lane for every note that has arrived; release it on the next frame unless a real key holds it. */
function releaseAuto(){for(const lane of autoHeld){if(!physicalKeys.has(KEYS[lane])&&session)session.release(lane,now());}autoHeld.clear();}
function autoPress(time){
  for(const n of dueAutoPresses(session.notes,time,lastAuto)){lastAuto=Math.max(lastAuto,n.time);if(session.down[n.lane])continue;session.press(n.lane,n.time);autoHeld.add(n.lane);autoUsed=true;}
}
document.addEventListener('keydown',event=>{
  if(event.code==='Tab'&&['paused','resuming'].includes(state)){
    const buttons=[...$('pause-panel').querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;
  }
  if(event.code==='Escape'){
    if(event.repeat)return;event.preventDefault();if(state==='paused')resumeRun();else if(state==='loading')toMenu('Loading canceled.');else pauseRun();return;
  }
  if(event.code==='Space'&&state==='paused'){event.preventDefault();if(!event.repeat)resumeRun();return;}
  const lane=KEYS.indexOf(event.code);if(lane<0||!['playing','countdown'].includes(state)||event.ctrlKey||event.altKey||event.metaKey)return;
  event.preventDefault();if(event.repeat||physicalKeys.has(event.code))return;physicalKeys.add(event.code);lanePress(lane);
});
document.addEventListener('keyup',event=>{const lane=KEYS.indexOf(event.code);if(lane<0)return;physicalKeys.delete(event.code);laneRelease(lane);});
laneButtons.forEach(button=>{
  const lane=Number(button.dataset.lane);
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);lanePress(lane);});
  button.addEventListener('pointerup',()=>laneRelease(lane));button.addEventListener('pointercancel',()=>laneRelease(lane));button.addEventListener('lostpointercapture',()=>laneRelease(lane));
  button.addEventListener('keydown',event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();event.stopPropagation();if(!event.repeat)lanePress(lane);}});
  button.addEventListener('keyup',event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();event.stopPropagation();laneRelease(lane);}});
});
$('start').addEventListener('click',startRun);$('pause').addEventListener('click',()=>pauseRun());$('resume').addEventListener('click',resumeRun);
for(const id of ['retry-top','retry-pause','retry-result'])$(id).addEventListener('click',startRun);
for(const id of ['menu-pause','menu-result'])$(id).addEventListener('click',()=>toMenu());
window.addEventListener('blur',()=>pauseRun('Paused automatically when the game window lost focus.'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseRun('Paused automatically when you switched tabs.');});
window.addEventListener('pagehide',()=>toMenu());

// ---------- Frame ----------
let previousFrame=performance.now();
function frame(stamp){
  const dt=Math.min(.05,(stamp-previousFrame)/1000);previousFrame=stamp;
  if(session&&activeTrack&&built&&['playing','countdown','paused','pausing','resuming'].includes(state)){
    if(autoHeld.size)releaseAuto();
    if(practice()&&['playing','countdown'].includes(state)){
      const before=clock,nextT=nextPendingTime(session.notes);clock=advancePracticeClock(clock,dt,nextT);frozen=isFrozen(clock,nextT);
      for(const b of crossed(built.beats,before*1000,clock*1000,b=>b.at))click((b.countIn&&b.beat===0)||(!b.countIn&&b.roundStep%4===0));
      if(guide)for(const n of crossed(built.chart.notes,before,clock,n=>n.time))pluck(n.pitch,.35,.3);
      if(!Number.isFinite(nextT)&&clock>=built.chart.notes[built.chart.notes.length-1].time+1){finishRun();requestAnimationFrame(frame);return;}
    }
    const time=now();if(state==='countdown'&&time>=0)state='playing';
    if(state==='playing'){session.advance(time-(practice()?0:inputOffset/1000));if(auto)autoPress(time);flushEvents();}
    const round=built.rounds.find(r=>time>=r.start&&time<r.end)||(time>=0?built.rounds[built.rounds.length-1]:null);
    if(round)activeTrack.bpm=round.bpm;
    if(round&&round.index!==lastRound&&state==='playing'){lastRound=round.index;if(round.index>0)callout(`ROUND ${round.index+1} · ${round.short} · ${round.bpm} BPM`);}
    renderer.draw(activeTrack,session,time,dt,{state,difficulty:'normal'});
    $('score').textContent=String(session.score).padStart(6,'0');$('combo').innerHTML=`${session.combo} <small>×${session.multiplier}</small>`;$('accuracy').innerHTML=`${session.accuracy.toFixed(1)}<small>%</small>`;
    $('progress').style.width=`${practice()?session.resolved/session.notes.length*100:clamp(time/activeTrack.duration,0,1)*100}%`;
    $('song-time').innerHTML=practice()?`<small>TIME</small> ${formatTime(Math.max(0,time))}`:`<small>TIME LEFT</small> ${formatTime(Math.max(0,activeTrack.duration-time))}`;
    $('section-name').textContent=time<0?'GET READY':round?(time<round.firstNote-ScaleFlow.RULES.goodMs/1000?`COUNT-IN · ${round.name.toUpperCase()} · ${round.bpm} BPM`:`ROUND ${round.index+1}/${built.rounds.length} · ${round.name.toUpperCase()} · ${round.bpm} BPM`):'LAST NOTES';
    const next=session.notes.find(n=>n.status==='pending');
    $('next-label').textContent=next?next.label:'♪';$('next-label').classList.toggle('is-root',!!next?.isRoot);$('next-detail').textContent=next?`${LANE_KEYS[next.lane]} · string ${next.string} · fret ${next.fret}`:'flow complete';
    laneButtons.forEach((button,i)=>button.classList.toggle('pressed',session.down[i]));
    $('arena').classList.toggle('waiting',practice()&&frozen&&state==='playing');
    if(state!=='paused'&&now>calloutUntil)$('round-callout').classList.remove('visible');
  }
  requestAnimationFrame(frame);
}
// Read-only developer snapshot for local playtest inspection; no auto-play controls.
window.TempoRushScaleFlow=Object.freeze({snapshot:()=>({state,config:{...config},mode:config.mode,guide,auto,autoUsed,clock:now(),frozen,nextNoteTime:session?nextPendingTime(session.notes):null,resolved:session?.resolved,time:transport.time(),audioState:transport.context?.state,sourceActive:Boolean(transport.source),offset:inputOffset,rounds:built?.rounds,totalMs:built?.totalMs,summary:session?.summary(),down:session?[...session.down]:[],nextNotes:session?session.notes.filter(n=>n.status==='pending').slice(0,8).map(n=>({time:n.time,lane:n.lane,label:n.label,string:n.string,fret:n.fret,round:n.round})):[]})});
updateSelection();loadSprites();requestAnimationFrame(frame);
