/* Key Battle × Scale Flow — pure rules. No DOM, no audio.
 * Content comes from the LiteJam app's Scale Flow tab: root × scale type × play position × octave.
 * One session = one scale, played as a routine of rounds. Every round re-orders the same position with a
 * pattern (up & down, thirds, down & up, scramble…) and may lift the tempo, so a flow lasts one to two minutes.
 * Scoring mirrors ChallengeRules (PERFECT / GREAT / GOOD / MISS, score 0..100,000) with timing windows widened for a keyboard. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScaleFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DATA = typeof window !== 'undefined' ? window.ScaleFlowData : require('./scale-flow-data.js');
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NAME_TO_PC = Object.fromEntries(NOTE_NAMES.map((n, i) => [n, i]));
  Object.assign(NAME_TO_PC, { Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10 });
  const OPEN_PC = { 6: 4, 5: 9, 4: 2, 3: 7, 2: 11, 1: 4 };          // E A D G B E
  const OPEN_MIDI = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };   // E2 A2 D3 G3 B3 E4
  const DEGREE = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };

  // ChallengeRules — same shape as the app; windows relaxed because typing a note name takes longer than plucking it.
  const RULES = { countInBeats: 4, perfectMs: 90, greatMs: 160, goodMs: 240, perfectPoints: 100, greatPoints: 80, goodPoints: 50, maxScore: 100000, minBpm: 50, maxBpm: 160, defaultBpm: 80, defaultRoutine: 'set', paceMs: 2500,
    // The finisher (config.ultimate === 'combo'): with OVERDRIVE at 100%, play the chromatic run on string 1 — frets 1 2 3 4 (keys 1–4, in order, 2.5 s between presses) — to unleash it.
    ultimateKeys: ['1', '2', '3', '4'], ultimateString: 1, ultimateDamage: 20, ultimateComboMs: 2500 };
  // Boss damage per grade is scaled so an all-GREAT run defeats Synth Drake exactly; PERFECT runs finish early.
  const DAMAGE = { perfect: 1.25, great: 1, good: .6 };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const asc = n => Array.from({ length: n }, (_, i) => i);
  const dirs = (list, dir) => list.map(i => [i, dir]);
  /** Small deterministic PRNG (mulberry32) so a scramble round can be reproduced from its seed. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** Patterns re-order one position. build(n, random) → [patternIndex, direction] pairs; direction drives the HUD only. */
  const PATTERNS = {
    'updown': { name: 'Up & Down', short: 'UP&DOWN', hint: 'Ascend the position, repeat the peak, descend home', build(n) { if (n <= 1) return dirs(asc(n), 'up'); const up = asc(n); return [...dirs(up, 'up'), [n - 1, 'peak'], ...dirs(up.slice(0, -1).reverse(), 'down')]; } },
    'downup': { name: 'Down & Up', short: 'DOWN&UP', hint: 'Start at the top, touch the root, climb back up', build(n) { if (n <= 1) return dirs(asc(n), 'down'); return [...dirs(asc(n).reverse(), 'down'), [0, 'peak'], ...dirs(asc(n).slice(1), 'up')]; } },
    'thirds-up': { name: 'Thirds ↑', short: 'THIRDS↑', hint: 'Skip a note and come back: 1-3, 2-4, 3-5…', build(n) { if (n < 3) return dirs(asc(n), 'up'); const out = []; for (let i = 0; i + 2 < n; i++) out.push([i, 'up'], [i + 2, 'up']); return out; } },
    'thirds-down': { name: 'Thirds ↓', short: 'THIRDS↓', hint: 'Thirds from the top down', build(n) { if (n < 3) return dirs(asc(n).reverse(), 'down'); const out = []; for (let i = n - 1; i - 2 >= 0; i--) out.push([i, 'down'], [i - 2, 'down']); return out; } },
    'triplets-up': { name: 'Triplets ↑', short: 'TRIPLETS↑', hint: 'Three steps up, then start one note higher', build(n) { if (n < 3) return dirs(asc(n), 'up'); const out = []; for (let i = 0; i + 2 < n; i++) out.push([i, 'up'], [i + 1, 'up'], [i + 2, 'up']); return out; } },
    'scramble': { name: 'Scramble', short: 'SCRAMBLE', hint: 'Drake shuffles the position — find every note twice', build(n, random = Math.random) {
      if (n <= 1) return dirs(asc(n), 'mix');
      const out = []; let prev = -1;
      for (let pass = 0; pass < 2; pass++) {
        const list = asc(n);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
        if (list[0] === prev) [list[0], list[n - 1]] = [list[n - 1], list[0]];
        for (const i of list) out.push([i, 'mix']);
        prev = list[n - 1];
      }
      return out;
    } },
  };
  /** Routines: [pattern, tempo lift in BPM] per round. One scale, several patterns, several tempos. */
  const ROUTINES = {
    single: { title: 'Single pattern', tag: '1 round', rounds: [['updown', 0]] },
    set: { title: 'Flow set', tag: '3 rounds · ≈1 min', rounds: [['updown', 0], ['thirds-up', 10], ['downup', 20]] },
    marathon: { title: 'Marathon', tag: '5 rounds · ≈2 min', rounds: [['updown', 0], ['thirds-up', 0], ['downup', 10], ['scramble', 20], ['updown', 30]] },
  };

  /** _applyRootOffsets: shift a relative pattern to absolute frets for a root, avoiding open-string territory. */
  function resolvePositions(type, position, rootPc) {
    const raw = DATA[position]?.[type];
    if (!raw) return null;
    const openPc = position === 'r5' ? 9 : 4;
    let rootFret = (rootPc - openPc + 12) % 12;
    if (rootFret < 3) rootFret += 12;
    return raw.map(([s, o]) => [s, rootFret + o]).filter(([, f]) => f >= 0);
  }
  /** _applyOctaveFilter: lower = first half to the octave root, higher = second half, full = everything. */
  function octaveFilter(positions, octave) {
    if (octave === 'full' || positions.length < 3) return positions;
    const k = (positions.length - 1) >> 1;
    return octave === 'lower' ? positions.slice(0, k + 1) : positions.slice(k);
  }
  function buildRun({ root = 'C', type = 'major', position = 'r5', octave = 'full', routine = RULES.defaultRoutine, bpm = RULES.defaultBpm, seed = 1 }) {
    const rootPc = NAME_TO_PC[root];
    const positions = octaveFilter(resolvePositions(type, position, rootPc) || [], octave);
    const pattern = positions.map(([string, fret]) => {
      const pc = (OPEN_PC[string] + fret) % 12, semis = (pc - rootPc + 12) % 12;
      return { string, fret, pc, label: NOTE_NAMES[pc], degree: DEGREE[semis], isRoot: semis === 0, midi: OPEN_MIDI[string] + fret };
    });
    const plan = ROUTINES[routine] || ROUTINES[RULES.defaultRoutine], random = rng(seed);
    const rounds = [], steps = [];
    plan.rounds.forEach(([key, lift], index) => {
      const p = PATTERNS[key], order = p.build(pattern.length, random);
      const round = { index, key, name: p.name, short: p.short, hint: p.hint, bpm: clamp(bpm + lift, RULES.minBpm, RULES.maxBpm), start: steps.length, length: order.length };
      order.forEach(([i, dir], roundStep) => steps.push({ ...pattern[i], patternIndex: i, order: steps.length, round: index, roundStep, dir }));
      rounds.push(round);
    });
    const frets = pattern.map(p => p.fret);
    return { pattern, steps, rounds, routine: plan, minFret: Math.min(...frets), maxFret: Math.max(...frets), rootPc };
  }
  /** Typed text for a note: 'c', 'f#'. The right arrow is the sharp key ('s' and '#' still work so no Shift is needed). */
  const typedFor = label => label.toLowerCase();
  const FLAT = '♭';
  /** Enharmonic flat spelling of a sharp note, typed as the letter above plus the left arrow: G# → 'a♭'. Naturals have none. */
  const flatFor = label => label.endsWith('#') ? NOTE_NAMES[(NAME_TO_PC[label] + 1) % 12].toLowerCase() + FLAT : '';
  /** Both accepted spellings of a note label: ['g#', 'a♭'] or ['c']. */
  const spellingsFor = label => [typedFor(label), flatFor(label)].filter(Boolean);
  const normalizeKey = key => key === 's' || key === 'ArrowRight' ? '#' : key === 'ArrowLeft' ? FLAT : key.toLowerCase();

  class Session {
    constructor(options = {}) {
      this.config = { root: 'C', type: 'major', position: 'r5', octave: 'full', bpm: RULES.defaultBpm, mode: 'battle', routine: RULES.defaultRoutine, seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, ...options };
      this.config.bpm = clamp(this.config.bpm, RULES.minBpm, RULES.maxBpm);
      if (!ROUTINES[this.config.routine]) this.config.routine = RULES.defaultRoutine;
      this.run = buildRun(this.config);
      this.steps = this.run.steps; this.rounds = this.run.rounds;
      this.mode = 'battle';                     // scene.js reads battle-style fields for both modes
      this.timed = this.config.mode === 'battle';
      this.status = 'ready'; this.started = false; this.elapsed = 0; this.clock = 0; this.reason = null;
      this.cursor = 0; this.buffer = ''; this.noteHadError = false;
      this.judgements = []; this.points = 0; this.streak = 0; this.bestStreak = 0; this.combo = 0; this.bestCombo = 0;
      this.totalKeys = 0; this.correctKeys = 0; this.wrongAttempts = 0; this.mistakes = {};
      this.hp = 5; this.maxHp = 5; this.bossHp = 100; this.phase = 1; this.charge = 0; this.ultimates = 0;
      // 'auto': a full OVERDRIVE fires on the next note. 'combo': it waits until the player plays the 1 2 3 4 finisher.
      this.ultimateMode = this.config.ultimate === 'combo' ? 'combo' : 'auto'; this.comboStep = 0; this.comboAt = 0;
      this.beat = 'charge'; this.beatLeft = 0; this.beatDuration = 1; this.ammo = []; this.reaction = null; this.critical = false;
      this.wordLeft = 1; this.wordDuration = 1; this.readGrace = 0; this.round = 1; this.events = [];
      this.beatPtr = 0; this.retaliateUntil = 0; this.roundMisses = 0; this.heals = 0;
      this.paceMs = this.timed ? 0 : RULES.paceMs; this.noteArmedAt = 0; this.noteLate = false;   // free flow: a visible pace per note, costs the streak only
      this.dealt = 0;
      this.schedule();
      this.arm();
    }
    /** Every round has its own tempo: a 4-beat count-in, then one note per beat. The next round's count-in starts one beat after the last note. */
    schedule() {
      this.dueAt = new Array(this.steps.length); this.beats = [];
      let t = 0;
      for (const r of this.rounds) {
        const beat = 60000 / r.bpm; r.startMs = t;
        for (let b = 0; b < RULES.countInBeats + r.length; b++) this.beats.push({ at: t + b * beat, round: r.index, beat: b, countIn: b < RULES.countInBeats, roundStep: b - RULES.countInBeats, noteIndex: r.start + b - RULES.countInBeats });
        for (let i = 0; i < r.length; i++) this.dueAt[r.start + i] = t + (RULES.countInBeats + i) * beat;
        r.endMs = r.length ? this.dueAt[r.start + r.length - 1] + RULES.goodMs : t;
        t = r.length ? this.dueAt[r.start + r.length - 1] + beat : t + RULES.countInBeats * beat;
      }
      this.totalMs = t;
    }
    get roundIndex() { return this.current ? this.current.round : Math.max(0, this.rounds.length - 1); }
    get roundInfo() { return this.rounds[this.roundIndex]; }
    get currentBpm() { return this.roundInfo?.bpm ?? this.config.bpm; }
    get beatMs() { return 60000 / this.currentBpm; }
    dueMs(index) { return this.dueAt[index] ?? 0; }
    get endMs() { return this.steps.length ? this.dueMs(this.steps.length - 1) + RULES.goodMs : 0; }
    get timeLeftMs() { return this.timed ? Math.max(0, this.endMs - this.clock) : null; }
    get roundTimeLeftMs() { return this.timed && this.roundInfo ? Math.max(0, this.roundInfo.endMs - this.clock) : null; }
    get isComplete() { return this.cursor >= this.steps.length; }
    get current() { return this.isComplete ? null : this.steps[this.cursor]; }
    /** Every spelling the current note accepts: the sharp name first, then its flat name (G# → 'g#', 'a♭'). */
    get spellings() { return this.current ? spellingsFor(this.current.label) : []; }
    /** The spelling being typed: the flat one once its letter is in the buffer, otherwise the sharp name. */
    get target() { const [sharp, flat] = this.spellings; return !sharp ? '' : flat && this.buffer && this.buffer[0] === flat[0] ? flat : sharp; }
    get stage() { return this.phase === 2 ? 3 : this.cursor > (this.steps.length >> 1) ? 2 : 1; }
    /** Counting in = waiting for the first note of a round (every round has its own count-in at its own tempo). */
    get countingIn() { return this.timed && !!this.current && this.current.roundStep === 0 && this.clock < this.dueMs(this.cursor) - RULES.goodMs; }
    /** In a timed flow the note's window opens goodMs before its beat; keys before that are ignored (no typing ahead). */
    get windowOpen() { return !this.timed || (!this.isComplete && this.clock >= this.dueMs(this.cursor) - RULES.goodMs); }
    /** Drake's counter is visual only: the next note's window must never be swallowed by the lockout. */
    get acceptingInput() { return this.status === 'playing' && !this.isComplete && this.windowOpen; }
    get damagePerNote() { return 100 / this.steps.length; }
    /** Combo mode only: OVERDRIVE is full and the 1 2 3 4 finisher can be played. */
    get ultimateReady() { return this.ultimateMode === 'combo' && this.charge >= 100; }
    get comboKeys() { return RULES.ultimateKeys; }
    emit(type, data = {}) { this.events.push({ type, ...data }); }
    drain() { return this.events.splice(0); }
    arm() {
      const note = this.current; this.buffer = ''; this.noteHadError = false; this.noteArmedAt = this.clock; this.noteLate = false;
      this.critical = !!note?.isRoot && this.timed;
      if (!this.timed) { this.wordDuration = this.paceMs / 1000; this.wordLeft = this.wordDuration; }
      if (!note) return;
      if (note.roundStep === 0 && note.round > 0) {
        const clean = this.roundMisses === 0; let healed = false;
        if (clean && this.timed && this.hp < this.maxHp) { this.hp++; this.heals++; healed = true; this.emit('heal', { hp: this.hp }); }
        this.roundMisses = 0; this.round = note.round + 1;
        this.emit('round', { index: note.round, round: this.rounds[note.round], cleared: this.rounds[note.round - 1], clean, healed });
      }
      this.emit('note', { index: this.cursor, critical: this.critical }); if (this.critical) this.emit('bossWindup', { attack: 'breath', critical: true });
    }
    start() { if (this.status === 'ready') { this.status = 'playing'; this.started = true; this.emit('start'); } }
    pause() { if (this.status === 'playing') { this.status = 'paused'; this.emit('pause'); } }
    resume() { if (this.status === 'paused') { this.status = 'playing'; this.emit('resume'); } }
    finish(reason = 'finished') {
      if (!['playing', 'paused'].includes(this.status)) return;
      this.status = 'finished'; this.reason = reason; this.beat = 'recover'; this.emit('finish', { reason });
    }
    mistake(expected) {
      this.combo = 0; this.noteHadError = true; this.wrongAttempts++;
      const key = expected || 'extra'; this.mistakes[key] = (this.mistakes[key] || 0) + 1; this.emit('mistake');
    }
    input(key) {
      if (!this.acceptingInput) return false;
      if (key === 'Backspace') { this.buffer = this.buffer.slice(0, -1); this.emit('edit'); return true; }
      if (key === ' ' || key === 'Enter') return true;
      const k = normalizeKey(key);
      if (!/^[a-g#♭]$/.test(k)) return false;
      this.totalKeys++;
      // The first letter picks the spelling (G or A for G#); after that the buffer follows that spelling.
      const i = this.buffer.length, target = i ? this.target : this.spellings.find(t => t[0] === k) || this.target;
      if (i >= target.length + 2) { this.mistake(''); return true; }
      const correct = k === target[i] && target.startsWith(this.buffer);
      this.buffer += k;
      if (correct) { this.correctKeys++; this.emit('key', { key: k }); if (this.buffer === target) this.completeNote(); }
      else this.mistake(target[i]);
      return true;
    }
    /** Rail-runner input (Neon Relay × Scale Flow): strum the current note from a string. The wrong string is a wrong note — no retyping. */
    strum(string) {
      if (!this.acceptingInput) return false;
      this.totalKeys++;
      if (string === this.current.string) { this.correctKeys++; this.buffer = this.target; this.completeNote(); }
      else this.miss('wrong');
      return true;
    }
    grade(offset) {
      const d = Math.abs(offset);
      if (d <= RULES.perfectMs) return ['perfect', RULES.perfectPoints];
      if (d <= RULES.greatMs) return ['great', RULES.greatPoints];
      return ['good', RULES.goodPoints];
    }
    completeNote() {
      const note = this.current, perfectTyping = !this.noteHadError;
      let g = 'perfect', points = RULES.perfectPoints, offset = null;
      if (this.timed) { offset = this.clock - this.dueMs(this.cursor); [g, points] = this.grade(offset); }
      else if (!perfectTyping || this.noteLate) { g = 'good'; points = RULES.goodPoints; }
      this.record({ index: this.cursor, grade: g, offsetMs: offset, points, wrongNote: false });
      this.combo = perfectTyping ? this.combo + 1 : 0; this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.charge = Math.min(100, this.charge + (g === 'perfect' ? 12 : g === 'great' ? 8 : 4));
      let kind = 'shot', damage = this.damagePerNote * DAMAGE[g];
      if (this.charge >= 100 && this.ultimateMode === 'auto') { kind = 'ultimate'; damage += 10; this.charge = 0; this.ultimates++; }
      else if (this.streak > 0 && this.streak % 4 === 0) { kind = 'charged'; damage += 2; }
      else if (note.isRoot) kind = 'slash';
      this.emit('hit', { grade: g, offsetMs: offset, note, index: this.cursor });
      this.strike({ kind, damage, note, grade: g });
      this.advanceCursor();
    }
    /** The finisher key (1–4). On a guitar controller that is string 1, frets 1 2 3 4: a chromatic run. Ignored outside combo mode; locked until OVERDRIVE is 100%. */
    ultimateKey(key) {
      if (this.ultimateMode !== 'combo' || this.status !== 'playing') return false;
      const keys = RULES.ultimateKeys, k = String(key); if (!keys.includes(k)) return false;
      if (!this.ultimateReady) { this.comboStep = 0; this.emit('ultimateLocked', { key: k, charge: this.charge }); return true; }
      if (k === keys[this.comboStep]) {
        this.comboStep++; this.comboAt = this.clock; this.emit('ultimateStep', { step: this.comboStep, key: k, fret: Number(k), string: RULES.ultimateString });
        if (this.comboStep === keys.length) this.unleash();
      } else { this.comboStep = k === keys[0] ? 1 : 0; this.comboAt = this.clock; this.emit('ultimateBreak', { key: k, step: this.comboStep }); }
      return true;
    }
    /** RGB Overdrive: the finisher lands on Synth Drake and empties the meter. */
    unleash() {
      this.comboStep = 0; this.charge = 0; this.ultimates++;
      const note = this.current || this.steps[this.steps.length - 1];
      this.emit('ultimate', { damage: RULES.ultimateDamage });
      this.strike({ kind: 'ultimate', damage: RULES.ultimateDamage, note, grade: 'perfect' });
    }
    /** The flow always plays every round to the end; Synth Drake going down early is a stagger, not a stop. */
    strike(attack) {
      if (this.status !== 'playing') return;
      const wasUp = this.bossHp > 0;
      this.bossHp = Math.max(0, this.bossHp - attack.damage); this.dealt += attack.damage;
      this.emit('attack', { kind: attack.kind, damage: attack.damage, word: attack.note.label, perfect: attack.grade === 'perfect' });
      if (wasUp && this.bossHp <= 0) { this.bossDown = true; this.emit('bossDown'); }
      if (this.phase === 1 && this.bossHp <= 50) { this.phase = 2; this.emit('phase'); }
    }
    miss(reason) {
      const note = this.current, critical = this.critical, damage = critical ? 2 : 1;
      this.record({ index: this.cursor, grade: 'miss', offsetMs: null, points: 0, wrongNote: reason === 'wrong' });
      this.combo = 0; this.roundMisses++;
      if (this.timed) {
        this.hp = Math.max(0, this.hp - damage);
        this.emit('bossAttack', { kind: critical ? 'ultimate' : ['breath', 'claw', 'quake'][this.judgements.length % 3], damage, reason, word: note.label });
        this.beat = 'retaliate'; this.retaliateUntil = this.clock + (critical ? 900 : 600);
        if (!this.hp) { this.finish('defeat'); return; }
      }
      this.advanceCursor();
    }
    record(j) {
      this.judgements.push(j);
      if (j.grade !== 'miss') { this.points += j.points; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); }
      else this.streak = 0;
    }
    advanceCursor() {
      this.cursor++; this.buffer = ''; this.noteHadError = false;
      if (this.isComplete) { if (this.status === 'playing') this.finish(this.bossHp > 0 ? 'survived' : 'victory'); return; }
      this.arm();
    }
    /** Advance the session clock. Closes expired windows (MISS) and emits beat ticks for the metronome. */
    tick(dtSeconds) {
      if (this.status !== 'playing' || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
      const dt = dtSeconds * 1000; this.elapsed += dtSeconds;
      this.clock += dt;
      if (this.comboStep && this.clock - this.comboAt > RULES.ultimateComboMs) { this.comboStep = 0; this.emit('ultimateBreak', { step: 0, timeout: true }); }
      if (!this.timed) {
        this.beat = 'charge';
        if (this.current) {
          this.wordDuration = this.paceMs / 1000; this.wordLeft = clamp((this.noteArmedAt + this.paceMs - this.clock) / 1000, 0, this.wordDuration);
          if (!this.noteLate && this.wordLeft <= 0) { this.noteLate = true; this.streak = 0; this.combo = 0; this.emit('late', { word: this.current.label }); }
        }
        return;
      }
      while (this.beatPtr < this.beats.length && this.beats[this.beatPtr].at <= this.clock) { const b = this.beats[this.beatPtr++]; this.emit('tick', { beat: b.beat, round: b.round, countIn: b.countIn, roundStep: b.roundStep, noteIndex: b.noteIndex }); }
      if (this.beat === 'retaliate' && this.clock >= this.retaliateUntil) this.beat = 'charge';
      while (!this.isComplete && this.clock > this.dueMs(this.cursor) + RULES.goodMs && this.status === 'playing') this.miss('timeout');
      if (this.current) {
        const due = this.dueMs(this.cursor);
        this.wordDuration = RULES.goodMs * 2 / 1000; this.wordLeft = clamp((due + RULES.goodMs - this.clock) / 1000, 0, this.wordDuration);
        this.beatDuration = this.beatMs / 1000; this.beatLeft = clamp((due - this.clock) / 1000, 0, this.beatDuration);
      }
    }
    get score() { return this.steps.length ? Math.round(RULES.maxScore * this.points / (this.steps.length * RULES.perfectPoints)) : 0; }
    stats() {
      const count = g => this.judgements.filter(j => j.grade === g).length;
      const timing = list => { const offsets = list.filter(j => j.grade !== 'miss' && j.offsetMs != null).map(j => Math.abs(j.offsetMs)); return offsets.length ? Math.round(clamp(100 * (1 - offsets.reduce((s, o) => s + o, 0) / offsets.length / RULES.goodMs), 0, 100)) : null; };
      const offsets = this.judgements.filter(j => j.grade !== 'miss' && j.offsetMs != null).map(j => j.offsetMs);
      const avgAbs = offsets.length ? offsets.reduce((s, o) => s + Math.abs(o), 0) / offsets.length : null;
      const mean = offsets.length ? offsets.reduce((s, o) => s + o, 0) / offsets.length : null;
      return {
        score: this.score, total: this.steps.length, done: this.judgements.length, hits: this.judgements.filter(j => j.grade !== 'miss').length,
        perfect: count('perfect'), great: count('great'), good: count('good'), miss: count('miss'),
        accuracy: this.totalKeys ? Math.round(this.correctKeys / this.totalKeys * 100) : 100,
        timingPct: timing(this.judgements),
        avgAbsOffsetMs: avgAbs, meanOffsetMs: mean, streak: this.streak, bestStreak: this.bestStreak, bestCombo: this.bestCombo,
        wrongAttempts: this.wrongAttempts, mistakes: Object.entries(this.mistakes).sort((a, b) => b[1] - a[1]).slice(0, 5),
        elapsed: this.elapsed, ultimates: this.ultimates, heals: this.heals, bpm: this.config.bpm, routine: this.config.routine, durationMs: this.totalMs,
        rounds: this.rounds.map(r => { const js = this.judgements.slice(r.start, r.start + r.length), hits = js.filter(j => j.grade !== 'miss').length; return { index: r.index, key: r.key, name: r.name, short: r.short, bpm: r.bpm, total: r.length, done: js.length, hits, miss: js.length - hits, timingPct: timing(js) }; }),
        fullCombo: this.judgements.length === this.steps.length && count('miss') === 0,
      };
    }
  }
  // ProgressRules echo: base XP × BPM difficulty × routine length, bonuses for first clear / PB / full combo.
  function xpFor(stats, { practice, firstClear, personalBest }) {
    const difficulty = clamp(stats.bpm / RULES.defaultBpm, .6, 2), length = Math.sqrt(Math.max(1, stats.rounds?.length || 1));
    let xp = Math.round((practice ? 30 : 50) * difficulty * length * (stats.hits / Math.max(1, stats.total)));
    if (firstClear) xp += 30; if (personalBest) xp += 20; if (stats.fullCombo) xp += 25;
    return xp;
  }
  return { Session, buildRun, RULES, PATTERNS, ROUTINES, NOTE_NAMES, NAME_TO_PC, DATA, typedFor, flatFor, spellingsFor, FLAT, xpFor, clamp };
});
