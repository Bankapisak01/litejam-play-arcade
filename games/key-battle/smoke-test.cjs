const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Session, LESSONS } = require('./dist/typing-engine.js');
let cases = 0;
function test(name, body) { body(); console.log('PASS', name); cases++; }
const create = options => { const s = new Session({ random: () => .32, ...options }); s.start(); s.drain(); return s; };
const type = (s, text) => { for (const ch of text) s.input(ch); };
const word = s => type(s, s.target + ' ');

test('timer waits for first character; practice has no forced timeout', () => {
  const s = create(); s.tick(100); assert.equal(s.elapsed, 0);
  s.input(s.target[0]); s.tick(500); assert.equal(s.elapsed, 500); assert.equal(s.hp, 5); assert.equal(s.status, 'playing');
});
test('only complete exact words followed by Space deal damage', () => {
  const s = create(); const target = s.target;
  type(s, target); assert.equal(s.bossHp, 100); assert.equal(s.completedWords, 0);
  s.input(' '); assert.equal(s.bossHp, 96); assert.equal(s.completedWords, 1); assert.equal(s.buffer, '');
  s.input(' '); assert.equal(s.stats().accuracy, 100);
});
test('typos require editing, cannot skip words, and do not take hearts', () => {
  const s = create(); const target = s.target;
  s.input('Z'); s.input(' '); assert.equal(s.target, target); assert.equal(s.completedWords, 0); assert.equal(s.hp, 5);
  s.input('Backspace'); word(s); assert.equal(s.completedWords, 1); assert.equal(s.combo, 0);
  assert(s.stats().accuracy < 100); assert(s.stats().reviewWords.includes(target));
});
test('Backspace cannot inflate WPM or erase recorded mistakes', () => {
  const s = create(); s.input(s.target[0]); s.tick(10); const speed = s.stats().wpm;
  for(let i=0;i<10;i++){s.input('Backspace');s.input(s.target[0]);}
  assert.equal(s.stats().wpm, speed); s.input('Z'); const errors = s.totalKeys-s.correctKeys;
  s.input('Backspace'); assert.equal(s.totalKeys-s.correctKeys, errors);
});
test('non-English input does not start a session or penalize accuracy', () => {
  const s = create(); assert.equal(s.input('ก'), false); assert.equal(s.input('Enter'), false);
  assert.equal(s.totalKeys, 0); assert.equal(s.started, false);
});
test('perfect words charge an automatic ultimate; halfway transition fires once', () => {
  const s = create(); const events=[];
  while(s.status==='playing'){word(s);events.push(...s.drain());}
  assert(events.some(e=>e.type==='attack'&&e.kind==='charged'));
  assert(events.some(e=>e.type==='attack'&&e.kind==='slash'));
  assert(events.some(e=>e.type==='attack'&&e.kind==='ultimate'));
  assert.equal(events.filter(e=>e.type==='phase').length,1);
  assert.equal(events.filter(e=>e.type==='finish').length,1);
  assert.equal(s.reason,'victory');assert.equal(s.bossHp,0);
  const words=s.completedWords;word(s);assert.equal(s.completedWords,words);
});
test('three completed battle words store power without cancelling the boss turn', () => {
  const s=create({mode:'battle'});word(s);word(s);word(s);
  assert.equal(s.hp,5);assert.equal(s.ammo.length,3);assert.equal(s.bossHp,100);
  assert(!s.drain().some(e=>e.type==='dodge'));
});
test('boss deadlines cause damage, pause freezes input and clocks, resume continues', () => {
  const s=create({mode:'battle'});s.input(s.target[0]);s.tick(5);s.pause();
  const buffer=s.buffer;s.input('x');s.tick(100);assert.equal(s.buffer,buffer);assert.equal(s.elapsed,5);assert.equal(s.beatLeft,7);
  s.resume();s.tick(15);assert.equal(s.hp,4);assert.equal(s.beat,'retaliate');
  for(let i=0;i<1500&&s.status==='playing';i++)s.tick(.1);assert.equal(s.reason,'defeat');assert.equal(s.hp,0);
});
test('phase two changes the phase once, restart is fresh', () => {
  const s=create();while(s.phase===1)word(s);
  assert.equal(s.phase,2);assert.equal(s.hp,5);
  const fresh=create({mode:'battle'});assert.equal(fresh.phase,1);assert.equal(fresh.bossHp,100);assert.equal(fresh.charge,0);
});
test('battle timeout ends cleanly even when no damage kills the player', () => {
  const s=create({mode:'battle'});s.input(s.target[0]);s.tick(151);
  assert.equal(s.reason,'timeout');assert.equal(s.status,'finished');
});
test('sentence words remain in order, next sentence is generated after completion', () => {
  const s=create({lesson:'sentences'}), phrase=s.phrase, words=phrase.split(' ');
  assert(LESSONS.sentences.sentences.includes(phrase));
  for(const expected of words){assert.equal(s.target,expected);word(s);}
  assert.notEqual(s.phrase,phrase);assert(s.target);assert.equal(s.completedWords,words.length);
});
test('all required local atlases have matching dimensions; app has no external dependencies', () => {
  const dir=path.join(__dirname,'dist');let atlases=0;
  for(const file of fs.readdirSync(path.join(dir,'assets'))){
    const data=fs.readFileSync(path.join(dir,'assets',file));
    assert.equal(data.readUInt32BE(0),0x89504e47);
    const size=[data.readUInt32BE(16),data.readUInt32BE(20)];
    if(file.startsWith('fx-'))assert.deepEqual(size,[1536,192]);
    else if(file.includes('cutin'))assert.deepEqual(size,[512,256]);
    else if(file.startsWith('boss-'))assert.deepEqual(size,[2048,192]);
    else assert.deepEqual(size,[1024,128]);atlases++;
  }
  assert(atlases>=27);
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  for(const [,file] of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
    if(file.startsWith('data:'))continue;
    const pathname=file.split('?')[0], publicDir=path.join(__dirname,'../../public');
    const resolved=pathname==='/'?path.join(publicDir,'index.html'):pathname.startsWith('/')?path.join(publicDir,pathname.slice(1)):path.join(dir,pathname);
    assert(fs.existsSync(resolved),file);
  }
  for(const file of ['app.js','scene.js','typing-engine.js','style.css','index.html'])assert(!/https?:\/\//.test(fs.readFileSync(path.join(dir,file),'utf8')),'external URL in '+file);
});
console.log(`${cases} smoke checks passed.`);
