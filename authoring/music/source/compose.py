"""Two original pixel-rock compositions, rendered locally with deterministic DSP.

No external samples, pretrained model, cloud service or network calls.
Uses NumPy/SciPy/PyAV already installed in the local ComfyUI environment.
"""
from __future__ import annotations

import argparse
import gc
import json
import math
from functools import lru_cache
from fractions import Fraction
from pathlib import Path
import struct
import wave

import av
import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
SR = 44100
STEMS = ('lead', 'guitars', 'bass', 'drums', 'atmosphere')
SEMITONES = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
             'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
             'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def note(name):
    return 12 * (int(name[-1]) + 1) + SEMITONES[name[:-1]]


def phrase(*items):
    return [(beat, note(pitch), length) for beat, pitch, length in items]


HEART_VERSE = [
    phrase((0,'E5',.45),(.5,'G5',.45),(1,'B5',.85),(2,'A5',.45),(2.5,'G5',.45),(3,'E5',.85)),
    phrase((0,'G5',.85),(1,'E5',.45),(1.5,'D5',.45),(2,'E5',1.65)),
    phrase((0,'D5',.45),(.5,'G5',.45),(1,'B5',.85),(2,'D6',.45),(2.5,'B5',.45),(3,'A5',.85)),
    phrase((0,'F#5',.45),(.5,'A5',.45),(1,'D6',1.25),(2.5,'C6',.45),(3,'A5',.85)),
]
HEART_HOOK = [
    phrase((0,'B5',.85),(1,'B5',.45),(1.5,'G5',.45),(2,'E5',.85),(3,'G5',.45),(3.5,'A5',.45)),
    phrase((0,'C6',.85),(1,'B5',.45),(1.5,'G5',.45),(2,'E5',.85),(3,'D5',.45),(3.5,'E5',.45)),
    phrase((0,'B5',.45),(.5,'D6',.45),(1,'E6',.85),(2,'D6',.45),(2.5,'B5',.45),(3,'G5',.85)),
    phrase((0,'A5',.45),(.5,'F#5',.45),(1,'E5',.85),(2,'D5',.45),(2.5,'F#5',.45),(3,'B4',.85)),
]
DRAKE_VERSE = [
    phrase((0,'D5',.24),(.75,'D5',.24),(1.5,'F5',.44),(2,'A5',.44),(2.75,'G5',.24),(3.5,'F5',.44)),
    phrase((0,'F5',.44),(.75,'D5',.24),(1.5,'Bb4',.44),(2,'F5',.44),(2.75,'G5',.24),(3.5,'F5',.44)),
    phrase((0,'G5',.44),(.75,'E5',.24),(1.5,'C5',.44),(2,'G5',.44),(2.75,'Bb5',.24),(3.5,'G5',.44)),
    phrase((0,'A5',.44),(.75,'E5',.24),(1.5,'C#5',.44),(2,'E5',.44),(2.75,'G5',.24),(3.5,'A5',.44)),
]
DRAKE_HOOK = [
    phrase((0,'D6',.85),(1,'A5',.45),(1.5,'F5',.45),(2,'D5',1.65)),
    phrase((0,'F5',.45),(.5,'Bb5',.45),(1,'D6',.85),(2,'C6',.45),(2.5,'Bb5',.45),(3,'A5',.85)),
    phrase((0,'G5',.45),(.5,'C6',.45),(1,'E6',.85),(2,'D6',.45),(2.5,'C6',.45),(3,'G5',.85)),
    phrase((0,'C#6',.45),(.5,'B5',.45),(1,'A5',.85),(2,'G5',.45),(2.5,'E5',.45),(3,'C#5',.85)),
]
SONGS = [
    dict(id='neon-heartbeat', title='Neon Heartbeat', bpm=120, key='E minor', seed=12011,
         description='Bright melodic pixel rock. Straight eighth notes, a singing hook, and a spacious half-time bridge.',
         description_th='ร็อกพิกเซลทำนองสดใส จังหวะตรง มีฮุคจำง่ายและช่วงพักมือ',
         progression=[('E3',[0,3,7]),('C3',[0,4,7]),('G2',[0,4,7]),('D3',[0,4,7])],
         sections=[('intro','Signal in',4),('verse','Neon rooftops',8),('chorus','Heartbeat hook',8),
                   ('break','City lights',4),('solo','Skyline solo',8),('final','Last light',8),('outro','Home signal',4)]),
    dict(id='drake-overdrive', title='Drake Overdrive', bpm=144, key='D minor', seed=14422,
         description='Heavier syncopated chip metal. A 3-3-2 riff, double-kick accents, and a final overdrive chorus.',
         description_th='ร็อกพิกเซลหนักขึ้น ริฟฟ์ขัดจังหวะ 3–3–2 กลองแน่นและโซโลสลับมือ',
         progression=[('D3',[0,3,7]),('Bb2',[0,4,7]),('C3',[0,4,7]),('A2',[0,4,7])],
         sections=[('intro','Reactor wake',4),('verse','Steel pulse',8),('chorus','Drake anthem',8),
                   ('break','Before the storm',4),('solo','Circuit breaker',8),('final','Overdrive',12),('outro','Last spark',4)]),
]


def arrangement(song):
    """A deliberately authored melody/riff arrangement, with bounded variations."""
    events, sections = [], []
    heavy = song['id'] == 'drake-overdrive'
    beat_seconds = 60 / song['bpm']
    cursor = 0

    def add(stem, kind, beat, pitch=0, length=.5, velocity=1, pan=0, variant=0, playable=False):
        events.append(dict(stem=stem, kind=kind, beat=round(beat,4), note=int(pitch),
                           duration_beats=round(length,4), velocity=round(velocity,3),
                           pan=pan, variant=variant, playable=playable))

    for section_kind, label, bars in song['sections']:
        sections.append(dict(id=section_kind, label=label, start_beat=cursor*4,
                             end_beat=(cursor+bars)*4, start=cursor*4*beat_seconds,
                             end=(cursor+bars)*4*beat_seconds))
        for local_bar in range(bars):
            bar = cursor + local_bar
            start = bar*4
            chord_index = local_bar % 4
            root_name, triad = song['progression'][chord_index]
            root = note(root_name)
            chorus = section_kind in ('chorus','final')
            sparse = section_kind in ('intro','break')
            ending = section_kind == 'outro' and local_bar == bars-1
            if ending:
                root = note('D3' if heavy else 'E3')
                triad = [0,3,7]
            energy = .58 if section_kind == 'intro' else .52 if section_kind == 'break' else 1.0 if chorus else .88

            # Harmonic bed: warm, low, slowly articulated, never a wall of saw waves.
            if local_bar % 1 == 0:
                for offset in triad:
                    add('atmosphere','pad',start,root+12+offset,3.9,.17 if sparse else .09,pan=(offset-4)/12)
            arp_notes = [root+24+triad[i] for i in (0,1,2,1)]
            if section_kind in ('intro','break','chorus','final'):
                for j in range(8):
                    add('atmosphere','arp',start+j*.5,arp_notes[j%4],.27,.32 if sparse else .15,pan=(-.5 if j%2 else .5))

            # Two detuned takes of power chords, with real rests between palm mutes.
            if section_kind == 'break':
                strums = [(0,2.8,.58)]
            elif ending:
                strums = [(0,3.6,1.0)]
            elif sparse and local_bar < 2:
                strums = [(0,1.55,.48),(2,1.2,.48)]
            elif heavy:
                strums = [(b,.27 if b%1 else .36,1 if b in (0,2) else .78) for b in (0,.75,1.5,2,2.75,3.5)]
                if chorus and local_bar%2: strums += [(3.75,.18,.68)]
            else:
                strums = [(b,.30 if b%1 else .48,1 if b in (0,2) else .74) for b in ((0,.5,1,1.5,2,2.5,3,3.5) if chorus else (0,.75,1.5,2,2.75,3.5))]
            for b,length,accent in strums:
                for take,pan in enumerate((-.66,.66)):
                    for offset,gain in ((0,1),(7,.65),(12,.4)):
                        add('guitars','guitar',start+b+take*.015,root+offset,length,energy*accent*gain*.44,pan,take)

            # Bass locks to the kick, with passing notes only at phrase ends.
            bass_pattern = (0,.75,1.5,2,2.75,3.5) if heavy else (0,.5,1.5,2,2.5,3.5)
            if section_kind == 'break': bass_pattern = (0,2)
            if ending: bass_pattern = (0,)
            for j,b in enumerate(bass_pattern):
                bp = root-12
                if j == len(bass_pattern)-1 and not sparse and not ending: bp += 7 if local_bar%2 else 12
                add('bass','bass',start+b,bp,3.8 if ending else .72 if sparse else .43,.78 if b in (0,2) else .62)

            # Drums: snare on 2/4, kicks and fills phrase the music, not random noise.
            kicks = (0,2) if sparse else ((0,.75,1.5,2,2.75,3.5) if heavy else (0,1.5,2,2.75))
            if heavy and chorus and local_bar%2==1: kicks += (3.75,)
            if ending: kicks = (0,)
            for b in kicks: add('drums','kick',start+b,36,.65,energy*(1 if b%1==0 else .74))
            snares = (2,) if sparse else (1,3)
            if ending: snares = ()
            for b in snares: add('drums','snare',start+b,38,.5,energy*.86)
            if not ending:
                for j in range(8 if not (section_kind=='break') else 4):
                    hb = j*.5 if section_kind!='break' else j
                    add('drums','hatopen' if (j==7 and chorus) else 'hat',start+hb,46 if j==7 and chorus else 42,.5,.44 if j%2 else .60,pan=.23)
            if local_bar == 0 or (chorus and local_bar%4==0) or ending:
                add('drums','crash',start,49,3,.62 if chorus or ending else .42,pan=-.24)
            if local_bar == bars-1 and section_kind not in ('outro',):
                for j in range(4):
                    add('drums','tom',start+2+j*.5,52-j*3,.5,.65+j*.06,pan=-.45+j*.3)
                if heavy:
                    for j in range(4): add('drums','snare',start+3+j*.25,38,.2,.34+j*.06)

            if section_kind in ('verse','chorus','final'):
                melody = (DRAKE_HOOK if chorus else DRAKE_VERSE) if heavy else (HEART_HOOK if chorus else HEART_VERSE)
                notes = melody[chord_index]
                for b,pitch,length in notes:
                    add('lead','lead',start+b,pitch,length,.78 if chorus else .64,variant=1 if heavy else 0,playable=True)
                    # Final chorus gets a restrained octave answer, not doubled all the way.
                    if section_kind=='final' and local_bar>=4 and b in (0,2):
                        add('atmosphere','arp',start+b,pitch-12,min(length,.7),.18,pan=-.35)
            elif section_kind == 'solo':
                scale = [0,2,3,5,7,8,10,12] if heavy else [0,2,3,5,7,9,10,12]
                tonic = note('D5' if heavy else 'E5')
                if local_bar%4 in (0,2):
                    sequence = [0,2,4,6,7,6,4,2]
                    for j,index in enumerate(sequence): add('lead','lead',start+j*.5,tonic+scale[(index+local_bar//4)%8],.41,.71,variant=int(heavy),playable=True)
                elif local_bar%4==1:
                    for j,index in enumerate([7,6,5,4,3,2,1,0,2,4,6,7]):
                        add('lead','lead',start+j*.25,tonic+scale[index],.21,.57,variant=int(heavy),playable=j%2==0)
                    add('lead','lead',start+3,root+24+7,.85,.8,variant=int(heavy),playable=True)
                else:
                    for b,pitch,length in ((0,root+24,1.65),(2,root+31,.45),(2.5,root+27,.45),(3,root+24,.85)):
                        add('lead','lead',start+b,pitch,length,.76,variant=int(heavy),playable=True)
            elif section_kind=='intro':
                if local_bar>=2:
                    for b,offset in ((0,0),(1,7),(2,12),(3,7)):
                        add('lead','lead',start+b,root+24+offset,.8,.50,variant=int(heavy),playable=True)
            elif section_kind=='break':
                for b,offset,length in ((0,triad[1],1.65),(2,triad[2],1.65)):
                    add('lead','lead',start+b,root+24+offset,length,.43,variant=int(heavy),playable=True)
            elif section_kind=='outro':
                if ending:
                    tonic = note('D5' if heavy else 'E5')
                    add('lead','lead',start,tonic,3.7,.75,variant=int(heavy),playable=True)
                else:
                    melody = DRAKE_HOOK if heavy else HEART_HOOK
                    for b,pitch,length in melody[chord_index]:
                        add('lead','lead',start+b,pitch,length,.58,variant=int(heavy),playable=True)
        cursor += bars
    return sorted(events,key=lambda e:e['beat']), sections, cursor*4


def env(t, gate, attack=.005, decay=.07, sustain=.65, release=.08):
    out=np.ones_like(t)*sustain
    a=t<attack;out[a]=t[a]/attack
    d=(t>=attack)&(t<attack+decay);out[d]=sustain+(1-sustain)*np.exp(-(t[d]-attack)/decay*4)
    off=t>gate;out[off]=sustain*np.exp(-(t[off]-gate)/release*5)
    out*=np.minimum(1,np.maximum(0,(t[-1]-t)/.006))
    return out


def lowpass(y,cutoff,sr=SR):
    return signal.sosfilt(signal.butter(2,cutoff,fs=sr,output='sos'),y).astype(np.float32)


@lru_cache(maxsize=1200)
def synth(kind,pitch,gate,variant=0):
    frequency=440*2**((pitch-69)/12)
    rng=np.random.default_rng(3901+pitch*29+variant*739)
    if kind=='guitar':
        rate=SR*2;t=np.arange(int((gate+.08)*rate),dtype=np.float64)/rate
        f=frequency*2**((-.045 if variant==0 else .045)/12)
        out=np.zeros_like(t)
        for h in range(1,min(22,int(15000/f))+1):
            weight=(.42+.58*np.sin(np.pi*h*.21)**2)/h**1.2
            out+=weight*np.cos(2*np.pi*f*h*t+rng.uniform(-.3,.3))*np.exp(-t*(2.8+h*.28))
        out+=rng.normal(0,.10,len(t))*np.exp(-t*170)
        out=np.tanh(out*2.8)*env(t,gate,.002,.045,.77,.065)
        out=lowpass(out,5100,rate)
        return signal.resample_poly(out,1,2).astype(np.float32)*.60
    release=.13 if kind in ('lead','arp') else .45 if kind=='pad' else .07
    t=np.arange(int((gate+release)*SR),dtype=np.float64)/SR
    if kind=='lead':
        # Band-limited 25% pulse + triangle. Vibrato begins after the attack.
        vibrato=.0017*(1-np.exp(-t*7))*np.sin(2*np.pi*5.6*t)
        phase=2*np.pi*frequency*(t+vibrato/(2*np.pi*5.6))
        out=np.zeros_like(t)
        for h in range(1,min(18,int(9500/frequency))+1):
            out+=np.sin(h*np.pi*(.25 if variant==0 else .32))/h**1.3*np.cos(h*phase)
        out=.65*out+.35*np.sin(phase)
        out=lowpass(out,6200 if variant else 5400)
        out*=env(t,gate,.007,.065,.62,.13)
        return (out*.55).astype(np.float32)
    if kind=='bass':
        out=np.sin(2*np.pi*frequency*t)+.23*np.sin(4*np.pi*frequency*t)+.12*np.sin(6*np.pi*frequency*t)
        out=np.tanh(out*1.3)*env(t,gate,.004,.08,.72,.07)
        return (lowpass(out,1400)*.65).astype(np.float32)
    if kind=='arp':
        out=np.sin(2*np.pi*frequency*t)+.26*np.sin(4*np.pi*frequency*t)+.12*np.sin(6*np.pi*frequency*t)
        out*=np.exp(-t*9)*env(t,gate,.004,.06,.6,.13)
        return (out*.45).astype(np.float32)
    if kind=='pad':
        out=np.sin(2*np.pi*frequency*t)+.20*np.sin(2*np.pi*frequency*1.003*t)+.12*np.sin(4*np.pi*frequency*t)
        out*=env(t,gate,.16,.2,.62,.45)
        return (out*.32).astype(np.float32)
    raise ValueError(kind)


@lru_cache(maxsize=100)
def drum(kind,pitch,variant):
    lengths={'kick':.42,'snare':.26,'hat':.09,'hatopen':.27,'crash':1.4,'tom':.32}
    t=np.arange(int(lengths[kind]*SR))/SR
    rng=np.random.default_rng(2011+pitch*7+variant*17);noise=rng.normal(0,1,len(t))
    if kind=='kick':
        phase=2*np.pi*(48*t+(140-48)*.018*(1-np.exp(-t/.018)))
        y=np.sin(phase)*np.exp(-t*12)+.14*noise*np.exp(-t*270)
        y=np.tanh(y*1.25)*.72
    elif kind=='snare':
        bright=signal.sosfilt(signal.butter(2,[1100,10500],btype='bandpass',fs=SR,output='sos'),noise)
        y=.55*bright*np.exp(-t*22)+.35*np.sin(2*np.pi*182*t)*np.exp(-t*32)
        y=np.tanh(y*1.15)*.66
    elif kind in ('hat','hatopen'):
        bright=signal.sosfilt(signal.butter(2,6200,btype='highpass',fs=SR,output='sos'),noise)
        metal=sum(np.sin(2*np.pi*f*t) for f in (4387,5279,6197,7373))/4
        y=(.6*bright+.4*metal)*np.exp(-t*(65 if kind=='hat' else 15))*.22
    elif kind=='crash':
        bright=signal.sosfilt(signal.butter(2,[3000,14000],btype='bandpass',fs=SR,output='sos'),noise)
        y=bright*np.exp(-t*4.4)*(.8+.2*np.sin(2*np.pi*29*t))*.34
    else:
        f=440*2**((pitch-69)/12)*1.6
        phase=2*np.pi*(f*t+f*.4*.025*(1-np.exp(-t/.025)))
        y=(np.sin(phase)*np.exp(-t*16)+.06*noise*np.exp(-t*55))*.55
    y*=np.minimum(1,t/.001)*np.minimum(1,np.maximum(0,(t[-1]-t)/.008))
    return y.astype(np.float32)


def place(stereo,mono,start,velocity,pan):
    start=int(round(start*SR))
    count=min(len(mono),len(stereo)-start)
    if count<=0:return
    gains=np.array([math.cos((pan+1)*math.pi/4),math.sin((pan+1)*math.pi/4)],dtype=np.float32)
    stereo[start:start+count]+=mono[:count,None]*(gains*velocity)[None,:]


def delay(stereo,seconds,gain,swap=False):
    offset=int(seconds*SR)
    if offset<=0 or offset>=len(stereo):return
    source=stereo[:-offset,::-1] if swap else stereo[:-offset]
    stereo[offset:]+=source.copy()*gain


def wav(path,audio):
    rng=np.random.default_rng(904)
    dither=(rng.random(audio.shape,dtype=np.float32)-rng.random(audio.shape,dtype=np.float32))/65536
    pcm=np.round(np.clip(audio+dither,-1,1)*32767).astype('<i2')
    with wave.open(str(path),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(SR);f.writeframes(pcm.tobytes())


def encoded(path,audio,codec,bitrate=None):
    with av.open(str(path),'w') as out:
        stream=out.add_stream(codec,rate=SR);stream.layout='stereo'
        if bitrate:stream.bit_rate=bitrate
        for pos in range(0,len(audio),4096):
            frame=av.AudioFrame.from_ndarray(np.ascontiguousarray(audio[pos:pos+4096].T),format='fltp',layout='stereo')
            frame.sample_rate=SR;frame.pts=pos;frame.time_base=Fraction(1,SR)
            for packet in stream.encode(frame):out.mux(packet)
        for packet in stream.encode(None):out.mux(packet)


def make_chart(song,events,sections,beats,difficulty):
    beat_seconds=60/song['bpm'];heavy=song['id']=='drake-overdrive'
    melodic=[e for e in events if e['playable'] and e['stem']=='lead']
    pitches=sorted({e['note'] for e in melodic});busy=[-1.0]*4;notes=[];last_beat=-99
    for i,e in enumerate(melodic):
        b=e['beat'];duration=e['duration_beats'];sec=next(s for s in sections if s['start_beat']<=b<s['end_beat'])
        if b<8 or b>=beats-4:continue
        # Easy charts follow the same musical notes with more breathing room.
        gap=1 if difficulty=='easy' else .5
        if b-last_beat<gap-1e-6:continue
        rank=pitches.index(e['note'])/max(1,len(pitches)-1)
        lane=min(3,int(rank*3.999))
        if heavy:lane=[1,0,3,2][lane]
        if busy[lane]>b-.12:
            available=[j for j in range(4) if busy[j]<=b-.12]
            if not available:continue
            lane=min(available,key=lambda j:abs(j-lane))
        hold=duration>=1.3 and sec['id'] not in ('solo',)
        length=min(duration-.12,2.5) if hold else 0
        n=dict(time=round(b*beat_seconds,6),beat=b,lane=lane,type='hold' if hold else 'tap',
               duration=round(length*beat_seconds,6),section=sec['id'],pitch=e['note'],accent=False)
        notes.append(n);busy[lane]=b+length+.08;last_beat=b
        # Pairs correspond to audible power-chord downbeats, never arbitrary triples.
        bar=int(b//4)
        if difficulty=='normal' and sec['id'] in ('chorus','final') and b%4==0 and bar%2==0 and not hold:
            others=[j for j in range(4) if j!=lane and busy[j]<=b-.12]
            if others:
                other=max(others,key=lambda j:abs(j-lane));notes.append({**n,'lane':other,'pitch':None,'source':'power-chord'});busy[other]=b+.08
                n['accent']=True
    notes.sort(key=lambda n:(n['time'],n['lane']))
    return dict(version=1,song_id=song['id'],difficulty=difficulty,bpm=song['bpm'],meter=[4,4],
                audio=f"../audio/{song['id']}.wav",audio_offset_seconds=0,lanes=['D','F','J','K'],
                music_duration_seconds=beats*beat_seconds,notes=notes)


def midi_file(path,events,sections,bpm):
    """Editable Standard MIDI File, tempo and section markers included."""
    def vlq(value):
        out=[value&127];value>>=7
        while value:out.insert(0,(value&127)|128);value>>=7
        return bytes(out)
    def track(messages):
        body=bytearray();last=0
        for tick,data in sorted(messages,key=lambda m:(m[0],m[1][0]&0xF0!=0x80)):
            body.extend(vlq(tick-last));body.extend(data);last=tick
        body.extend(b'\x00\xff\x2f\x00');return b'MTrk'+struct.pack('>I',len(body))+body
    tempo=round(60_000_000/bpm);meta=[(0,b'\xff\x51\x03'+tempo.to_bytes(3,'big')),(0,b'\xff\x58\x04\x04\x02\x18\x08')]
    for s in sections:
        title=s['label'].encode();meta.append((round(s['start_beat']*480),b'\xff\x06'+vlq(len(title))+title))
    tracks=[track(meta)]
    for channel,stem in enumerate(STEMS):
        ch=9 if stem=='drums' else channel
        label=stem.encode();messages=[(0,b'\xff\x03'+vlq(len(label))+label)]
        for e in events:
            if e['stem']!=stem:continue
            # The second guitar take is a render detail, not a duplicated MIDI part.
            if stem=='guitars' and e['variant']==1:continue
            start=round(e['beat']*480);end=round((e['beat']+e['duration_beats'])*480)
            velocity=max(1,min(127,round(e['velocity']*100)))
            messages.extend([(start,bytes([0x90|ch,e['note'],velocity])),(max(start+1,end),bytes([0x80|ch,e['note'],0]))])
        tracks.append(track(messages))
    path.write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(tracks),480)+b''.join(tracks))


def render(song,stems=False):
    events,sections,total_beats=arrangement(song);spb=60/song['bpm']
    duration=total_beats*spb+2;frames=round(duration*SR)
    channels={stem:np.zeros((frames,2),dtype=np.float32) for stem in STEMS}
    print(f"Rendering {song['title']}: {len(events)} events, {duration:.1f}s",flush=True)
    for i,e in enumerate(events):
        seconds=e['duration_beats']*spb
        sound=drum(e['kind'],e['note'],int(e['beat'])%4) if e['stem']=='drums' else synth(e['kind'],e['note'],round(seconds,4),e['variant'])
        place(channels[e['stem']],sound,e['beat']*spb,e['velocity'],e['pan'])
    # Slight kick ducking creates room for the bass drum without changing timing.
    duck=np.ones(frames,dtype=np.float32)
    recovery=.16;shape=1-.16*np.exp(-np.arange(int(recovery*SR))/SR*24)
    for e in events:
        if e['kind']=='kick':
            pos=round(e['beat']*spb*SR);end=min(frames,pos+len(shape));duck[pos:end]=np.minimum(duck[pos:end],shape[:end-pos])
    for stem in ('guitars','bass','atmosphere'):channels[stem]*=duck[:,None]
    delay(channels['lead'],spb*.75,.18,True)
    delay(channels['lead'],spb*1.5,.07,True)
    delay(channels['atmosphere'],.071,.12,True)
    delay(channels['guitars'],.023,.08,True)
    gains={'lead':.60,'guitars':.58,'bass':.54,'drums':.84,'atmosphere':.66}
    for stem in STEMS:channels[stem]*=gains[stem]
    mix=sum(channels.values())
    mix=signal.sosfilt(signal.butter(2,28,btype='highpass',fs=SR,output='sos'),mix,axis=0).astype(np.float32)
    mix=signal.sosfilt(signal.butter(2,15500,fs=SR,output='sos'),mix,axis=0).astype(np.float32)
    # Gentle RMS compression; transient shape and phrase dynamics are retained.
    hop=441;levels=[]
    for pos in range(0,frames,hop):levels.append(float(np.sqrt(np.mean(mix[pos:pos+hop]**2)+1e-12)))
    level=np.array(levels);desired=np.minimum(1,(np.maximum(level,.16)/.16)**(-.40))
    smoothed=[];current=1.0
    for value in desired:
        current+=(value-current)*(.35 if value<current else .065);smoothed.append(current)
    comp=np.interp(np.arange(frames),np.arange(len(smoothed))*hop,smoothed).astype(np.float32)
    mix*=comp[:,None]
    gain=.88/max(float(np.max(np.abs(mix))),1e-9)
    mix*=gain
    # Soft edges prevent cut-in/cut-out clicks; the final 2 seconds are a release tail.
    mix[:350]*=np.linspace(0,1,350)[:,None]
    mix[-int(.2*SR):]*=np.linspace(1,0,int(.2*SR))[:,None]
    oversampled=signal.resample_poly(mix,4,1,axis=0)
    true_peak=float(np.max(np.abs(oversampled)));del oversampled
    if true_peak>.93:mix*=.93/true_peak;gain*=.93/true_peak
    waveform=np.max(np.abs(mix[:len(mix)//512*512].reshape(-1,512,2)),axis=(1,2))
    wave_small=np.interp(np.linspace(0,len(waveform)-1,320),np.arange(len(waveform)),waveform)
    wav(ROOT/'audio'/f"{song['id']}.wav",mix)
    encoded(ROOT/'audio'/f"{song['id']}.mp3",mix,'libmp3lame',192000)
    if stems:
        for stem,buffer in channels.items():encoded(ROOT/'stems'/f"{song['id']}-{stem}.flac",np.clip(buffer*gain,-.98,.98).astype(np.float32),'flac')
    charts={}
    for difficulty in ('easy','normal'):
        chart=make_chart(song,events,sections,total_beats,difficulty)
        (ROOT/'charts'/f"{song['id']}-{difficulty}.json").write_text(json.dumps(chart,indent=2),encoding='utf-8')
        charts[difficulty]=dict(file=f"charts/{song['id']}-{difficulty}.json",notes=len(chart['notes']),holds=sum(n['type']=='hold' for n in chart['notes']),pairs=sum(a['time']==b['time'] for a,b in zip(chart['notes'],chart['notes'][1:])))
    source=dict(song=song,sections=sections,sample_rate=SR,events=events)
    (ROOT/'source'/f"{song['id']}-score.json").write_text(json.dumps(source,indent=2),encoding='utf-8')
    midi_file(ROOT/'source'/f"{song['id']}.mid",events,sections,song['bpm'])
    info=dict(id=song['id'],title=song['title'],bpm=song['bpm'],key=song['key'],meter='4/4',
              duration=duration,music_duration=total_beats*spb,audio=f"audio/{song['id']}.mp3",wav=f"audio/{song['id']}.wav",
              description=song['description'],description_th=song['description_th'],sections=sections,charts=charts,
              waveform=[round(float(v),4) for v in wave_small],provenance='Original composition; deterministic local synthesis; no samples or generative-audio service.')
    print(json.dumps({k:info[k] for k in ('id','duration','bpm','charts')}),flush=True)
    synth.cache_clear();drum.cache_clear();del channels,mix;gc.collect()
    return info


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--stems',action='store_true');parser.add_argument('--song',choices=[s['id'] for s in SONGS]);args=parser.parse_args()
    for folder in ('audio','charts','source','stems'):(ROOT/folder).mkdir(exist_ok=True)
    # Re-rendering one track preserves the other track in the listening library.
    previous = json.loads((ROOT/'tracks.json').read_text(encoding='utf-8'))['tracks'] if args.song and (ROOT/'tracks.json').exists() else []
    tracks=[t for t in previous if t['id'] != args.song]
    for song in SONGS:
        if not args.song or song['id']==args.song:tracks.append(render(song,args.stems))
    tracks.sort(key=lambda t:next(i for i,s in enumerate(SONGS) if s['id']==t['id']))
    album=dict(title='Punkman: Tempo Rush — Original Music Pack',version=1,sample_rate=SR,tracks=tracks)
    (ROOT/'tracks.json').write_text(json.dumps(album,indent=2,ensure_ascii=False),encoding='utf-8')
    (ROOT/'tracks.js').write_text('window.TEMPO_TRACKS = '+json.dumps(album,ensure_ascii=False)+';\n',encoding='utf-8')
    print('Album render complete.',flush=True)


if __name__=='__main__':main()
