/** The audio clock is the only timeline used for judging or note travel. */
export class AudioTransport {
  constructor(createContext=()=>new (window.AudioContext||window.webkitAudioContext)()){
    this.createContext=createContext;this.context=null;this.source=null;this.anchor=0;this.generation=0;this.volume=.7;this.paused=false;
  }
  async unlock(){
    if(!this.context){this.context=this.createContext();this.gain=this.context.createGain();this.gain.gain.value=this.volume;this.gain.connect(this.context.destination);}
    if(this.context.state!=='running')await this.context.resume();
    return this.context;
  }
  async decode(data){const context=this.context||await this.unlock();return context.decodeAudioData(data);}
  setVolume(value){this.volume=Math.max(0,Math.min(1,value));if(this.gain)this.gain.gain.value=this.volume;}
  start(buffer,onEnded,leadIn=3){
    this.stop();const generation=this.generation;
    const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.gain);
    this.anchor=this.context.currentTime+leadIn;this.source=source;this.paused=false;
    source.onended=()=>{if(generation===this.generation&&this.source===source){this.source=null;onEnded();}};
    source.start(this.anchor);
  }
  time(){return this.context?this.context.currentTime-this.anchor:0;}
  async pause(){if(!this.source||this.paused)return;const generation=this.generation;await this.context.suspend();if(generation===this.generation)this.paused=true;}
  async resume(){if(!this.source)return;const generation=this.generation;await this.context.resume();if(generation===this.generation)this.paused=false;}
  stop(){
    this.generation++;
    if(this.source){const source=this.source;this.source=null;source.onended=null;try{source.stop();}catch{}source.disconnect();}
    this.paused=false;
  }
}
