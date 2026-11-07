/* Key Battle × Scale Flow demo — browser adapter: keyboard → flow session → Key Battle scene + fretboard. Entirely local. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const { Session, RULES, ROUTINES, NOTE_NAMES, DATA, xpFor } = window.ScaleFlow;
  const scene = new window.KeyBattleScene($('#scene'));
  const neck = $('#neck'), nctx = neck.getContext('2d');
  const input = $('#typing-input'), menu = $('#session-menu');
  const config = { mode: 'battle', root: 'C', type: 'major', position: 'r5', octave: 'full', routine: RULES.defaultRoutine, bpm: RULES.defaultBpm };
  let session = new Session(config), loaded = false, sound = true, led = true, audio, pageActive = true;
  let last = performance.now(), lastHud = 0, messageUntil = 0, calloutUntil = 0, finishAt = 0, pausedAt = 0;
  let resultShown = false, lastTarget = '', records = {}, flashes = [];
  try { const data = JSON.parse(localStorage.getItem('punkman-scale-flow-records') || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) records = data; } catch {}
  const title = () => `${config.root} ${DATA.titles[config.type]}`;
  const positionLabel = () => config.position === 'r5' ? 'R 5th string' : 'R 6th string';
  const octaveLabel = () => config.octave === 'full' ? 'Full' : config.octave === 'lower' ? 'Oct 1' : 'Oct 2';
  const recordKey = () => [config.mode, config.root, config.type, config.position, config.octave, config.routine, config.mode === 'battle' ? config.bpm : 0, led ? 'led' : 'noled'].join('|');
  const midiHz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const routineLabel = () => ROUTINES[config.routine].title;
  const mmss = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const tempoRange = () => { const list = session.rounds.map(r => r.bpm), lo = Math.min(...list), hi = Math.max(...list); return lo === hi ? `${lo} BPM` : `${lo}→${hi} BPM`; };
  let healedFlag = false;

  function tone(frequency = 440, length = .07, volume = .025, end = frequency, type = 'triangle') {
    if (!pageActive || !sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), gain = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(frequency, audio.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(end, 40), audio.currentTime + length);
      gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + length);
      o.connect(gain); gain.connect(audio.destination); o.start(); o.stop(audio.currentTime + length);
    } catch {}
  }
  const click = accent => tone(accent ? 1500 : 1000, .035, accent ? .05 : .03, accent ? 900 : 700, 'square');
  let guide = true, auto = false, autoAt = 0;
  /** The note itself: a short plucked tone at the position's real pitch (string + fret → MIDI). */
  function pluck(midi, volume = .035, length = .35) {
    if (!pageActive || !sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const hz = midiHz(midi), t = audio.currentTime, gain = audio.createGain();
      gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.001, t + length); gain.connect(audio.destination);
      for (const [type, mult, level] of [['triangle', 1, 1], ['sawtooth', 1, .22], ['sine', 2, .16]]) { const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(hz * mult, t); g.gain.setValueAtTime(level, t); o.connect(g); g.connect(gain); o.start(t); o.stop(t + length); }
    } catch {}
  }
  function hint(text, error = false, duration = 2200) { $('#typing-hint').textContent = text; $('#typing-hint').classList.toggle('error-hint', error); messageUntil = performance.now() + duration; }
  function callout(text, color = '#79eddf', duration = 1000) { const el = $('#battle-callout'); el.textContent = text; el.style.color = color; el.classList.add('visible'); calloutUntil = performance.now() + duration; }
  function clearCallout() { $('#battle-callout').classList.remove('visible'); $('#battle-callout').textContent = ''; }

  function bestDisplay() {
    const best = records[recordKey()];
    $('#best').innerHTML = best ? `${best.score.toLocaleString()} <small>PTS</small>` : '—';
    $('#best-detail').textContent = best ? `${best.timing == null ? 'untimed' : best.timing + '% timing'} · ${title()} · ${positionLabel()} · ${octaveLabel()} · ${routineLabel()}${config.mode === 'battle' ? ' · ' + config.bpm + ' BPM' : ''}` : 'Set your first personal best for this scale';
  }
  function summaryText() { return `${config.mode === 'battle' ? 'Flow battle' : 'Practice · notes wait'} · ${title()} · ${positionLabel()} · ${octaveLabel()} · ${routineLabel()}${config.mode === 'battle' ? ' · ' + config.bpm + ' BPM' : ''}`; }

  // ---------- Fretboard (the Scale Flow neck, LED style) ----------
  function drawNeck() {
    const run = session.run, W = neck.width, H = neck.height, c = nctx;
    c.clearRect(0, 0, W, H);
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a1024'); bg.addColorStop(1, '#0f0a16'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const lo = Math.max(0, Math.min(run.minFret, run.minFret - 1)), hi = Math.max(run.maxFret + 1, lo + 5);
    const fretCount = hi - lo + 1, padL = 52, padR = 24, padT = 22, padB = 34;
    const fretW = (W - padL - padR) / fretCount, stringGap = (H - padT - padB) / 5;
    const xFor = fret => padL + (fret - lo + .5) * fretW, yFor = string => padT + (6 - string) * stringGap;
    // Wood + frets
    c.fillStyle = '#231631'; c.fillRect(padL, padT - 10, W - padL - padR, H - padT - padB + 20);
    for (let f = lo; f <= hi + 1; f++) { const x = padL + (f - lo) * fretW; c.fillStyle = f === 0 ? '#e9dcff' : '#5b4670'; c.fillRect(Math.round(x) - (f === 0 ? 3 : 1), padT - 10, f === 0 ? 5 : 2, H - padT - padB + 20); }
    for (const f of [3, 5, 7, 9, 12, 15, 17, 19, 21]) if (f >= lo && f <= hi) { c.fillStyle = '#3b2b4d'; const x = xFor(f); if (f === 12) { c.beginPath(); c.arc(x, yFor(4.5), 5, 0, 7); c.arc(x, yFor(2.5), 5, 0, 7); c.fill(); } else { c.beginPath(); c.arc(x, yFor(3.5), 5, 0, 7); c.fill(); } }
    for (let s = 6; s >= 1; s--) { const y = yFor(s); c.fillStyle = s >= 4 ? '#b9a9c9' : '#d9cfe6'; c.fillRect(padL - 6, Math.round(y) - (s >= 5 ? 1 : 0), W - padL - padR + 6, s >= 5 ? 3 : s >= 3 ? 2 : 1); }
    c.font = '11px Consolas,monospace'; c.fillStyle = '#9c8bb0'; c.textAlign = 'center';
    for (let f = lo; f <= hi; f++) c.fillText(String(f), xFor(f), H - 12);
    c.textAlign = 'right'; for (let s = 6; s >= 1; s--) c.fillText(['E', 'A', 'D', 'G', 'B', 'e'][6 - s], padL - 14, yFor(s) + 4);
    // Positions
    const now = performance.now() / 1000, cur = session.current, nxt = session.steps[session.cursor + 1];
    const doneIdx = new Set(session.steps.slice(0, session.cursor).map(st => st.patternIndex));
    for (const p of run.pattern) {
      const x = xFor(p.fret), y = yFor(p.string), isCur = cur && cur.patternIndex === p.patternIndex, isNext = nxt && nxt.patternIndex === p.patternIndex;
      const base = p.isRoot ? '#ff5a86' : '#4fc3ff';
      if (!led && !isCur && !isNext && !doneIdx.has(p.patternIndex)) continue;
      const alpha = isCur ? 1 : led ? .85 : doneIdx.has(p.patternIndex) ? .35 : .6;
      const r = isCur ? 14 + (scene.motion ? Math.sin(now * 8) * 1.5 : 0) : 10;
      if (isCur || led) { const g = c.createRadialGradient(x, y, 2, x, y, r * (isCur ? 2.6 : 1.8)); g.addColorStop(0, base + (isCur ? 'aa' : '55')); g.addColorStop(1, base + '00'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * (isCur ? 2.6 : 1.8), 0, 7); c.fill(); }
      c.globalAlpha = alpha; c.fillStyle = isCur ? '#ffffff' : base; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      if (isCur) { c.fillStyle = base; c.beginPath(); c.arc(x, y, r - 3, 0, 7); c.fill(); }
      if (isNext && !isCur) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 4, 0, 7); c.stroke(); }
      c.fillStyle = isCur ? '#fff' : '#120c1a'; c.font = (isCur ? 'bold 13px' : 'bold 11px') + ' Consolas,monospace'; c.textAlign = 'center'; c.fillText(p.label, x, y + 4);
      c.globalAlpha = 1;
    }
    // Countdown ring: the current note's remaining time (to its beat, or its free-flow pace) drains clockwise and turns red.
    if (cur && session.status === 'playing' && session.started) {
      const frac = Math.max(0, Math.min(1, session.timed ? Math.max(0, session.dueMs(session.cursor) - session.clock) / session.beatMs : session.wordDuration ? session.wordLeft / session.wordDuration : 1));
      const x = xFor(cur.fret), y = yFor(cur.string);
      c.strokeStyle = '#ffffff22'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 21, 0, 7); c.stroke();
      c.strokeStyle = frac > .5 ? '#d5ff62' : frac > .25 ? '#ffd18a' : '#ff5a86'; c.beginPath(); c.arc(x, y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
    }
    // Hit flashes (grade colour ring on the note just played)
    flashes = flashes.filter(f => now - f.t < .5);
    for (const f of flashes) { const t = (now - f.t) / .5, x = xFor(f.fret), y = yFor(f.string); c.globalAlpha = 1 - t; c.strokeStyle = f.color; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 14 + t * 26, 0, 7); c.stroke(); c.globalAlpha = 1; }
    // Flow direction + beat pulse edge
    c.textAlign = 'left'; c.font = '10px Consolas,monospace'; c.fillStyle = '#8d7aa0';
    c.fillText(`${title().toUpperCase()} · ${positionLabel().toUpperCase()} · ${octaveLabel().toUpperCase()}`, padL, 13);
    if (session.timed && session.status === 'playing' && session.started) { const phase = (session.clock % session.beatMs) / session.beatMs; c.fillStyle = `rgba(213,255,98,${(1 - phase) * .5})`; c.fillRect(0, 0, W, 3); }
  }

  // ---------- Events ----------
  function processEvents() {
    let refresh = false;
    for (const e of session.drain()) {
      scene.event(e);
      if (['note', 'start', 'finish', 'bossDown', 'round', 'heal'].includes(e.type)) refresh = true;
      if (e.type === 'tick') { if (e.countIn) { click(e.beat === 0); callout(String(RULES.countInBeats - e.beat), '#d5ff62', 450); } else { const step = session.steps[e.noteIndex]; if (guide && step) pluck(step.midi, .022, .3); if (!guide || e.roundStep % 4 === 0) click(e.roundStep % 4 === 0); } }
      if (e.type === 'key') tone(300 + session.buffer.length * 60, .03, .008);
      if (e.type === 'note' && !session.timed && session.started && guide && session.current) pluck(session.current.midi, .022, .3);
      if (e.type === 'late') { tone(160, .12, .02, 120); hint(`Too slow on ${e.word} · streak reset · keep the pace`, true, 1500); }
      if (e.type === 'mistake') { tone(125, .07, .025, 80); hint(session.timed ? 'Wrong key · Backspace and retype before the window closes' : 'Wrong key · Backspace, then type the note again', true); }
      if (e.type === 'hit') {
        const colors = { perfect: '#d5ff62', great: '#79eddf', good: '#ffd18a' };
        const early = e.offsetMs != null && Math.abs(e.offsetMs) > RULES.perfectMs ? (e.offsetMs < 0 ? ' · EARLY' : ' · LATE') : '';
        callout(e.grade.toUpperCase() + (e.grade === 'perfect' ? '' : early), colors[e.grade], 520);
        pluck(e.note.midi, .05, .45);
        flashes.push({ t: performance.now() / 1000, string: e.note.string, fret: e.note.fret, color: colors[e.grade] });
        messageUntil = 0;
      }
      if (e.type === 'attack') { if (e.kind === 'ultimate') { tone(220, .6, .07, 1100); if (!scene.motion) callout('RGB OVERDRIVE', '#ffc0e4', 1300); } else if (e.kind === 'charged') tone(350, .2, .04, 950); }
      if (e.type === 'bossDown') { callout('DRAKE DOWN · FINISH THE FLOW', '#a2ffe4', 1500); tone(440, .5, .04, 880); }
      if (e.type === 'phase') { if (!scene.motion) callout('PHASE II', '#ff82c5', 1500); hint('Phase 2 · Keep the flow steady, Synth Drake is faltering', false, 2500); tone(140, .65, .045, 420); }
      if (e.type === 'heal') healedFlag = true;
      if (e.type === 'round') { const r = e.round; callout(`ROUND ${e.index + 1} · ${r.short} · ${r.bpm} BPM${healedFlag ? ' · +1 ♥' : ''}`, healedFlag ? '#a2ffe4' : '#d5ff62', 1500); hint(`Round ${e.index + 1}/${session.rounds.length} · ${r.name} at ${r.bpm} BPM · ${r.hint}${healedFlag ? ' · clean round +1 ♥' : ''}`, false, 3500); tone(healedFlag ? 660 : 520, .25, .04, healedFlag ? 990 : 780); healedFlag = false; }
      if (e.type === 'bossAttack') { callout(e.damage === 2 ? 'ROOT MISSED · DRAKE ULTIMATE −2 ♥' : (e.reason === 'wrong' ? 'WRONG NOTE' : 'MISS') + ' · −1 ♥', '#ff91b5', e.damage === 2 ? 1500 : 1000); hint(`${e.reason === 'wrong' ? 'Wrong note' : 'Missed the beat'}: ${e.word} · −${e.damage} ♥`, true, 2000); tone(130, .3, .035, 50); }
      if (e.type === 'finish') {
        finishAt = performance.now() + (e.reason === 'victory' ? 1350 : e.reason === 'defeat' ? 1500 : 600); input.disabled = true; $('#finish').disabled = true;
        if (e.reason === 'victory') { callout('FLOW CLEAR', '#a2ffe4', 1600); tone(440, .6, .04, 880); }
        else if (e.reason === 'survived') { callout('FLOW COMPLETE · DRAKE STANDS', '#ffd18a', 1600); }
      }
    }
    if (refresh) { controls(); drawWords(); hud(); }
  }

  function drawWords() {
    const stream = $('#word-stream'); stream.replaceChildren();
    const current = document.createElement('span'); current.className = 'current-word' + (session.current?.isRoot ? ' is-root' : '');
    const target = session.target;
    for (let i = 0; i < Math.max(target.length, session.buffer.length); i++) {
      const ch = document.createElement('span'); ch.textContent = target[i] || session.buffer[i];
      if (i < session.buffer.length) ch.className = session.buffer[i] === target[i] ? 'letter-correct' : 'letter-wrong';
      else if (i === session.buffer.length) ch.className = 'letter-cursor';
      current.append(ch);
    }
    if (session.current) { const deg = document.createElement('small'); deg.textContent = `deg ${session.current.degree} · str ${session.current.string} fr ${session.current.fret}`; current.append(deg); }
    if (!session.current && session.status === 'finished') current.textContent = session.reason === 'defeat' ? '—' : '♪';
    stream.append(current);
    for (const step of session.steps.slice(session.cursor + 1, session.cursor + 5)) { const span = document.createElement('span'); span.className = 'upcoming' + (step.isRoot ? ' is-root' : ''); span.textContent = step.label.toLowerCase(); stream.append(span); }
    const incorrect = !target.startsWith(session.buffer); $('#typing-panel').classList.toggle('has-error', incorrect); input.setAttribute('aria-invalid', String(incorrect));
    if (target !== lastTarget) { $('#target-accessible').textContent = 'Current note: ' + (session.current?.label || 'none'); lastTarget = target; }
    input.value = session.buffer;
  }
  function buildRoute() {
    const el = $('#encounter-route'); el.replaceChildren();
    const compact = session.rounds.length > 3;
    session.rounds.forEach((r, i) => {
      if (i) { const sep = document.createElement('i'); sep.textContent = '›'; el.append(sep); }
      const span = document.createElement('span'); span.dataset.stage = String(i + 1); span.title = `${r.name} · ${r.bpm} BPM`;
      const b = document.createElement('b'); b.textContent = String(i + 1).padStart(2, '0');
      span.append(b, config.mode === 'battle' && !compact ? `${r.short} · ${r.bpm}` : r.short); el.append(span);
    });
  }
  function controls() {
    const active = ['playing', 'paused'].includes(session.status);
    for (const b of document.querySelectorAll('[data-mode],[data-position],[data-octave],[data-routine]')) b.disabled = active;
    $('#root').disabled = active; $('#scale-type').disabled = active; $('#bpm').disabled = active || config.mode !== 'battle'; $('#settings-note').hidden = !active;
    $('#pause').disabled = session.status === 'finished'; $('#finish').disabled = !active; input.disabled = session.status !== 'playing'; input.readOnly = !session.acceptingInput;
    $('#start-overlay').hidden = session.status !== 'ready';
    $('#pause').innerHTML = active ? 'Pause <kbd>Esc</kbd>' : 'Menu <kbd>Esc</kbd>'; $('#pause').setAttribute('aria-expanded', String(!!menu.open));
    $('#menu-title').textContent = active ? 'Flow paused' : 'Scale setup';
    $('#menu-description').textContent = active ? 'Your position on the neck is waiting right here.' : "Pick a scale exactly like the app's Scale flow tab, then play it one note per beat.";
    $('#menu-start').hidden = active; $('#resume').hidden = !active; $('#finish').hidden = !active;
    document.body.classList.toggle('session-active', active);
    $('#arena-mode').textContent = auto ? 'AUTO RUN' : config.mode === 'battle' ? 'FLOW BATTLE' : 'PRACTICE · NOTES WAIT';
    $('#scale-label').textContent = `${title()} · ${positionLabel()} · ${octaveLabel()}${config.mode === 'battle' ? ' · ' + session.currentBpm + ' BPM' : ' · no tempo'}`.toUpperCase();
    $('#prompt-label').textContent = config.mode === 'battle' ? (session.countingIn ? 'COUNT-IN · GET READY' : 'TYPE THE NOTE NAME ON THE BEAT') : 'TYPE THE NOTES IN ORDER · YOUR OWN PACE';
    $('#clock-label').textContent = config.mode === 'battle' ? 'TIME LEFT' : 'TIME';
  }
  function hud() {
    const s = session.stats();
    $('#score').textContent = s.score.toLocaleString(); $('#timing').innerHTML = s.timingPct == null ? '—<small>%</small>' : `${s.timingPct}<small>%</small>`;
    $('#notes').innerHTML = `${s.done}<small>/${s.total}</small>`;
    $('#clock').textContent = config.mode === 'battle' ? (session.started ? mmss(session.timeLeftMs) : mmss(session.totalMs)) : `${Math.floor(s.elapsed / 60)}:${String(Math.floor(s.elapsed % 60)).padStart(2, '0')}`;
    $('#combo').innerHTML = `${s.streak} <small>STREAK</small>`;
    $('#energy-fill').style.width = session.charge + '%'; $('#energy-label').textContent = Math.round(session.charge) + '%';
    const hp = Math.round(session.bossHp); $('#boss-fill').style.width = hp + '%'; $('#boss-hp').textContent = hp + ' / 100'; $('.boss-track').setAttribute('aria-valuenow', hp);
    $('.arena').classList.toggle('phase-two', session.phase === 2); $('#phase-tag').textContent = 'PHASE 0' + session.phase;
    $('#hearts').innerHTML = Array.from({ length: session.maxHp }, (_, i) => `<span${i >= session.hp ? ' class="heart-empty"' : ''}>♥</span>`).join(' ');
    $('#hearts').setAttribute('aria-label', `Health ${session.hp} of ${session.maxHp}`);
    const r = session.roundInfo, rn = session.roundIndex + 1, done = session.isComplete && session.status === 'finished';
    $('#direction-tag').textContent = session.isComplete ? '■ DONE' : { up: '▲ ASCENDING', down: '▼ DESCENDING', peak: '◆ PEAK', mix: '✦ SCRAMBLE' }[session.current?.dir] || '▲ ASCENDING';
    $('#scene-caption-left').textContent = r ? `${String(rn).padStart(2, '0')} / ${r.name.toUpperCase()}${session.rounds.length > 1 ? ` · ROUND ${rn}/${session.rounds.length}` : ''}${session.phase === 2 ? ' · DRAKE CORE' : ''}` : '—';
    for (const stage of document.querySelectorAll('[data-stage]')) { const n = Number(stage.dataset.stage); stage.classList.toggle('current', !done && n === rn); stage.classList.toggle('cleared', done || n < rn); }
    const danger = session.critical && session.acceptingInput;
    $('#typing-panel').classList.toggle('danger-word', danger); $('#typing-panel').classList.toggle('word-urgent', session.acceptingInput && session.wordLeft < (session.timed ? .12 : .6));
    $('#typing-panel').classList.toggle('input-locked', session.status === 'playing' && !session.acceptingInput); $('#typing-panel').dataset.beat = session.beat;
    if (!session.timed) { $('#word-risk').textContent = session.current ? (session.current.isRoot ? 'Root note (red LED)' : `Degree ${session.current.degree}`) + ` · ${RULES.paceMs / 1000}s pace · late breaks the streak` : 'Flow complete'; $('#word-clock').textContent = session.current ? (session.started ? `${session.wordLeft.toFixed(1)}s` : 'Starts on Start') : '—'; $('#word-time-fill').style.width = Math.round((session.wordDuration ? session.wordLeft / session.wordDuration : 1) * 100) + '%'; }
    else {
      $('#word-risk').textContent = session.countingIn ? `${session.roundInfo.name} · count-in ${RULES.countInBeats} beats · ${session.currentBpm} BPM` : danger ? '! ROOT NOTE · Miss triggers an ultimate −2 ♥' : session.current ? `Degree ${session.current.degree} · Miss −1 ♥` : 'Flow complete';
      const toDue = session.current ? (session.dueMs(session.cursor) - session.clock) / 1000 : 0;
      $('#word-clock').textContent = !session.started ? 'Starts on Start' : session.countingIn ? `${Math.max(0, toDue).toFixed(1)}s to first note` : session.current ? (toDue > 0 ? `in ${toDue.toFixed(2)}s` : `window ${session.wordLeft.toFixed(2)}s`) : '—';
      const beatPhase = session.current ? 1 - Math.max(0, Math.min(1, toDue / (session.beatMs / 1000))) : 1;
      $('#word-time-fill').style.width = Math.round(beatPhase * 100) + '%';
    }
    if (performance.now() > messageUntil && session.acceptingInput) {
      if (!session.target.startsWith(session.buffer)) hint('Wrong key · Backspace, then retype', true, 100);
      else hint(session.timed ? 'Type each note as its beat lands · → = sharp ♯ · ← = flat ♭' : 'Type the note names in order · → = sharp ♯ · ← = flat ♭', false, 100);
    }
  }
  function prepare() {
    session = new Session({ ...config }); scene.reset(); resultShown = false; finishAt = 0; lastTarget = ''; flashes = [];
    $('#results').close(); clearCallout(); calloutUntil = 0;
    const n = session.steps.length, rounds = session.rounds, names = rounds.map(r => r.name).join(' → ');
    $('#lesson-note').textContent = `${rounds.length} round${rounds.length > 1 ? 's' : ''} · ${n} notes · ${names}${config.mode === 'battle' ? ` · ${tempoRange()} · about ${mmss(session.totalMs)}` : ' · no tempo'}`;
    buildRoute();
    $('#session-summary').textContent = summaryText();
    $('#start-description').textContent = config.mode === 'battle' ? `Count-in 4 beats → one note per beat → ${rounds.length > 1 ? `${rounds.length} rounds change the pattern and the tempo (${tempoRange()})` : 'bring Synth Drake down by the last note'}` : 'Type each note name in order · every note is a shot at Synth Drake';
    $('#start-note').textContent = config.mode === 'battle' ? 'Late or wrong −1 ♥ · Root note −2 ♥ · Score 0–100,000' : 'No hearts lost · typos only break your streak';
    $('#typing-hint').textContent = 'Letters a–g · → for a sharp (G# = G →) · ← for a flat (A♭ = A ←) · Backspace to correct'; $('#typing-hint').classList.remove('error-hint');
    input.placeholder = 'Start a session, then type the notes…';
    for (const b of document.querySelectorAll('[data-mode]')) { const on = b.dataset.mode === config.mode; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); }
    for (const b of document.querySelectorAll('[data-position]')) { const on = b.dataset.position === config.position; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); }
    for (const b of document.querySelectorAll('[data-octave]')) { const on = b.dataset.octave === config.octave; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); }
    for (const b of document.querySelectorAll('[data-routine]')) { const on = b.dataset.routine === config.routine; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); }
    $('#root').value = config.root; $('#scale-type').value = config.type; $('#bpm').value = config.bpm; $('#bpm-value').textContent = config.bpm + ' BPM';
    controls(); drawWords(); hud(); bestDisplay(); drawNeck();
  }
  function start() {
    if (!pageActive || !loaded || document.hidden || session.status !== 'ready') return;
    session.start(); last = performance.now(); processEvents(); controls(); drawWords(); closeMenu();
    input.placeholder = 'Type the note shown…'; input.focus({ preventScroll: true });
    hint(auto ? 'Auto run · the page types each note on its beat · watch the effects (not saved)' : config.mode === 'battle' ? `Round 1/${session.rounds.length} · ${session.roundInfo.name} · count-in 4 clicks, then one note per beat · ${config.bpm} BPM` : 'Start with the root · type the note names in order', false, 5000);
    if (config.mode === 'battle') callout('READY', '#d5ff62', 500);
  }
  function openMenu() {
    if (!pageActive || session.status === 'finished' || menu.open) return;
    if (session.status === 'playing') { session.pause(); pausedAt = performance.now(); }
    processEvents(); drawWords(); menu.showModal(); controls();
    (session.status === 'paused' ? $('#resume') : $('#menu-start')).focus({ preventScroll: true });
  }
  function resumeFromMenu() {
    if (menu.open || !pageActive || document.hidden) return;
    if (session.status === 'paused') { const held = performance.now() - pausedAt; messageUntil += held; calloutUntil += held; session.resume(); last = performance.now(); processEvents(); controls(); drawWords(); input.focus({ preventScroll: true }); }
    else if (session.status === 'ready') $('#setup').focus({ preventScroll: true });
  }
  function closeMenu() { if (menu.open) menu.close(); resumeFromMenu(); controls(); }
  function toggleMenu() { if (menu.open) closeMenu(); else openMenu(); }
  function finish() { session.finish('finished'); processEvents(); closeMenu(); controls(); }
  function results() {
    resultShown = true; const s = session.stats(), r = session.reason;
    const key = recordKey(), previous = records[key], complete = s.done === s.total;
    const personalBest = complete && !auto && (!previous || s.score > previous.score);
    if (personalBest) { records[key] = { score: s.score, timing: s.timingPct }; try { localStorage.setItem('punkman-scale-flow-records', JSON.stringify(records)); } catch {} }
    const xp = complete && !auto ? xpFor(s, { practice: config.mode !== 'battle', firstClear: !previous, personalBest }) * (led ? 1 : 1.25) : 0;
    $('#result-kicker').textContent = (r === 'victory' ? 'FLOW CLEAR / ' : r === 'defeat' ? 'FLOW BROKEN / ' : 'FLOW COMPLETE / ') + `${title()} · ${positionLabel()} · ${octaveLabel()}`.toUpperCase();
    $('#result-title').innerHTML = (r === 'victory' ? 'In the flow.' : r === 'defeat' ? 'One more run.' : r === 'survived' ? 'Drake is still standing.' : 'Nice practice.') + (personalBest ? '<span class="pb-badge">PERSONAL BEST</span>' : '');
    $('#result-description').textContent = r === 'victory' ? `Synth Drake defeated! You played ${title()} ${config.octave === 'full' ? 'across two octaves' : 'through one octave'} on the beat${s.rounds.length > 1 ? ` through ${s.rounds.length} rounds (${tempoRange()})` : ''}.` : r === 'defeat' ? 'The beat got away. Try a slower tempo or one octave first, then come back.' : r === 'survived' ? 'You finished the scale but too many notes landed GOOD or late. Tighter timing deals more damage.' : 'Session ended early. The neck remembers where you stopped.';
    $('#result-score').textContent = s.score.toLocaleString(); $('#result-timing').textContent = s.timingPct == null ? '—' : s.timingPct + '%'; $('#result-streak').textContent = s.bestStreak;
    $('#grade-row').innerHTML = [['perfect', s.perfect], ['great', s.great], ['good', s.good], ['miss', s.miss]].map(([g, n]) => `<div><strong class="grade-${g}">${n}</strong><span>${g.toUpperCase()}</span></div>`).join('');
    const offset = s.meanOffsetMs == null ? '' : ` · you tend ${s.meanOffsetMs < 0 ? 'early' : 'late'} by ${Math.abs(Math.round(s.meanOffsetMs))} ms`;
    $('#result-details').textContent = `${s.hits}/${s.total} notes · ${s.accuracy}% key accuracy${offset}${config.mode === 'battle' ? ` · ${config.bpm} BPM` : ''} · ${s.ultimates} overdrives${s.heals ? ` · ${s.heals} ♥ healed` : ''} · LED guide ${led ? 'on' : 'off'}`;
    const list = $('#round-list'); list.replaceChildren(); list.hidden = s.rounds.length < 2;
    for (const rr of s.rounds.length > 1 ? s.rounds : []) { const row = document.createElement('div'); const cells = [['b', String(rr.index + 1).padStart(2, '0')], ['span', `${rr.name}${config.mode === 'battle' ? ` · ${rr.bpm} BPM` : ''}`], ['strong', `${rr.hits}/${rr.total}`], ['em', rr.done ? (rr.timingPct == null ? (rr.done < rr.total ? 'stopped' : 'done') : rr.timingPct + '%') : '—']]; for (const [tag, text] of cells) { const c = document.createElement(tag); c.textContent = text; row.append(c); } list.append(row); }
    const review = $('#result-review'); review.replaceChildren();
    review.append(auto ? 'Auto run' : `+${Math.round(xp)} XP` + (complete ? (!previous ? ' · first clear +30' : '') + (personalBest && previous ? ' · PB +20' : '') + (s.fullCombo ? ' · full combo +25' : '') + (led ? '' : ' · LED off ×1.25') : ' (complete the flow to earn XP)'));
    review.append(document.createElement('br'));
    const longer = config.routine === 'single' ? 'set' : config.routine === 'set' ? 'marathon' : null;
    const next = r === 'victory' && s.perfect / Math.max(1, s.total) > .7 && longer ? `Go longer: the ${ROUTINES[longer].title} (${ROUTINES[longer].tag}) adds patterns and raises the tempo.` : r === 'victory' && s.perfect / Math.max(1, s.total) > .7 ? `Try ${config.bpm + 10 <= RULES.maxBpm ? config.bpm + 10 + ' BPM' : 'LED guide off'}, ${config.position === 'r5' ? 'R 6th string' : 'R 5th string'}, or a new scale type.` : s.miss > 3 ? `Drop to ${Math.max(RULES.minBpm, config.bpm - 10)} BPM or play Oct 1 only, then rebuild.` : 'Run it again — repetition is how a position becomes muscle memory.';
    const b = document.createElement('b'); b.textContent = next; review.append(b);
    if (auto) { review.append(document.createElement('br')); review.append('Auto run · watched, not saved. Turn Auto run off in the menu to play it yourself.'); }
    if (s.mistakes.length) review.append(` Keys to review: ${s.mistakes.map(([k, n]) => `${k.toUpperCase()} (${n})`).join(' · ')}`);
    $('#results').showModal(); $('#again').focus(); bestDisplay();
  }

  // ---------- Input ----------
  input.addEventListener('keydown', e => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') return;
    if (!session.acceptingInput) { if (e.key.length === 1 || e.key === 'Backspace') { e.preventDefault(); if (session.status === 'playing' && session.timed && !session.isComplete) hint(session.countingIn ? 'Wait for the count-in · first note lands on beat 5' : 'Too early · the window opens just before each beat', false, 600); } return; }
    if (e.key === 'Backspace' || e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || /^[a-gsA-GS#]$/.test(e.key)) {
      e.preventDefault(); if (e.repeat && e.key !== 'Backspace') return;
      session.input(e.key); processEvents(); drawWords(); hud();
    } else if (e.key.length === 1) { e.preventDefault(); hint('Note names only: a b c d e f g · → for sharp · ← for flat', true); }
  });
  input.addEventListener('paste', e => e.preventDefault()); input.addEventListener('drop', e => e.preventDefault());
  input.addEventListener('input', e => {
    if (e.isComposing) return; if (menu.open || session.status !== 'playing') { drawWords(); return; }
    if (e.inputType === 'deleteContentBackward') session.input('Backspace');
    else if (e.inputType === 'insertText' && typeof e.data === 'string' && e.data.length === 1) session.input(e.data);
    processEvents(); drawWords(); hud();
  });
  document.addEventListener('keydown', e => {
    if (!pageActive || $('#results').open) return;
    if (menu.open) { if (e.key === 'Escape' && e.repeat) e.preventDefault(); return; }
    if (e.target !== input && (e.target?.isContentEditable || e.target?.closest?.('a,button,input,select,textarea'))) return;
    if (e.key === 'Escape' && !e.repeat) { e.preventDefault(); toggleMenu(); }
  });
  window.addEventListener('blur', () => { if (session.status === 'playing') openMenu(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && session.status === 'playing') openMenu(); });
  window.addEventListener('pagehide', () => { if (!pageActive) return; pageActive = false; loaded = false; finishAt = 0; session.pause(); scene.reset(); input.disabled = true; $('#start').disabled = true; $('#menu-start').disabled = true; try { audio?.close().catch(() => {}); } catch {} });
  window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });

  // ---------- Menu wiring ----------
  for (const n of NOTE_NAMES) { const o = document.createElement('option'); o.value = n; o.textContent = n; $('#root').append(o); }
  for (const t of Object.keys(DATA.titles)) { const o = document.createElement('option'); o.value = t; o.textContent = DATA.titles[t]; $('#scale-type').append(o); }
  const settingsChanged = () => { if (session.status === 'ready') prepare(); };
  $('#root').addEventListener('change', () => { config.root = $('#root').value; settingsChanged(); });
  $('#scale-type').addEventListener('change', () => { config.type = $('#scale-type').value; settingsChanged(); });
  $('#bpm').addEventListener('input', () => { config.bpm = Number($('#bpm').value); $('#bpm-value').textContent = config.bpm + ' BPM'; settingsChanged(); });
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { if (session.status !== 'ready') return; config.mode = b.dataset.mode; prepare(); });
  for (const b of document.querySelectorAll('[data-position]')) b.addEventListener('click', () => { if (session.status !== 'ready') return; config.position = b.dataset.position; prepare(); });
  for (const b of document.querySelectorAll('[data-octave]')) b.addEventListener('click', () => { if (session.status !== 'ready') return; config.octave = b.dataset.octave; prepare(); });
  for (const b of document.querySelectorAll('[data-routine]')) b.addEventListener('click', () => { if (session.status !== 'ready') return; config.routine = b.dataset.routine; prepare(); });
  $('#start').addEventListener('click', start); $('#menu-start').addEventListener('click', start);
  $('#setup').addEventListener('click', openMenu); $('#pause').addEventListener('click', toggleMenu);
  $('#resume').addEventListener('click', closeMenu); $('#menu-close').addEventListener('click', closeMenu);
  menu.addEventListener('cancel', e => { e.preventDefault(); closeMenu(); }); menu.addEventListener('close', resumeFromMenu);
  $('#finish').addEventListener('click', finish);
  $('#again').addEventListener('click', () => { prepare(); start(); });
  $('#change-session').addEventListener('click', () => { prepare(); openMenu(); $('#root').focus(); });
  $('#results').addEventListener('cancel', e => { e.preventDefault(); prepare(); openMenu(); });
  $('#sound').addEventListener('click', () => { sound = !sound; $('#sound').textContent = 'Sound: ' + (sound ? 'On' : 'Off'); $('#sound').setAttribute('aria-pressed', sound); tone(660, .08); });
  $('#auto').addEventListener('click', () => { auto = !auto; $('#auto').textContent = 'Auto run: ' + (auto ? 'On' : 'Off'); $('#auto').setAttribute('aria-pressed', auto); autoAt = 0; controls(); tone(auto ? 660 : 440, .08); });
  $('#guide').addEventListener('click', () => { guide = !guide; $('#guide').textContent = 'Note guide: ' + (guide ? 'On' : 'Off'); $('#guide').setAttribute('aria-pressed', guide); if (guide) pluck(60, .03, .3); });
  $('#led').addEventListener('click', () => { led = !led; $('#led').textContent = 'LED guide: ' + (led ? 'On' : 'Off'); $('#led').setAttribute('aria-pressed', led); bestDisplay(); drawNeck(); });
  function motionUI() { document.body.classList.toggle('reduced-motion', !scene.motion); $('#motion').textContent = 'Effects: ' + (scene.motion ? 'On' : 'Reduced'); $('#motion').setAttribute('aria-pressed', scene.motion); }
  $('#motion').addEventListener('click', () => { scene.motion = !scene.motion; motionUI(); });
  function fitViewport() { const v = window.visualViewport, h = v?.height || window.innerHeight; if (Number.isFinite(h)) document.documentElement?.style.setProperty('--play-viewport-height', h + 'px'); document.body.classList.toggle('keyboard-open', !!v && window.innerHeight - v.height > 140); }
  window.addEventListener('resize', fitViewport); window.visualViewport?.addEventListener?.('resize', fitViewport); window.visualViewport?.addEventListener?.('scroll', fitViewport);

  /** Auto run: the page types each note on its beat (or every .6 s in practice) so the effects can be watched. Nothing is saved. */
  function autopilot(dt) {
    if (session.status !== 'playing' || !session.current || menu.open) return;
    if (session.timed) { if (!session.acceptingInput || session.clock < session.dueMs(session.cursor) - 8) return; }
    else { autoAt -= dt; if (autoAt > 0) return; autoAt = .6; }
    for (const ch of session.target) session.input(ch);
    processEvents(); drawWords(); hud();
  }
  function frame(now) {
    if (!pageActive) return;
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    session.tick(dt); processEvents();
    if (auto) autopilot(dt);
    if (session.status !== 'paused' && !menu.open && !document.hidden) { scene.draw(session, dt); drawNeck(); }
    if (now - lastHud > 60) { hud(); lastHud = now; }
    if (session.status !== 'paused' && now > calloutUntil) clearCallout();
    if (finishAt && now >= finishAt && !resultShown) results();
    requestAnimationFrame(frame);
  }
  prepare(); motionUI(); fitViewport(); requestAnimationFrame(frame);
  scene.ready.then(() => { if (!pageActive) return; loaded = true; for (const b of [$('#start'), $('#menu-start')]) { b.disabled = false; b.textContent = 'Start the flow →'; } })
    .catch(error => { if (!pageActive) return; for (const b of [$('#start'), $('#menu-start')]) b.textContent = 'Images could not load'; hint('Some game images could not load. Refresh the page to try again.', true, 600000); console.error(error); });
  // Read-only diagnostics for local QA.
  window.scaleFlowSnapshot = () => ({ ...session.stats(), status: session.status, reason: session.reason, config: { ...config }, routine: config.routine, round: session.roundIndex + 1, rounds: session.rounds.length, currentBpm: session.currentBpm, timeLeftMs: session.timeLeftMs, dueMs: session.current ? session.dueMs(session.cursor) : null, guide, target: session.target, buffer: session.buffer, cursor: session.cursor, hp: session.hp, bossHp: session.bossHp, phase: session.phase, clock: session.clock, accepting: session.acceptingInput, loaded, led, sound });
})();
