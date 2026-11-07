import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RhythmSession} from '../dist/engine.js';

// The real controller is exercised with a minimal DOM and manually settled
// audio transitions. This makes focus/load races deterministic.
async function harness(){
  const nodes=new Map(),winListeners={},docListeners={},pending={};
  const node=()=>({dataset:{},value:0,hidden:false,disabled:false,textContent:'',style:{},classList:{toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},focus(){},querySelectorAll(){return [];}});
  const document={hidden:false,focused:true,hasFocus(){return this.focused;},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,querySelectorAll:()=>[],addEventListener(type,cb){docListeners[type]=cb;}};
  const window={addEventListener(type,cb){winListeners[type]=cb;}};
  class Transport{
    constructor(){this.source=null;this.context={state:'running'};}
    setVolume(){}stop(){this.source=null;}
    unlock(){return new Promise(resolve=>pending.unlock=resolve);}
    decode(){return {duration:10};}start(){this.source={};}time(){return 1.5;}
    async pause(){this.context.state='suspended';}
    resume(){return new Promise(resolve=>pending.resume=()=>{this.context.state='running';resolve();});}
  }
  class Renderer{async load(){}cover(){}reset(){}event(){}}
  const chart={notes:[{time:1,lane:0,type:'hold',duration:2}]};
  const fetch=async()=>({ok:true,json:async()=>chart,arrayBuffer:async()=>new ArrayBuffer(0)});
  const track={id:'song',title:'test',bpm:120,key:'A',duration:10,charts:{easy:{file:'chart',notes:1}},sections:[]};
  const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const make=new Function('TRACKS','RhythmSession','AudioTransport','TempoRenderer','document','window','localStorage','matchMedia','requestAnimationFrame','fetch',source+'\nreturn {startRun,pauseRun,resumeRun,toMenu,getState:()=>state,transport};');
  const app=make([track],RhythmSession,Transport,Renderer,document,window,{getItem(){return null;}},()=>({matches:false}),()=>{},fetch);
  await Promise.resolve();await Promise.resolve();
  return {app,document,winListeners,docListeners,pending};
}
test('blur during audio loading completes into a paused game',async()=>{
  const h=await harness(),starting=h.app.startRun();h.document.focused=false;h.winListeners.blur();h.pending.unlock();await starting;
  assert.equal(h.app.getState(),'paused');assert.equal(h.app.transport.context.state,'suspended');
});
test('visibility loss during resume re-suspends audio before playing',async()=>{
  const h=await harness(),starting=h.app.startRun();h.pending.unlock();await starting;await h.app.pauseRun();
  const resuming=h.app.resumeRun();h.document.hidden=true;h.docListeners.visibilitychange();h.pending.resume();await resuming;
  assert.equal(h.app.getState(),'paused');assert.equal(h.app.transport.context.state,'suspended');
});
test('returning to selection cancels an in-flight start',async()=>{
  const h=await harness(),starting=h.app.startRun();h.app.toMenu();h.pending.unlock();await starting;
  assert.equal(h.app.getState(),'menu');assert.equal(h.app.transport.source,null);
});
test('returning to selection wins over a pending resume',async()=>{
  const h=await harness(),starting=h.app.startRun();h.pending.unlock();await starting;await h.app.pauseRun();
  const resuming=h.app.resumeRun();h.app.toMenu();h.pending.resume();await resuming;
  assert.equal(h.app.getState(),'menu');assert.equal(h.app.transport.source,null);
});

test('leaving the page cancels an in-flight start',async()=>{
  const h=await harness(),starting=h.app.startRun();h.winListeners.pagehide();h.pending.unlock();await starting;
  assert.equal(h.app.getState(),'menu');assert.equal(h.app.transport.source,null);
});

test('leaving the page wins over a pending resume',async()=>{
  const h=await harness(),starting=h.app.startRun();h.pending.unlock();await starting;await h.app.pauseRun();
  const resuming=h.app.resumeRun();h.winListeners.pagehide();h.pending.resume();await resuming;
  assert.equal(h.app.getState(),'menu');assert.equal(h.app.transport.source,null);
});
