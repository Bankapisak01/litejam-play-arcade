/* Tempo Rush × Scale Flow — pure chart + backing-track synthesis. No DOM, no audio API.
 * One scale (root × type × position × octave) played as a routine of rounds becomes a Tempo Rush chart:
 * the lane is the fretting hand moving across strings, every note carries its real pitch,
 * and the backing track is deterministic local synthesis (clicks on every beat, the note's pitch on its beat). */
export const LANE_KEYS = ['D', 'F', 'J', 'K'];
/** Strings 6 and 5 → lane 0 (D), 4 → 1 (F), 3 → 2 (J), 2 and 1 → 3 (K). */
export function laneFor(string) { return string >= 5 ? 0 : string === 4 ? 1 : string === 3 ? 2 : 3; }
export const midiHz = midi => 440 * Math.pow(2, (midi - 69) / 12);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Build the chart from a Scale Flow session used only as a schedule source (never started). */
export function buildScaleChart(config, ScaleFlow) {
  const session = new ScaleFlow.Session({ ...config, mode: 'battle' });
  const notes = session.steps.map((step, i) => ({
    time: session.dueAt[i] / 1000, beat: i, lane: laneFor(step.string), type: 'tap', duration: 0,
    section: `round-${step.round}`, pitch: step.midi, label: step.label, string: step.string, fret: step.fret,
    isRoot: step.isRoot, round: step.round, degree: step.degree, accent: step.roundStep % 4 === 0,
  }));
  const rounds = session.rounds.map(r => ({
    index: r.index, key: r.key, name: r.name, short: r.short, hint: r.hint, bpm: r.bpm,
    start: r.startMs / 1000, firstNote: r.length ? session.dueAt[r.start] / 1000 : r.startMs / 1000, end: r.endMs / 1000, count: r.length,
  }));
  const chart = { version: 1, song_id: 'scale-flow', bpm: session.config.bpm, meter: [4, 4], lanes: LANE_KEYS.slice(), notes };
  return { chart, rounds, totalMs: session.totalMs, run: session.run, beats: session.beats, steps: session.steps };
}

/** Mono backing track: a click on every beat, and (guide) each note's pitch as a short pluck on its beat. */
export function renderBackingTrack({ beats, notes, totalMs }, sampleRate, { guide = true, volume = 1 } = {}) {
  const length = Math.ceil((totalMs / 1000 + 1) * sampleRate), out = new Float32Array(length);
  const add = (startSec, durSec, fn) => {
    const start = Math.floor(startSec * sampleRate), n = Math.min(length - start, Math.floor(durSec * sampleRate));
    for (let i = 0; i < n; i++) out[start + i] += fn(i / sampleRate, i / n);
  };
  let seed = 7;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (const b of beats || []) {
    const accent = (b.countIn && b.beat === 0) || (!b.countIn && b.roundStep % 4 === 0);
    const hz = accent ? 1500 : 1000, dur = accent ? .035 : .025, level = accent ? .22 : .14;
    add(b.at / 1000, dur, (t, p) => (Math.sign(Math.sin(2 * Math.PI * hz * t)) * .7 + noise() * .3) * level * (1 - p));
  }
  if (guide) for (const n of notes || []) {
    const hz = midiHz(n.pitch), dur = .3;
    add(n.time, dur, (t, p) => {
      const env = Math.exp(-p * 5.5) * (1 - p);
      const tri = 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * hz * t));
      const saw = 2 * (hz * t - Math.floor(hz * t + .5));
      const oct = Math.sin(2 * Math.PI * hz * 2 * t);
      return (tri + saw * .22 + oct * .16) * .16 * env;
    });
  }
  for (let i = 0; i < length; i++) out[i] = clamp(out[i] * volume, -1, 1);
  return out;
}

/** Practice · notes wait: the clock advances by dt but never past the next pending note, which waits for the hit. */
export function advancePracticeClock(clock, dt, nextNoteTime = Infinity) { return Math.min(clock + Math.max(0, dt), nextNoteTime); }
/** Time of the next unresolved note, or +Infinity when the chart is done. */
export function nextPendingTime(notes) { const n = notes.find(x => x.status === 'pending'); return n ? n.time : Infinity; }
/** True while the practice clock sits on a waiting note. */
export function isFrozen(clock, nextNoteTime) { return Number.isFinite(nextNoteTime) && clock >= nextNoteTime - 1e-9; }
/** Auto run: pending notes whose time has arrived and that were not auto-pressed yet (newest first-come order). */
export function dueAutoPresses(notes, time, lastPressed = -Infinity) { return notes.filter(n => n.status === 'pending' && n.time <= time && n.time > lastPressed); }
/** Entries whose time lies in (from, to] — the beats or notes a moving clock just crossed. */
export function crossed(list, from, to, at = x => x) { return list.filter(x => at(x) > from && at(x) <= to); }

/** Per-round summary from resolved chart notes. */
export function roundStats(notes, rounds) {
  return rounds.map(r => {
    const list = notes.filter(n => n.round === r.index), hits = list.filter(n => n.judgement && n.judgement !== 'miss');
    const score = list.reduce((s, n) => s + (n.judgement === 'perfect' ? 1 : n.judgement === 'good' ? .7 : n.judgement === 'ok' ? .4 : 0), 0);
    return { ...r, total: list.length, hits: hits.length, miss: list.filter(n => n.judgement === 'miss').length, accuracy: list.length ? score * 100 / list.length : 100 };
  });
}
