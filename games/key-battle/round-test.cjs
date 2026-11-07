const assert=require('node:assert/strict');
const {Session}=require('./dist/typing-engine.js');
let passed=0,failed=0;
function test(name,fn){try{fn();console.log('PASS',name);passed++;}catch(e){console.error('FAIL',name,'\n ',e.message);failed++;}}
const make=()=>{const s=new Session({mode:'battle',random:()=>.3});s.start();s.drain();return s;};
const type=(s,text)=>{for(const c of text)s.input(c);};
const word=s=>type(s,s.target+' ');
const advance=(s,seconds)=>{for(let t=0;t<seconds-1e-7;t+=.025)s.tick(Math.min(.025,seconds-t));};
const until=(s,beat,max=30)=>{for(let t=0;s.status==='playing'&&s.beat!==beat&&t<max;t+=.025)s.tick(.025);assert.equal(s.beat,beat);};

test('wrong letters are editable, but wrong Space retaliates exactly once',()=>{
 const s=make();s.input('Z');assert.equal(s.hp,5);s.input(' ');assert.equal(s.hp,4);assert.equal(s.beat,'retaliate');
 const hits=s.drain().filter(e=>e.type==='bossAttack');assert.equal(hits.length,1);assert.equal(hits[0].reason,'wrong');
 s.input(' ');advance(s,.3);assert.equal(s.hp,4);assert.equal(s.buffer,'');
});
test('correct charge words store attacks until the timed volley',()=>{
 const s=make();word(s);advance(s,5);word(s);assert.equal(s.bossHp,100);assert.equal(s.ammo.length,2);
 advance(s,7.01);assert.equal(s.beat,'volley');advance(s,2.05);assert(s.bossHp<100);assert.equal(s.beat,'defend');
});
test('a critical word expires into a two-heart ultimate, never two penalties',()=>{
 const s=make();word(s);word(s);word(s);assert.equal(s.critical,true);
 advance(s,s.wordLeft+s.readGrace+.05);assert.equal(s.hp,3);assert.equal(s.failedWords,1);assert.equal(s.beat,'retaliate');
 const hits=s.drain().filter(e=>e.type==='bossAttack');assert.equal(hits.length,1);assert.equal(hits[0].damage,2);assert.equal(hits[0].kind,'ultimate');
});
test('partial sentence buffer and deadline survive the defense/counter sequence',()=>{
 const s=new Session({mode:'battle',lesson:'sentences',random:()=>.2});s.start();
 word(s);word(s);word(s);const target=s.target;s.input(target[0]);const buffer=s.buffer;
 // Advance only the charge boundary; the saved critical word has ample time.
 s.beatLeft=.1;advance(s,.11);assert.equal(s.beat,'volley');const saved=s.parked.wordLeft;
 until(s,'defend');word(s);assert.equal(s.beat,'counter');word(s);until(s,'charge');
 assert.equal(s.target,target);assert.equal(s.buffer,buffer);assert(Math.abs(s.wordLeft-saved)<.06);assert.equal(s.round,2);
});
test('the boss has a mandatory defense turn even after many correct words',()=>{
 const s=make();for(let i=0;i<6;i++)word(s);s.beatLeft=.01;advance(s,.02);until(s,'defend');
 assert(s.target);assert.equal(s.bossTurns,1);const hp=s.hp;advance(s,s.wordLeft+s.readGrace+.02);assert.equal(s.hp,hp-(s.lastFailureDamage||1));
});
test('simultaneous word deadline and round end resolves a single failure',()=>{
 const s=make();s.input('Z');s.readGrace=0;s.wordLeft=.02;s.beatLeft=.02;advance(s,.03);
 assert.equal(s.hp,4);assert.equal(s.failedWords,1);assert.equal(s.beat,'retaliate');
 advance(s,1.3);assert.equal(s.hp,4);assert(['volley','defend'].includes(s.beat));
});
test('charge ending before the word deadline parks it instead of punishing a later expiry',()=>{
 const s=make();s.input('a');s.readGrace=0;s.wordLeft=.08;s.beatLeft=.01;s.tick(.1);
 assert.equal(s.hp,5);assert.equal(s.failedWords,0);assert.equal(s.beat,'volley');assert(Math.abs(s.parked.wordLeft-.07)<1e-8);
 assert.equal(s.drain().filter(e=>e.type==='bossAttack').length,0);
});
test('pause freezes a retaliation and ignores keyboard input',()=>{
 const s=make();s.input('Z');s.input(' ');s.pause();const clock=s.beatLeft,elapsed=s.elapsed;
 advance(s,20);s.input('a');assert.equal(s.beatLeft,clock);assert.equal(s.elapsed,elapsed);assert.equal(s.buffer,'');assert.equal(s.hp,4);
 s.resume();advance(s,1.3);assert.equal(s.beat,'charge');
});
test('a corrected critical word earns ammo and does not deal damage',()=>{
 const s=make();word(s);word(s);word(s);const target=s.target;s.input('Z');s.input('Backspace');type(s,target+' ');
 assert.equal(s.hp,5);assert.equal(s.failedWords,0);assert.equal(s.ammo.length,4);
});
test('a complete encounter reaches phase two once and ends with victory',()=>{
 const s=make();let phases=0;
 for(let i=0;i<2000&&s.status==='playing';i++){
   if(s.acceptingInput){if(s.beat==='charge'&&s.ammo.length>=3)s.beatLeft=.01;else word(s);}
   advance(s,.1);phases+=s.drain().filter(e=>e.type==='phase').length;
 }
 assert.equal(s.reason,'victory');assert.equal(s.bossHp,0);assert.equal(phases,1);assert(s.bossTurns>=1);
});
test('a defense word that fills the meter preserves the ultimate for an actual attack',()=>{
 const s=make();word(s);s.beatLeft=.01;advance(s,.02);until(s,'defend');s.charge=80;
 word(s);assert.equal(s.charge,100);assert.equal(s.ultimates,0);word(s);assert.equal(s.charge,0);assert.equal(s.ultimates,1);
});
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
