"""Validate delivered audio, editable scores, MIDI and four-lane rhythm charts."""
from pathlib import Path
import hashlib
import json
import struct
import wave
import av
import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
report = {'checks': [], 'tracks': []}

def check(condition, message):
    if not condition:
        raise AssertionError(message)
    report['checks'].append(message)

def decode(path):
    buffers = []
    with av.open(str(path)) as container:
        resampler = av.AudioResampler(format='fltp', layout='stereo', rate=44100)
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame):
                buffers.append(output.to_ndarray().T)
        for output in resampler.resample(None):
            buffers.append(output.to_ndarray().T)
    return np.concatenate(buffers)

def check_midi(path):
    data = path.read_bytes()
    check(data[:4] == b'MThd' and struct.unpack('>IHHH', data[4:14]) == (6, 1, 6, 480), f'{path.name}: MIDI format 1, six tracks, 480 PPQ')
    pos = 14
    for _ in range(6):
        check(data[pos:pos+4] == b'MTrk', f'{path.name}: track at {pos} has valid chunk header')
        length = int.from_bytes(data[pos+4:pos+8], 'big')
        body = data[pos+8:pos+8+length]
        check(body.endswith(b'\x00\xff\x2f\x00'), f'{path.name}: track at {pos} has end marker')
        pos += 8 + length
    check(pos == len(data), f'{path.name}: all MIDI chunks complete')

hashes = set()
for track in json.loads((ROOT/'tracks.json').read_text(encoding='utf-8'))['tracks']:
    name = track['id']
    with wave.open(str(ROOT/track['wav']), 'rb') as wav:
        check((wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (44100, 2, 2), f'{name}: stereo 44.1 kHz 16-bit WAV')
        frames = wav.getnframes()
        raw = wav.readframes(frames)
        audio = np.frombuffer(raw, dtype='<i2').reshape(-1, 2).astype(np.float32)/32768
    digest = hashlib.sha256(raw).hexdigest()
    check(digest not in hashes, f'{name}: distinct audio content')
    hashes.add(digest)
    check(abs(frames/44100-track['duration']) < 1/44100, f'{name}: duration matches metadata')
    peak = float(np.max(np.abs(audio)))
    true_peak = float(np.max(np.abs(signal.resample_poly(audio, 4, 1, axis=0))))
    rms = float(np.sqrt(np.mean(audio**2)))
    check(.1 < peak < .94 and true_peak < .95, f'{name}: no clipping; true peak has headroom')
    check(.02 < rms < .4 and np.max(np.abs(audio.mean(axis=0))) < .001, f'{name}: active audio and negligible DC')
    check(np.max(np.abs(audio[-4410:])) < .002, f'{name}: release fades to silence')
    section_rms = {s['id']: float(np.sqrt(np.mean(audio[round(s['start']*44100):round(s['end']*44100)]**2))) for s in track['sections']}
    check(all(v > .01 for v in section_rms.values()), f'{name}: all seven song sections contain audio')
    check(section_rms['chorus'] > section_rms['break'], f'{name}: chorus/break dynamic contrast')
    mp3 = decode(ROOT/track['audio'])
    check(abs(len(mp3)-frames) < 100, f'{name}: MP3 decodes to expected duration')
    correlation = float(np.corrcoef(audio[:44100*12].ravel(), mp3[:44100*12].ravel())[0,1])
    check(correlation > .97, f'{name}: MP3 remains aligned with WAV')
    for stem in ('lead', 'guitars', 'bass', 'drums', 'atmosphere'):
        path = ROOT/'stems'/f'{name}-{stem}.flac'
        if path.exists():
            part = decode(path)
            check(len(part) == frames and np.isfinite(part).all() and np.sqrt(np.mean(part**2)) > .001, f'{name}: {stem} FLAC stem decodes and spans complete song')
    score = json.loads((ROOT/'source'/f'{name}-score.json').read_text())
    melody = {(round(e['beat'],4), e['note']) for e in score['events'] if e['stem']=='lead' and e['playable']}
    chart_counts = {}
    for difficulty in ('easy','normal'):
        chart = json.loads((ROOT/track['charts'][difficulty]['file']).read_text())
        notes = chart['notes'];chart_counts[difficulty] = len(notes)
        busy = [-1.]*4
        for n in notes:
            t = n['time']; lane = n['lane']
            assert 0 <= lane < 4 and 0 <= t < track['music_duration'], (name, difficulty, n)
            assert t >= busy[lane] - 1e-5, (name, difficulty, 'overlapping lane', n)
            assert t+n['duration'] <= track['music_duration'], (name, difficulty, 'hold past ending')
            busy[lane] = t + max(.045,n['duration'])
            assert sum(end>t+1e-5 for end in busy) <= 2, (name, difficulty, 'more than two keys required', n)
            assert abs(t-n['beat']*60/track['bpm']) < 1e-5, (name, difficulty, 'tempo mismatch')
            if n.get('source') != 'power-chord':
                assert (round(n['beat'],4),n['pitch']) in melody, (name, difficulty, 'no musical onset')
        check(True, f'{name}/{difficulty}: bounds, tempo, real musical onsets, no lane overlap, max two keys')
    check(chart_counts['normal'] > chart_counts['easy'], f'{name}: distinct Easy and Normal density')
    check_midi(ROOT/'source'/f'{name}.mid')
    report['tracks'].append(dict(id=name, duration=frames/44100, peak=round(peak,6), true_peak=round(true_peak,6), rms_dbfs=round(20*np.log10(rms),2), mp3_wav_correlation=round(correlation,6), section_rms=section_rms, charts=chart_counts, sha256=digest))

report['status'] = 'passed'
(ROOT/'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'status': 'passed', 'checks': len(report['checks']), 'tracks': report['tracks']}, indent=2))
