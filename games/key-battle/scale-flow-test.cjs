const assert=require('node:assert/strict');
const {Session,buildRun,RULES,PATTERNS}=require('./dist/scale-flow-engine.js');
let passed=0,failed=0;
function test(name,fn){try{fn();console.log('PASS',name);passed++;}catch(e){console.error('FAIL',name,'\n ',e.message);failed++;}}
const make=(o={})=>{const s=new Session({mode:'battle',seed:7,...o});s.start();s.drain();return s;};
const advance=(s,seconds)=>{for(let t=0;t<seconds-1e-7;t+=.02)s.tick(Math.min(.02,seconds-t));};
const typeNote=s=>{for(const c of s.target)s.input(c);};
const near=(a,b,eps=1e-6)=>assert(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
/** Play every note just after its beat, up to (not including) step index `until`. */
const playUntil=(s,until=Infinity)=>{while(s.status==='playing'&&s.current&&s.cursor<until){const due=s.dueMs(s.cursor);if(s.clock<due)advance(s,(due-s.clock)/1000+.001);typeNote(s);}};

test('single routine is the original up-peak-down flow of 30 notes',()=>{
 const s=make({routine:'single'});assert.equal(s.rounds.length,1);assert.equal(s.steps.length,30);
 assert.equal(s.steps[14].dir,'up');assert.equal(s.steps[15].dir,'peak');assert.equal(s.steps[16].dir,'down');near(s.totalMs,25500);
});
test('flow set lasts about a minute and the marathon about two, on one scale throughout',()=>{
 const set=make({routine:'set'}),mar=make({routine:'marathon'});
 assert(set.totalMs>55e3&&set.totalMs<80e3,`set ${set.totalMs}`);assert(mar.totalMs>95e3&&mar.totalMs<130e3,`marathon ${mar.totalMs}`);
 for(const s of[set,mar])for(const st of s.steps)assert(s.run.pattern.some(p=>p.string===st.string&&p.fret===st.fret&&p.label===st.label));
 assert.deepEqual(set.rounds.map(r=>r.bpm),[80,90,100]);assert.deepEqual(mar.rounds.map(r=>r.bpm),[80,80,90,100,110]);
 assert.deepEqual(set.rounds.map(r=>r.key),['updown','thirds-up','downup']);
});
test('every round has its own count-in and tempo, and a perfect run clears the flow',()=>{
 const s=make({routine:'set'});const r1=s.rounds[1];
 near(s.dueMs(r1.start)-r1.startMs,RULES.countInBeats*60000/r1.bpm);
 near(r1.startMs,s.dueMs(r1.start-1)+60000/s.rounds[0].bpm);
 near(s.dueMs(r1.start+1)-s.dueMs(r1.start),60000/90);
 playUntil(s);const ticks=s.drain().filter(e=>e.type==='tick'&&e.countIn&&e.beat===0);
 assert.equal(ticks.length,3);assert.equal(s.status,'finished');assert.equal(s.reason,'victory');assert.equal(s.stats().perfect,s.steps.length);
});
test('round events fire at each pattern change and a clean round heals one heart',()=>{
 const s=make({routine:'set'});
 advance(s,(s.dueMs(0)+RULES.goodMs)/1000+.01);assert.equal(s.hp,3); // the first note is the root: −2 ♥
 playUntil(s);const rounds=s.drain().filter(e=>e.type==='round');
 assert.equal(rounds.length,2);assert.equal(rounds[0].index,1);assert.equal(rounds[0].clean,false);assert.equal(rounds[0].healed,false);
 assert.equal(rounds[1].clean,true);assert.equal(rounds[1].healed,true);assert.equal(s.hp,4);assert.equal(s.stats().heals,1);
});
test('countingIn is true only before the first note of each round',()=>{
 const s=make({routine:'set'});assert.equal(s.countingIn,true);playUntil(s,1);assert.equal(s.countingIn,false);
 const r1=s.rounds[1];playUntil(s,r1.start);assert.equal(s.cursor,r1.start);assert.equal(s.countingIn,true);
 assert.equal(s.currentBpm,90);assert.equal(s.roundIndex,1);assert.equal(s.acceptingInput,false);
});
test('scramble covers the whole position twice with no repeated neighbour',()=>{
 for(let seed=1;seed<40;seed++){
  const run=buildRun({routine:'marathon',seed});const r=run.rounds[3];assert.equal(r.key,'scramble');
  const idx=run.steps.slice(r.start,r.start+r.length).map(st=>st.patternIndex);const n=run.pattern.length;assert.equal(idx.length,2*n);
  for(let pass=0;pass<2;pass++)assert.deepEqual([...idx.slice(pass*n,pass*n+n)].sort((a,b)=>a-b),[...Array(n).keys()]);
  for(let i=1;i<idx.length;i++)assert.notEqual(idx[i],idx[i-1]);
 }
 assert.notDeepEqual(buildRun({routine:'marathon',seed:1}).steps.map(s=>s.patternIndex),buildRun({routine:'marathon',seed:2}).steps.map(s=>s.patternIndex));
});
test('patterns re-order the position as named',()=>{
 assert.deepEqual(PATTERNS['thirds-up'].build(5).map(p=>p[0]),[0,2,1,3,2,4]);
 assert.deepEqual(PATTERNS['downup'].build(4).map(p=>p[0]),[3,2,1,0,0,1,2,3]);
 assert.deepEqual(PATTERNS['triplets-up'].build(4).map(p=>p[0]),[0,1,2,1,2,3]);
 assert.deepEqual(PATTERNS['updown'].build(1).map(p=>p[0]),[0]);
});
test('per-round stats add up and the tempo ramp is capped at the max BPM',()=>{
 const s=make({routine:'marathon',bpm:150});assert.deepEqual(s.rounds.map(r=>r.bpm),[150,150,160,160,160]);
 playUntil(s);const st=s.stats();assert.equal(st.rounds.length,5);assert.equal(st.rounds.reduce((a,r)=>a+r.total,0),st.total);
 assert(st.rounds.every(r=>r.hits===r.total&&r.timingPct>=90),JSON.stringify(st.rounds));
});
test('free flow keeps the rounds but has no clock or hearts at stake',()=>{
 const s=make({mode:'practice',routine:'set'});assert.equal(s.timed,false);assert.equal(s.countingIn,false);
 while(s.status==='playing')typeNote(s);assert.equal(s.status,'finished');assert.equal(s.stats().rounds.length,3);assert.equal(s.hp,5);
});
test('defeat ends the flow mid-routine',()=>{
 const s=make({routine:'set'});advance(s,s.totalMs/1000);assert.equal(s.status,'finished');assert.equal(s.reason,'defeat');assert(s.cursor<s.steps.length);
});
test('free flow pace: a slow note breaks the streak and grades GOOD, but never costs a heart',()=>{
 const s=make({mode:'practice',routine:'single'});typeNote(s);typeNote(s);assert.equal(s.streak,2);
 advance(s,RULES.paceMs/1000+.05);const late=s.drain().filter(e=>e.type==='late');assert.equal(late.length,1);assert.equal(s.streak,0);assert.equal(s.hp,5);assert.equal(s.cursor,2);
 typeNote(s);assert.equal(s.judgements[2].grade,'good');assert.equal(s.wordLeft,s.wordDuration);
 const t=make({routine:'single'});advance(t,1);assert.equal(t.timeLeftMs,t.endMs-1000);assert.equal(make({mode:'practice'}).timeLeftMs,null);
});
test('strum(): the right string completes the note, the wrong string is a wrong-note miss',()=>{
 const s=make({routine:'single'});advance(s,s.dueMs(0)/1000-.05);assert.equal(s.strum(s.current.string),true);assert.equal(s.judgements[0].grade,'perfect');
 advance(s,(s.dueMs(1)-s.clock)/1000);const wrong=s.current.string===6?5:6;s.strum(wrong);assert.equal(s.judgements[1].grade,'miss');assert.equal(s.judgements[1].wrongNote,true);assert.equal(s.hp,4);
 assert.equal(s.strum(s.current.string),false); // window of note 3 not open yet
});
console.log(`\n${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
