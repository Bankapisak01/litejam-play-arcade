import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RhythmSession, gradeTiming, rankForAccuracy} from '../dist/engine.js';
const note=(time=1,lane=0,type='tap',duration=0)=>({time,lane,type,duration});
const session=notes=>new RhythmSession({notes});

test('timing boundaries are symmetric and inclusive',()=>{
  for(const sign of [-1,1]){
    assert.equal(gradeTiming(sign*.06),'perfect');assert.equal(gradeTiming(sign*.12),'good');
    assert.equal(gradeTiming(sign*.18),'ok');assert.equal(gradeTiming(sign*.181),null);
  }
});
test('correct tap resolves exactly once despite repeated keydown',()=>{
  const s=session([note()]);s.press(0,1);s.press(0,1.01);s.advance(1.5);
  assert.equal(s.score,1000);assert.equal(s.counts.perfect,1);assert.equal(s.counts.ghost,0);assert.equal(s.accuracy,100);
});
test('release is required to strike the next same-lane note',()=>{
  const s=session([note(1),note(1.5)]);s.press(0,1);s.press(0,1.5);assert.equal(s.combo,1);
  s.release(0,1.51);s.press(0,1.52);assert.equal(s.combo,2);
});
test('two-note chord independently resolves both lanes',()=>{
  const s=session([note(1,0),note(1,3)]);s.press(0,1);s.press(3,1.002);
  assert.equal(s.counts.perfect,2);assert.equal(s.combo,2);
});
test('late pending note misses once, empty input breaks combo',()=>{
  const s=session([note(1),note(2,1)]);s.press(0,1);s.release(0,1.01);s.press(3,1.5);
  assert.equal(s.combo,0);assert.equal(s.counts.ghost,1);s.advance(2.181);s.advance(3);
  assert.equal(s.counts.miss,1);assert.equal(s.accuracy,100/3);
});
test('input before countdown is over is ignored',()=>{
  const s=session([note()]);s.press(0,-.5);assert.equal(s.counts.ghost,0);assert.equal(s.down[0],false);
});
test('hold retains head grade and awards once at tail',()=>{
  const s=session([note(1,0,'hold',1)]);s.press(0,1.08);assert.equal(s.score,0);
  s.advance(2);assert.equal(s.counts.good,1);assert.equal(s.score,700);s.release(0,2.01);s.advance(3);assert.equal(s.counts.good,1);
});
test('early hold release fails without awarding a successful note',()=>{
  const s=session([note(1,0,'hold',1)]);s.press(0,1);s.release(0,1.5);s.advance(3);
  assert.equal(s.counts.miss,1);assert.equal(s.score,0);assert.equal(s.combo,0);
});
test('hold release within 80 ms of tail succeeds',()=>{
  const s=session([note(1,0,'hold',1)]);s.press(0,1);s.release(0,1.92);assert.equal(s.counts.perfect,1);
});
test('pause clears physical flags, active holds can be re-grabbed in 350 ms',()=>{
  const s=session([note(1,0,'hold',2)]);s.press(0,1);s.advance(1.5);s.suspendInputs();s.resumeAt(1.5);
  s.advance(1.7);assert.equal(s.counts.miss,0);s.press(0,1.75);s.advance(3);
  assert.equal(s.counts.perfect,1);assert.equal(s.counts.ghost,0);
});
test('active hold missed if not re-grabbed after pause grace',()=>{
  const s=session([note(1,0,'hold',2)]);s.press(0,1);s.advance(1.5);s.suspendInputs();s.resumeAt(1.5);s.advance(1.851);
  assert.equal(s.counts.miss,1);
});
test('stale keyup after pause does not cancel the hold re-grab grace',()=>{
  const s=session([note(1,0,'hold',2)]);s.press(0,1);s.advance(1.5);s.suspendInputs();s.resumeAt(1.5);
  s.release(0,1.55);assert.equal(s.counts.miss,0);s.press(0,1.6);s.advance(3);assert.equal(s.counts.perfect,1);
});
test('finish resolves remaining notes and makes later input harmless',()=>{
  const s=session([note(),note(2,1)]);s.finish();s.press(0,1);s.finish();assert.equal(s.counts.miss,2);assert.equal(s.counts.ghost,0);
});
test('invalid chart rejects rather than corrupting gameplay',()=>{
  assert.throws(()=>session([note(1,9)]));assert.throws(()=>session([note(NaN)]));
});
test('rank has predictable accuracy thresholds',()=>{
  assert.equal(rankForAccuracy(100),'S');assert.equal(rankForAccuracy(85),'A');assert.equal(rankForAccuracy(70),'B');assert.equal(rankForAccuracy(50),'C');assert.equal(rankForAccuracy(0),'D');
});
for(const song of ['neon-heartbeat','drake-overdrive'])for(const difficulty of ['easy','normal']){
  const chart=JSON.parse(readFileSync(new URL(`../dist/charts/${song}-${difficulty}.json`,import.meta.url)));
  test(`${song}/${difficulty}: full real chart can achieve 100% with taps, holds and chords`,()=>{
    const s=new RhythmSession(chart);const inputs=[];
    for(const n of chart.notes){inputs.push({time:n.time,lane:n.lane,press:true});inputs.push({time:n.time+(n.type==='hold'?n.duration:.035),lane:n.lane,press:false});}
    inputs.sort((a,b)=>a.time-b.time||Number(a.press)-Number(b.press));
    for(const e of inputs){s.advance(e.time);e.press?s.press(e.lane,e.time):s.release(e.lane,e.time);}
    s.advance(chart.music_duration_seconds);s.finish();
    assert.equal(s.counts.perfect,chart.notes.length);assert.equal(s.counts.miss,0);assert.equal(s.counts.ghost,0);assert.equal(s.accuracy,100);assert.equal(s.maxCombo,chart.notes.length);
    assert.equal(s.summary().total,chart.notes.length);
  });
}
