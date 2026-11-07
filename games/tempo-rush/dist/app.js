import {TRACKS} from './data/tracks.js';
import {RhythmSession} from './engine.js';
import {AudioTransport} from './transport.js';
import {TempoRenderer} from './renderer.js';

const $=id=>document.getElementById(id),KEYS=['KeyD','KeyF','KeyJ','KeyK'];
const formatTime=t=>`${Math.floor(Math.max(0,t)/60)}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function readSaved(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
let best=readSaved('tempo-rush-best-v1',{});if(!best||typeof best!=='object'||Array.isArray(best))best={};
const settings=readSaved('tempo-rush-settings-v1',{})||{};
let selected=TRACKS[0],difficulty='easy',state='menu',session=null,activeTrack=null,runToken=0,loadAbort=null,assetsReady=false,pauseRequested=false;
const renderer=new TempoRenderer($('stage')),transport=new AudioTransport(),buffers=new Map(),physicalKeys=new Set();
const laneButtons=[...document.querySelectorAll('[data-lane]')];
let inputOffset=Number.isFinite(settings.offset)?clamp(settings.offset,-200,200):0;
let volume=Number.isFinite(settings.volume)?clamp(settings.volume,0,100):70;
renderer.reducedMotion=typeof settings.reduceMotion==='boolean'?settings.reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches;
$('volume').value=volume;$('volume-value').value=`${volume}%`;$('reduce-motion').checked=renderer.reducedMotion;transport.setVolume(volume/100);
for(let value=-200;value<=200;value+=10){const option=document.createElement('option');option.value=String(value);option.textContent=`${value>0?'+':''}${value} ms`;option.selected=value===inputOffset;$('offset').appendChild(option);}
function saveSettings(){save('tempo-rush-settings-v1',{volume,offset:inputOffset,reduceMotion:renderer.reducedMotion});}
$('volume').addEventListener('input',()=>{volume=Number($('volume').value);$('volume-value').value=`${volume}%`;transport.setVolume(volume/100);saveSettings();});
$('offset').addEventListener('change',()=>{inputOffset=Number($('offset').value);saveSettings();});
$('reduce-motion').addEventListener('change',()=>{renderer.reducedMotion=$('reduce-motion').checked;saveSettings();});

TRACKS.forEach((track,index)=>{
  const button=document.createElement('button');button.type='button';button.className='song-card';button.dataset.song=track.id;button.setAttribute('aria-label',`Select ${track.title}`);
  button.innerHTML=`<canvas class="song-art" width="512" height="160" aria-hidden="true"></canvas><div class="song-info"><div class="song-name-row"><h2>${track.title}</h2><span class="selected-mark">SELECTED</span></div><div class="song-meta"><span>${track.bpm} BPM</span><span>${track.key}</span><span>${formatTime(track.duration)}</span></div><p class="song-description">${track.description}</p><div class="song-best"><span class="note-count"></span><strong class="personal-best"></strong></div></div>`;
  button.addEventListener('click',()=>{if(state!=='menu')return;selected=track;updateSelection();});$('song-grid').appendChild(button);
});
document.querySelectorAll('[data-difficulty]').forEach(button=>button.addEventListener('click',()=>{if(state!=='menu')return;difficulty=button.dataset.difficulty;updateSelection();}));
function updateSelection(){
  document.querySelectorAll('[data-song]').forEach(button=>{
    const track=TRACKS.find(t=>t.id===button.dataset.song),record=best[`${track.id}:${difficulty}`];
    button.setAttribute('aria-pressed',String(track.id===selected.id));button.disabled=state==='loading';
    button.querySelector('.note-count').textContent=`${track.charts[difficulty].notes} NOTES · ${difficulty.toUpperCase()}`;
    button.querySelector('.personal-best').textContent=Number.isFinite(record?.score)?`BEST ${record.score.toLocaleString()}`:'NOT PLAYED YET';
  });
  document.querySelectorAll('[data-difficulty]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.difficulty===difficulty));button.disabled=state==='loading';});
  $('selection-detail').textContent=`${selected.title} · ${difficulty==='easy'?'Easy':'Normal'} · ${selected.charts[difficulty].notes} notes`;
}
function showScreen(name){$('lobby').hidden=name!=='menu';$('game').hidden=name!=='game';$('results').hidden=name!=='results';}
async function loadSprites(){
  $('start').disabled=true;
  try{await renderer.load();assetsReady=true;document.querySelectorAll('.song-art').forEach((canvas,i)=>renderer.cover(canvas,i));$('start').textContent='Start playing  ↗';$('load-status').textContent='';}
  catch(error){assetsReady=false;$('load-status').textContent='Artwork could not load. Select Retry artwork to try again.';$('start').textContent='Retry artwork';console.error(error);}
  $('start').disabled=false;
}
async function getJSON(url,signal){const response=await fetch(url,{signal});if(!response.ok)throw new Error(`Could not load the note chart (${response.status})`);return response.json();}
async function getAudio(track,signal){
  if(buffers.has(track.id))return buffers.get(track.id);
  const response=await fetch(track.audio,{signal});if(!response.ok)throw new Error(`Could not load the song (${response.status})`);
  const buffer=await transport.decode(await response.arrayBuffer());buffers.set(track.id,buffer);return buffer;
}
async function startRun(){
  if(state==='loading')return;
  if(!assetsReady){await loadSprites();return;}
  const token=++runToken;loadAbort?.abort();const controller=new AbortController();loadAbort=controller;transport.stop();physicalKeys.clear();
  state='loading';pauseRequested=false;showScreen('menu');$('pause-panel').hidden=true;$('start').disabled=true;$('start').textContent='Preparing your song…';$('load-status').textContent='Loading audio… Press Esc to cancel.';updateSelection();
  const track=selected,level=difficulty;
  try{
    // Unlock in the start gesture before awaiting file I/O.
    await transport.unlock();
    if(token!==runToken)return;
    const [chart,buffer]=await Promise.all([getJSON(track.charts[level].file,controller.signal),getAudio(track,controller.signal)]);
    if(token!==runToken)return;
    session=new RhythmSession(chart);activeTrack=track;renderer.reset();state='countdown';
    $('game-title').textContent=track.title;$('game-difficulty').textContent=`${level.toUpperCase()} · ${track.bpm} BPM · ${track.key.toUpperCase()}`;
    $('pause').disabled=false;$('resume').disabled=false;$('load-status').textContent='';showScreen('game');
    transport.start(buffer,()=>{if(token===runToken)finishRun();});$('stage').focus({preventScroll:true});
    $('announcement').textContent=`Starting ${track.title} on ${level}. Press D F J K to the beat.`;
    if(pauseRequested||document.hidden||!document.hasFocus())await pauseRun('Paused automatically when the game window lost focus.');
  }catch(error){
    if(token!==runToken)return;
    transport.stop();state='menu';showScreen('menu');$('load-status').textContent=`${error.message} — Select Start playing to try again.`;
  }finally{
    if(token===runToken){$('start').disabled=false;$('start').textContent='Start playing  ↗';updateSelection();}
  }
}
function toMenu(message=''){
  ++runToken;loadAbort?.abort();transport.stop();physicalKeys.clear();session=null;state='menu';$('pause-panel').hidden=true;showScreen('menu');
  $('start').disabled=!assetsReady;$('start').textContent='Start playing  ↗';$('load-status').textContent=message;updateSelection();$('start').focus({preventScroll:true});
}
async function pauseRun(reason='Music and notes are paused together. Resume when you are ready.'){
  if(['loading','resuming'].includes(state)){pauseRequested=true;return;}
  if(!['playing','countdown'].includes(state))return;
  const token=runToken;state='pausing';physicalKeys.clear();
  try{await transport.pause();}catch(error){if(token===runToken){console.error(error);toMenu('Audio could not pause. Try restarting the song.');}return;}
  if(token!==runToken||state!=='pausing')return;
  session.advance(transport.time()-inputOffset/1000);flushEvents();session.suspendInputs();state='paused';
  $('pause-reason').textContent=reason;$('pause-panel').hidden=false;$('resume').disabled=false;$('resume').focus({preventScroll:true});
}
async function resumeRun(){
  if(state!=='paused')return;const token=runToken;state='resuming';pauseRequested=false;$('resume').disabled=true;
  session.resumeAt(transport.time()-inputOffset/1000);
  try{await transport.resume();}catch(error){if(token===runToken){state='paused';$('resume').disabled=false;$('pause-reason').textContent='Audio could not resume. Please try again.';}return;}
  if(token!==runToken||state!=='resuming')return;
  state=transport.time()<0?'countdown':'playing';$('pause-panel').hidden=true;$('resume').disabled=false;$('stage').focus({preventScroll:true});
  if(pauseRequested||document.hidden||!document.hasFocus())await pauseRun('Paused automatically when the game window lost focus.');
}
function finishRun(){
  if(!session||state==='results'||state==='menu')return;
  session.finish();const result=session.summary();transport.stop();physicalKeys.clear();state='results';$('pause-panel').hidden=true;
  const key=`${activeTrack.id}:${difficulty}`,previous=best[key],newBest=!Number.isFinite(previous?.score)||result.score>previous.score;
  let stored=true;if(newBest){best[key]={score:result.score,accuracy:result.accuracy,rank:result.rank};stored=save('tempo-rush-best-v1',best);}
  $('result-title').textContent=activeTrack.title;$('result-level').textContent=`${difficulty==='easy'?'Easy':'Normal'} · ${activeTrack.bpm} BPM · ${formatTime(activeTrack.duration)}`;
  $('rank').textContent=result.rank;$('result-score').textContent=result.score.toLocaleString();
  $('result-accuracy').textContent=`${result.accuracy.toFixed(1)}%`;$('result-combo').textContent=result.maxCombo;$('result-notes').textContent=result.total;
  $('best-message').textContent=!stored?'This score could not be saved in your browser.':newBest?'NEW PERSONAL BEST':`PERSONAL BEST ${best[key].score.toLocaleString()}`;
  $('result-counts').innerHTML=Object.entries(result.counts).map(([name,count])=>`<div>${name==='ghost'?'EXTRA / WRONG LANE':name.toUpperCase()}<b>${count}</b></div>`).join('');
  $('result-tip').textContent=result.fullCombo?'FULL COMBO! Every note hit. Try another track or a higher difficulty.':result.accuracy>=80?'You found the beat. Aim for a longer combo next time.': 'Watch the rings and hold long notes until their tails pass. Easy gives you more room to find the beat.';
  showScreen('results');$('retry-result').focus({preventScroll:true});$('announcement').textContent=`${activeTrack.title} complete. Score ${result.score}. Accuracy ${result.accuracy.toFixed(1)} percent.`;
}
function flushEvents(){for(const event of session?.drainEvents()||[])renderer.event(event);}
function lanePress(lane){if(state!=='playing')return;session.press(lane,transport.time()-inputOffset/1000);flushEvents();}
function laneRelease(lane){if(state!=='playing')return;session.release(lane,transport.time()-inputOffset/1000);flushEvents();}
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
let previousFrame=performance.now();
function frame(now){
  const dt=Math.min(.05,(now-previousFrame)/1000);previousFrame=now;
  if(session&&activeTrack&&['playing','countdown','paused','pausing','resuming'].includes(state)){
    const time=transport.time();if(state==='countdown'&&time>=0)state='playing';
    if(state==='playing'){session.advance(time-inputOffset/1000);flushEvents();}
    renderer.draw(activeTrack,session,time,dt,{state,difficulty});
    $('score').textContent=String(session.score).padStart(6,'0');$('combo').innerHTML=`${session.combo} <small>×${session.multiplier}</small>`;$('accuracy').innerHTML=`${session.accuracy.toFixed(1)}<small>%</small>`;
    $('progress').style.width=`${clamp(time/activeTrack.duration,0,1)*100}%`;
    $('song-time').textContent=`${formatTime(time)} / ${formatTime(activeTrack.duration)}`;
    $('section-name').textContent=time<0?'GET READY':activeTrack.sections.find(s=>time>=s.start&&time<s.end)?.label.toUpperCase()||'LAST SPARKS';
    laneButtons.forEach((button,i)=>button.classList.toggle('pressed',session.down[i]));
  }
  requestAnimationFrame(frame);
}
// Read-only developer snapshot for local playtest inspection; no auto-play controls.
window.TempoRush=Object.freeze({snapshot:()=>({state,selected:selected.id,difficulty,song:activeTrack?.id,time:transport.time(),audioState:transport.context?.state,sourceActive:Boolean(transport.source),offset:inputOffset,summary:session?.summary(),down:session?[...session.down]:[],nextNotes:session?.notes.filter(n=>n.status==='pending'||n.status==='holding').slice(0,8).map(n=>({time:n.time,lane:n.lane,type:n.type,duration:n.duration,status:n.status}))})});
updateSelection();loadSprites();requestAnimationFrame(frame);
