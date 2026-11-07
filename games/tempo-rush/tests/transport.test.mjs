import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioTransport} from '../dist/transport.js';
class FakeContext {
  constructor(){this.currentTime=10;this.state='suspended';this.created=[];this.resumeCalls=0;this.destination={};}
  createGain(){return {gain:{value:0},connect(){}};}
  createBufferSource(){const s={connect(){},disconnect(){},start(at){this.startAt=at;},stop(){this.stopped=true;}};this.created.push(s);return s;}
  async resume(){this.resumeCalls++;this.state='running';}
  async suspend(){this.state='suspended';}
  async decodeAudioData(bytes){return {bytes,duration:90};}
  advance(seconds){if(this.state==='running')this.currentTime+=seconds;}
}
test('clock uses audio time, freezes on pause and continues without drift',async()=>{
  const c=new FakeContext(),t=new AudioTransport(()=>c);await t.unlock();t.start({},()=>{});assert.equal(t.time(),-3);
  c.advance(7);assert.equal(t.time(),4);await t.pause();c.advance(30);assert.equal(t.time(),4);await t.resume();c.advance(1);assert.equal(t.time(),5);
});
test('restarting stops the previous source and discards its ending callback',async()=>{
  const c=new FakeContext(),t=new AudioTransport(()=>c);await t.unlock();let endings=0;t.start({},()=>endings++);const old=c.created[0],end=old.onended;
  t.start({},()=>endings++);assert.equal(old.stopped,true);end();assert.equal(endings,0);c.created[1].onended();assert.equal(endings,1);
});
test('decoding a late cached load must not resume a paused song',async()=>{
  const c=new FakeContext(),t=new AudioTransport(()=>c);await t.unlock();t.start({},()=>{});await t.pause();const resumes=c.resumeCalls;
  await t.decode(new ArrayBuffer(8));assert.equal(c.resumeCalls,resumes);assert.equal(c.state,'suspended');
});
test('an obsolete pause completion cannot change a new source transport flag',async()=>{
  const c=new FakeContext(),t=new AudioTransport(()=>c);await t.unlock();t.start({},()=>{});
  let finishPause;c.suspend=()=>new Promise(resolve=>{finishPause=resolve;});const pending=t.pause();t.start({},()=>{});finishPause();await pending;assert.equal(t.paused,false);
});
