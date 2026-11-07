export const WINDOWS = Object.freeze({perfect:.06,good:.12,ok:.18,holdRelease:.08,resumeGrace:.35});
const EPS=1e-8;
export function gradeTiming(error){
  const d=Math.abs(error);
  return d<=WINDOWS.perfect+EPS?'perfect':d<=WINDOWS.good+EPS?'good':d<=WINDOWS.ok+EPS?'ok':null;
}
export function rankForAccuracy(accuracy){return accuracy>=95?'S':accuracy>=85?'A':accuracy>=70?'B':accuracy>=50?'C':'D';}

export class RhythmSession {
  constructor(chart){
    if(!Array.isArray(chart.notes)||!chart.notes.length)throw new Error('Chart has no notes');
    this.notes=chart.notes.map((n,id)=>{
      if(!Number.isFinite(n.time)||n.time<0||!Number.isInteger(n.lane)||n.lane<0||n.lane>3||!['tap','hold'].includes(n.type)||!Number.isFinite(n.duration)||n.duration<0)throw new Error('Invalid chart note');
      return {...n,id,status:'pending',headGrade:null};
    }).sort((a,b)=>a.time-b.time||a.lane-b.lane);
    this.down=[false,false,false,false];this.events=[];this.score=0;this.combo=0;this.maxCombo=0;
    this.counts={perfect:0,good:0,ok:0,miss:0,ghost:0};this.resolved=0;this.time=-Infinity;this.finished=false;this.resumeGraceUntil=-Infinity;
  }
  get accuracy(){const c=this.counts,den=this.resolved+c.ghost;return den?(c.perfect+c.good*.7+c.ok*.4)*100/den:100;}
  get multiplier(){return Math.min(4,1+Math.floor(this.combo/10));}
  drainEvents(){const events=this.events;this.events=[];return events;}
  _resolve(n,judgement,time){
    if(n.status==='resolved')return;
    n.status='resolved';n.judgement=judgement;this.resolved++;this.counts[judgement]++;
    if(judgement==='miss')this.combo=0;
    else{this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);this.score+=({perfect:1000,good:700,ok:400}[judgement])*Math.min(4,1+Math.floor((this.combo-1)/10));}
    this.events.push({type:'judgement',judgement,lane:n.lane,note:n,time,combo:this.combo});
  }
  advance(time){
    if(this.finished||!Number.isFinite(time))return;
    this.time=Math.max(this.time,time);
    for(const n of this.notes){
      if(n.status==='pending'&&this.time>n.time+WINDOWS.ok+EPS)this._resolve(n,'miss',this.time);
      if(n.status==='holding'){
        const held=this.down[n.lane],grace=this.time<=this.resumeGraceUntil+EPS;
        if(!held&&!grace)this._resolve(n,'miss',this.time);
        else if(this.time>=n.time+n.duration-EPS)this._resolve(n,n.headGrade,this.time);
      }
    }
  }
  press(lane,time){
    if(this.finished||time<0||!Number.isInteger(lane)||lane<0||lane>3)return;
    this.advance(time);
    if(this.down[lane]||this.resolved===this.notes.length)return;
    this.down[lane]=true;
    const active=this.notes.find(n=>n.lane===lane&&n.status==='holding');
    if(active){this.events.push({type:'holdResume',lane,time});return;}
    const note=this.notes.find(n=>n.lane===lane&&n.status==='pending'&&gradeTiming(time-n.time));
    if(!note){this.counts.ghost++;this.combo=0;this.score=Math.max(0,this.score-50);this.events.push({type:'ghost',lane,time});return;}
    const judgement=gradeTiming(time-note.time);note.error=time-note.time;
    if(note.type==='hold'&&note.duration>0){note.status='holding';note.headGrade=judgement;this.events.push({type:'holdStart',judgement,lane,note,time});}
    else this._resolve(note,judgement,time);
  }
  release(lane,time){
    if(lane<0||lane>3||this.finished)return;
    const wasDown=this.down[lane];this.advance(time);this.down[lane]=false;
    const note=this.notes.find(n=>n.lane===lane&&n.status==='holding');
    // A key physically held across pause must be released before it can be
    // pressed again. That stale keyup is not an intentional early release.
    if(note&&!wasDown&&time<=this.resumeGraceUntil+EPS)return;
    if(note)this._resolve(note,time>=note.time+note.duration-WINDOWS.holdRelease-EPS?note.headGrade:'miss',time);
  }
  suspendInputs(){this.down.fill(false);}
  resumeAt(time){this.resumeGraceUntil=time+WINDOWS.resumeGrace;}
  finish(){if(this.finished)return;for(const n of this.notes)if(n.status!=='resolved')this._resolve(n,'miss',this.time);this.down.fill(false);this.finished=true;}
  summary(){return {score:this.score,accuracy:this.accuracy,maxCombo:this.maxCombo,total:this.notes.length,counts:{...this.counts},rank:rankForAccuracy(this.accuracy),fullCombo:this.counts.miss===0&&this.counts.ghost===0&&this.resolved===this.notes.length};}
}
