import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RhythmSession} from '../dist/engine.js';
import {buildScaleChart, renderBackingTrack, laneFor, midiHz, roundStats, advancePracticeClock, nextPendingTime, isFrozen, dueAutoPresses, crossed} from '../dist/scale-chart.js';
// The scale engine is a classic browser script (UMD); evaluate it with a window global like the page does.
const dir=new URL('../dist/',import.meta.url),run=file=>new Function(readFileSync(new URL(file,dir),'utf8'))();
globalThis.window=globalThis.window||{};run('scale-flow-data.js');run('scale-flow-engine.js');
const ScaleFlow=globalThis.ScaleFlow;
const config={root:'C',type:'major',position:'r5',octave:'full',routine:'set',bpm:80,seed:3};
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

test('lanes follow the fretting hand across the strings',()=>{
  assert.deepEqual([6,5,4,3,2,1].map(laneFor),[0,0,1,2,3,3]);
  near(midiHz(69),440);near(midiHz(60),261.6255653,1e-3);
});
test('the flow set becomes an 86-note chart with a 4-beat count-in and a rising tempo',()=>{
  const {chart,rounds,totalMs,steps}=buildScaleChart(config,ScaleFlow);
  assert.equal(chart.notes.length,86);assert.equal(chart.notes.length,steps.length);
  assert.deepEqual(rounds.map(r=>r.bpm),[80,90,100]);assert.deepEqual(rounds.map(r=>r.count),[30,26,30]);
  near(chart.notes[0].time,3);
  for(const r of rounds){const list=chart.notes.filter(n=>n.round===r.index);for(let i=1;i<list.length;i++)near(list[i].time-list[i-1].time,60/r.bpm);near(list[0].time-r.start,4*60/r.bpm);}
  assert.ok(totalMs>55e3&&totalMs<80e3);
  for(const n of chart.notes){assert.equal(n.type,'tap');assert.equal(n.lane,laneFor(n.string));assert.ok(n.label&&Number.isFinite(n.pitch));assert.equal(n.section,`round-${n.round}`);}
  assert.equal(chart.notes[0].label,'C');assert.equal(chart.notes[0].isRoot,true);assert.equal(chart.notes[0].accent,true);assert.equal(chart.notes[1].accent,false);
  const session=new RhythmSession(chart);assert.equal(session.notes.length,86);
  session.press(chart.notes[0].lane,3.01);session.advance(4);assert.equal(session.counts.perfect,1);
});
test('backing track: clicks on the beats, the note pitch on its beat, quieter without the guide',()=>{
  const built=buildScaleChart({...config,routine:'single'},ScaleFlow),sr=8000;
  const guided=renderBackingTrack({beats:built.beats,notes:built.chart.notes,totalMs:built.totalMs},sr,{guide:true});
  const plain=renderBackingTrack({beats:built.beats,notes:built.chart.notes,totalMs:built.totalMs},sr,{guide:false});
  assert.equal(guided.length,Math.ceil((built.totalMs/1000+1)*sr));
  const energy=(buf,from,to)=>{let e=0;for(let i=Math.floor(from*sr);i<Math.floor(to*sr);i++)e+=buf[i]*buf[i];return e;};
  assert.ok(energy(guided,0,.02)>0,'count-in click at t=0');
  assert.ok(energy(guided,3.1,3.25)>energy(plain,3.1,3.25)*4,'note pitch rings after the click on the first note');
  assert.ok(energy(plain,3.1,3.25)<energy(plain,3,3.02),'without the guide only the click remains');
  assert.ok(energy(guided,built.totalMs/1000+.6,built.totalMs/1000+1)===0,'silent tail');
  for(const v of guided)assert.ok(v>=-1&&v<=1);
});
test('round stats split resolved notes by round',()=>{
  const {chart,rounds}=buildScaleChart(config,ScaleFlow);
  const session=new RhythmSession(chart);
  for(const n of session.notes)if(n.round===0){session.press(n.lane,n.time);session.release(n.lane,n.time+.05);}
  session.finish();const stats=roundStats(session.notes,rounds);
  assert.equal(stats[0].hits,30);assert.equal(stats[0].accuracy,100);assert.equal(stats[1].hits,0);assert.equal(stats[1].miss,26);assert.equal(stats[2].total,30);
});

test('practice clock: stops exactly on the waiting note, never overshoots, resumes once it is hit',()=>{
  const {chart}=buildScaleChart({...config,routine:'single'},ScaleFlow),session=new RhythmSession(chart);
  let clock=-3,frozen=false,steps=0;
  near(advancePracticeClock(-3,.05,Infinity),-2.95);assert.equal(advancePracticeClock(2.99,.05,3),3);assert.equal(isFrozen(3,3),true);assert.equal(isFrozen(2.9,3),false);assert.equal(isFrozen(99,Infinity),false);
  while(session.resolved<session.notes.length&&steps++<100000){
    const nextT=nextPendingTime(session.notes);clock=advancePracticeClock(clock,.033,nextT);frozen=isFrozen(clock,nextT);
    session.advance(clock);assert.ok(clock<=nextT,'the clock never passes a waiting note');
    if(frozen&&steps%7===0){const n=session.notes.find(x=>x.status==='pending');session.press(n.lane,n.time);session.release(n.lane,n.time);} // the player takes a while, the note waits
  }
  assert.equal(session.counts.perfect,30);assert.equal(session.counts.miss,0);assert.equal(nextPendingTime(session.notes),Infinity);
  near(clock,chart.notes[29].time);
});
test('auto run presses every note exactly once as it arrives',()=>{
  const {chart}=buildScaleChart({...config,routine:'single'},ScaleFlow),session=new RhythmSession(chart);
  let last=-Infinity,presses=0;
  for(let t=0;t<30;t+=.016){session.advance(t);for(const n of dueAutoPresses(session.notes,t,last)){last=Math.max(last,n.time);session.press(n.lane,n.time);session.release(n.lane,n.time+.01);presses++;}}
  assert.equal(presses,30);assert.equal(session.counts.perfect,30);assert.deepEqual(dueAutoPresses(session.notes,99,last),[]);
  assert.deepEqual(crossed([{at:0},{at:750},{at:1500}],700,1500,b=>b.at).map(b=>b.at),[750,1500]);assert.deepEqual(crossed([1,2,3],2,2),[]);
});
