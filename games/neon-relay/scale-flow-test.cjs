const assert=require('node:assert/strict');
const R=require('./dist/scale-run-rules.js');
const {Session,RULES}=require('./dist/scale-flow-engine.js');
let passed=0,failed=0;
function test(name,fn){try{fn();console.log('PASS',name);passed++;}catch(e){console.error('FAIL',name,'\n ',e.message);failed++;}}
const make=(o={})=>{const s=new Session({mode:'battle',seed:11,...o});s.start();s.drain();return s;};
const advance=(s,seconds)=>{for(let t=0;t<seconds-1e-7;t+=.02)s.tick(Math.min(.02,seconds-t));};
const near=(a,b,eps=1e-6)=>assert(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

test('rails: string 1 (high e) is on top, six rails evenly spaced, strings clamp to 1..6',()=>{
 assert.equal(R.railY(1),R.RAIL.top);assert.equal(R.railY(6),R.RAIL.top+5*R.RAIL.gap);
 for(let s=1;s<6;s++)assert.equal(R.railY(s+1)-R.railY(s),R.RAIL.gap);
 assert.equal(R.clampString(0),1);assert.equal(R.clampString(9),6);assert.equal(R.clampString(3.4),3);
 assert.deepEqual(Object.keys(R.STRING_NAMES).sort(),['1','2','3','4','5','6']);assert.equal(R.STRING_NAMES[6],'E');assert.equal(R.STRING_NAMES[1],'e');
});
test('notes reach Punkman exactly on their beat and travel one BEAT_PX per beat at any tempo',()=>{
 for(const bpm of[50,80,113,160]){const beat=60000/bpm;near(R.noteX(5000,5000,beat),R.PLAYER_X);near(R.noteX(5000+beat,5000,beat),R.PLAYER_X+R.BEAT_PX);near(R.noteX(5000-beat/2,5000,beat),R.PLAYER_X-R.BEAT_PX/2);}
 assert.equal(R.hopKeys.KeyW,-1);assert.equal(R.hopKeys.ArrowDown,1);assert(R.strumKeys.includes('Space'));
});
test('strum on the right string just after each beat clears the flow with all perfects',()=>{
 const s=make({routine:'set'});
 while(s.status==='playing'&&s.current){const due=s.dueMs(s.cursor);if(s.clock<due)advance(s,(due-s.clock)/1000+.001);assert.equal(s.strum(s.current.string),true);}
 assert.equal(s.status,'finished');assert.equal(s.reason,'victory');const st=s.stats();assert.equal(st.perfect,st.total);assert.equal(st.rounds.length,3);assert.equal(st.accuracy,100);
});
test('strum on the wrong string is a wrong-note miss that costs a heart; before the window it is ignored',()=>{
 const s=make({routine:'single'});
 assert.equal(s.strum(s.current.string),false);assert.equal(s.cursor,0); // count-in: window closed
 advance(s,s.dueMs(0)/1000-.05);const wrong=s.current.string===6?5:6;assert.equal(s.current.isRoot,true);
 assert.equal(s.strum(wrong),true);assert.equal(s.judgements[0].grade,'miss');assert.equal(s.judgements[0].wrongNote,true);assert.equal(s.hp,3); // root note: −2 ♥
 const attack=s.drain().find(e=>e.type==='bossAttack');assert.equal(attack.reason,'wrong');assert.equal(attack.damage,2);
 advance(s,(s.dueMs(1)-s.clock)/1000);const wrong2=s.current.string===6?5:6;s.strum(wrong2);assert.equal(s.hp,2);assert.equal(s.stats().accuracy,0);
 advance(s,(s.dueMs(2)-s.clock)/1000);s.strum(s.current.string);assert.equal(s.judgements[2].grade,'perfect');assert.equal(s.hp,2);
});
test('free flow: strum any time, the pace timer only breaks the streak',()=>{
 const s=make({mode:'practice',routine:'single'});assert.equal(s.strum(s.current.string),true);assert.equal(s.streak,1);
 advance(s,RULES.paceMs/1000+.05);assert.equal(s.streak,0);assert.equal(s.hp,5);assert.equal(s.strum(s.current.string),true);assert.equal(s.judgements[1].grade,'good');
});
console.log(`\n${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
