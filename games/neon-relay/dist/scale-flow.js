/* Neon Relay × Scale Flow demo — "Scale Run": Punkman auto-runs the rooftops along six neon strings; hop to the note's string and strum it on the beat.
 * Rules, rounds, tempo ramp, hearts, boss HP, timing grades and note pitches come from the shared Scale Flow engine. Entirely local. */
(() => {
  'use strict';
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
  const $ = s => document.querySelector(s), W = 480, H = 270;
  canvas.width = W * 2; canvas.height = H * 2; ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.imageSmoothingEnabled = false;
  const { Session, RULES, ROUTINES, NOTE_NAMES, DATA, xpFor } = window.ScaleFlow;
  const R = window.ScaleRunRules, fx = window.PunkmanFX, bossArt = window.PunkmanBoss;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const color = { pink: '#ff4ca4', cyan: '#80f4df', white: '#f6e8ec', lime: '#d5ff62', gold: '#ffd18a', blue: '#4fc3ff', root: '#ff5a86', dim: '#bba9c6' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const config = { mode: 'battle', root: 'C', type: 'major', position: 'r5', octave: 'full', routine: RULES.defaultRoutine, bpm: RULES.defaultBpm };
  const menu = $('#pause-menu');
  let session, player, boss, loaded = false, failed = false, sound = true, guide = true, auto = false, autoHopT = 0, autoStrumAt = 0, inputMode = 'notes', motion = !reduced, audio, pageActive = true, menuOpen = false;
  let last = performance.now(), time = 0, scroll = 0, shake = 0, callout = null, flashes = [], particles = [], shots = [], finishAt = 0, resultShown = false, records = {}, healedFlag = false, noteTimer = 0, strumKind = 0;
  try { const data = JSON.parse(localStorage.getItem('punkman-scale-run-records') || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) records = data; } catch {}
  const title = () => `${config.root} ${DATA.titles[config.type]}`;
  const positionLabel = () => config.position === 'r5' ? 'R 5th string' : 'R 6th string';
  const octaveLabel = () => config.octave === 'full' ? 'Full' : config.octave === 'lower' ? 'Oct 1' : 'Oct 2';
  const routineLabel = () => ROUTINES[config.routine].title;
  const recordKey = () => [config.mode, config.root, config.type, config.position, config.octave, config.routine, config.mode === 'battle' ? config.bpm : 0].join('|');
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const tempoRange = () => { const list = session.rounds.map(r => r.bpm), lo = Math.min(...list), hi = Math.max(...list); return lo === hi ? `${lo} BPM` : `${lo}→${hi} BPM`; };
  const summaryText = () => `${config.mode === 'battle' ? 'Flow battle' : 'Practice · notes wait'} · ${title()} · ${positionLabel()} · ${octaveLabel()} · ${routineLabel()}${config.mode === 'battle' ? ' · ' + config.bpm + ' BPM' : ''}`;
  const midiHz = midi => 440 * Math.pow(2, (midi - 69) / 12);

  // ---------- Sprites ----------
  const sprites = Object.fromEntries(['walk', 'jump', 'slash', 'shoot'].map(name => [name, { image: new Image(), loaded: false }]));
  function spritesLoaded() { if (!pageActive || !fx.ready() || !bossArt.ready() || !Object.values(sprites).every(s => s.loaded)) return; loaded = true; failed = false; for (const b of [$('#start'), $('#menu-start')]) { b.disabled = false; b.innerHTML = 'Start the run <span>↗</span>'; } $('#status').textContent = 'Ready to run'; }
  function spritesFailed() { if (!pageActive) return; loaded = false; failed = true; for (const b of [$('#start'), $('#menu-start')]) { b.disabled = false; b.textContent = 'Retry loading'; } $('#status').textContent = 'Images could not load. Select Retry loading.'; }
  function loadSprites() {
    if (!pageActive) return; loaded = false; failed = false;
    for (const b of [$('#start'), $('#menu-start')]) { b.disabled = true; b.textContent = 'Loading characters…'; }
    for (const [name, sprite] of Object.entries(sprites)) { sprite.loaded = false; sprite.image.onload = () => { if (sprite.image.naturalWidth !== 8 * 128 || sprite.image.naturalHeight !== 128) { sprite.image.onerror(); return; } sprite.loaded = true; spritesLoaded(); }; sprite.image.onerror = () => { sprite.loaded = false; spritesFailed(); }; sprite.image.src = `assets/punkman-${name}-right.png`; }
    fx.load(spritesLoaded, spritesFailed); bossArt.load(spritesLoaded, spritesFailed);
  }

  // ---------- Audio (local synthesis only) ----------
  function tone(frequency = 440, length = .07, volume = .025, end = frequency, type = 'triangle') {
    if (!pageActive || !sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(frequency, audio.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(end, 40), audio.currentTime + length);
      g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + length); o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + length);
    } catch {}
  }
  const click = accent => tone(accent ? 1500 : 1000, .035, accent ? .05 : .03, accent ? 900 : 700, 'square');
  /** The note itself: a short plucked tone at the position's real pitch (string + fret → MIDI). */
  function pluck(midi, volume = .035, length = .35) {
    if (!pageActive || !sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume();
      const hz = midiHz(midi), t = audio.currentTime, gain = audio.createGain();
      gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.001, t + length); gain.connect(audio.destination);
      for (const [type, mult, level] of [['triangle', 1, 1], ['sawtooth', 1, .22], ['sine', 2, .16]]) { const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(hz * mult, t); g.gain.setValueAtTime(level, t); o.connect(g); g.connect(gain); o.start(t); o.stop(t + length); }
    } catch {}
  }

  // ---------- Helpers ----------
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function label(text, x, y, c = '#f1eee8', size = 7, align = 'left') { ctx.font = `bold ${size}px monospace`; ctx.fillStyle = c; ctx.textAlign = align; ctx.fillText(text, Math.round(x), Math.round(y)); ctx.textAlign = 'left'; }
  function say(text, c = color.cyan, duration = 1) { callout = { text, color: c, until: time + duration }; }
  function notify(text) { $('#notification').textContent = text; $('#notification').classList.add('show'); noteTimer = 3; }
  function burst(x, y, c, count = 10) { if (!motion) count = Math.min(count, 3); for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 140, vy: -Math.random() * 110 - 20, life: .5 + Math.random() * .3, c }); }
  const gradeColor = { perfect: color.lime, great: color.cyan, good: color.gold, miss: color.root };

  // ---------- Session lifecycle ----------
  function prepare() {
    session = new Session({ ...config }); resultShown = false; finishAt = 0; flashes = []; particles = []; shots = []; callout = null; time = 0; scroll = 0; shake = 0; healedFlag = false;
    const first = session.steps[0]; player = { string: first ? first.string : 5, fromY: 0, hopT: 0, strumT: 0, face: 1, w: 14, h: 30 }; player.y = R.railY(player.string) - player.h; player.fromY = player.y;
    boss = bossArt.create(); boss.x = 392; boss.y = 156; boss.face = -1; boss.active = true; boss.state = 'idle';
    $('#results').close();
    const n = session.steps.length, rounds = session.rounds, names = rounds.map(r => r.name).join(' → ');
    $('#lesson-note').textContent = `${rounds.length} round${rounds.length > 1 ? 's' : ''} · ${n} notes · ${names}${config.mode === 'battle' ? ` · ${tempoRange()} · about ${mmss(session.totalMs)}` : ' · no tempo · each note waits for you'}`;
    $('#session-summary').textContent = summaryText();
    $('#start-description').textContent = `${config.mode === 'battle' ? 'Count-in 4 beats → hop to the note\'s string → strum as the LED reaches Punkman' : 'Hop to each note\'s string and strum it in order · 2.5 s pace per note'}${rounds.length > 1 ? ` · ${rounds.length} rounds change the pattern${config.mode === 'battle' ? ` and the tempo (${tempoRange()})` : ''}` : ''}.`;
    for (const b of document.querySelectorAll('[data-mode]')) { const on = b.dataset.mode === config.mode; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); }
    for (const b of document.querySelectorAll('[data-position]')) { const on = b.dataset.position === config.position; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); }
    for (const b of document.querySelectorAll('[data-octave]')) { const on = b.dataset.octave === config.octave; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); }
    for (const b of document.querySelectorAll('[data-routine]')) { const on = b.dataset.routine === config.routine; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on); }
    $('#root').value = config.root; $('#scale-type').value = config.type; $('#bpm').value = config.bpm; $('#bpm-value').textContent = config.bpm + ' BPM';
    $('#status').textContent = loaded ? 'Ready to run' : $('#status').textContent;
    controls(); bestDisplay();
  }
  function bestDisplay() {
    const best = records[recordKey()];
    $('#best').innerHTML = best ? `${best.score.toLocaleString()} <small>PTS</small>` : '—';
    $('#best-detail').textContent = best ? `${best.timing == null ? 'untimed' : best.timing + '% timing'} · ${title()} · ${positionLabel()} · ${octaveLabel()} · ${routineLabel()}${config.mode === 'battle' ? ' · ' + config.bpm + ' BPM' : ''}` : 'Set your first personal best for this scale';
  }
  function controls() {
    const active = ['playing', 'paused'].includes(session.status);
    for (const b of document.querySelectorAll('[data-mode],[data-position],[data-octave],[data-routine]')) b.disabled = active;
    $('#root').disabled = active; $('#scale-type').disabled = active; $('#bpm').disabled = active || config.mode !== 'battle'; $('#settings-note').hidden = !active;
    $('#pause').disabled = session.status === 'finished'; $('#finish').disabled = !active;
    $('#overlay').hidden = session.status !== 'ready';
    $('#pause').innerHTML = active ? 'Pause <kbd>ESC</kbd>' : 'Menu <kbd>ESC</kbd>';
    $('#menu-title').textContent = active ? 'Run paused' : 'Scale setup';
    $('#menu-description').textContent = active ? 'Punkman is holding his string. Pick it up right where you left off.' : "Pick a scale like the app's Scale flow tab, then run it: one note per beat, string by string.";
    $('#menu-start').hidden = active; $('#menu-resume').hidden = !active; $('#finish').hidden = !active;
    $('#scale-label').textContent = `${title()} · ${positionLabel()} · ${octaveLabel()} · ${routineLabel()}${config.mode === 'battle' ? ' · ' + session.currentBpm + ' BPM' : ' · NO TEMPO'}`.toUpperCase();
  }
  function start() {
    if (!pageActive || document.hidden || session.status !== 'ready') return;
    if (!loaded) { if (failed) loadSprites(); return; }
    if (menuOpen) closeMenu(false);
    session.start(); last = performance.now(); processEvents(); controls(); canvas.focus({ preventScroll: true });
    $('#status').textContent = auto ? 'Auto run · Punkman plays the scale himself · watch the effects (not saved)' : config.mode === 'battle' ? `Round 1/${session.rounds.length} · ${session.roundInfo.name} · count-in 4 clicks, then one note per beat at ${config.bpm} BPM` : 'Hop to the note\'s string and strum · your own pace';
    if (config.mode === 'battle') say('READY', color.lime, .5); tone(330, .12, .035, 660);
  }
  function openMenu() {
    if (!pageActive || menuOpen || session.status === 'finished' || $('#results').open) return;
    if (session.status === 'playing') session.pause();
    menuOpen = true; processEvents(); controls(); menu.showModal();
    (session.status === 'paused' ? $('#menu-resume') : $('#menu-start')).focus({ preventScroll: true });
  }
  function closeMenu(resume = true) {
    if (!menuOpen) return; menuOpen = false; if (menu.open) menu.close();
    if (resume && session.status === 'paused' && !document.hidden) { session.resume(); last = performance.now(); processEvents(); canvas.focus({ preventScroll: true }); }
    controls();
  }
  function toggleMenu() { if (menuOpen) closeMenu(); else openMenu(); }
  function finish() { session.finish('finished'); processEvents(); closeMenu(false); controls(); }

  // ---------- Input ----------
  function hop(dir) {
    if (session.status !== 'playing' || menuOpen) return;
    const next = R.clampString(player.string + dir); if (next === player.string) return;
    player.fromY = player.y; player.string = next; player.hopT = .18; tone(dir < 0 ? 520 : 380, .05, .012, dir < 0 ? 640 : 300, 'square');
  }
  function strum() {
    if (session.status !== 'playing' || menuOpen) return;
    player.strumT = .25; strumKind = (strumKind + 1) % 2;
    const ok = session.strum(player.string); processEvents();
    if (!ok) { if (session.timed) notify(session.countingIn ? 'Wait for the count-in · the first note lands on beat 5' : 'Too early · strum as the LED reaches Punkman'); tone(220, .05, .012, 180, 'square'); }
  }
  /** Note-name input: type the note (a–g, s or # for a sharp, Backspace to correct). Punkman hops to the string and strums on the hit. */
  function typeNote(key) {
    if (session.status !== 'playing' || menuOpen || !session.current) return;
    if (!session.acceptingInput) { if (session.timed && !session.isComplete) notify(session.countingIn ? 'Wait for the count-in · the first note lands on beat 5' : 'Too early · type the note as its LED reaches Punkman'); tone(220, .05, .012, 180, 'square'); return; }
    if (!session.input(key)) return;
    // A wrong letter costs the streak once, then clears itself so the next correct letter lands at once (no Backspace needed on the beat).
    while (session.buffer && session.acceptingInput && !session.target.startsWith(session.buffer)) session.input('Backspace');
    processEvents();
  }
  function inputUI() {
    const notes = inputMode === 'notes';
    $('#keys').textContent = 'Keys: ' + (notes ? 'Note names' : 'Strings + strum'); $('#keys').setAttribute('aria-pressed', notes);
    $('.quick-hint').innerHTML = notes ? 'A–G <span>TYPE THE NOTE</span><b>·</b> S # <span>SHARP</span><b>·</b> ESC <span>MENU</span>' : 'W S <span>HOP STRING</span><b>·</b> J X SPACE <span>STRUM</span><b>·</b> ESC <span>MENU</span>';
    $('#start-hint').textContent = notes ? 'Type the note name A–G · S or # for a sharp · ENTER to start · Auto run in Menu' : 'W S hop · J X SPACE strum · ENTER to start · Auto run in Menu';
  }
  window.addEventListener('keydown', e => {
    if (!pageActive || e.ctrlKey || e.metaKey || e.altKey) return;
    const editing = e.target?.isContentEditable || e.target?.closest?.('input,select,textarea');
    if ($('#results').open) return;
    if (menuOpen) { if (e.code === 'Escape' && e.repeat) e.preventDefault(); if (e.code === 'KeyP' && !editing) { e.preventDefault(); if (!e.repeat) closeMenu(); } return; }
    if (editing) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (!e.repeat) toggleMenu(); return; }
    if (e.target?.closest?.('a,button')) return;
    if (e.code === 'Enter' && session.status === 'ready') { e.preventDefault(); start(); return; }
    if (inputMode === 'notes') {
      if (e.code === 'Backspace' || /^[a-gsA-GS#]$/.test(e.key)) { e.preventDefault(); if (!e.repeat) typeNote(e.key === 'Backspace' ? 'Backspace' : e.key.toLowerCase()); return; }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) hop(-1); return; }
      if (e.code === 'ArrowDown') { e.preventDefault(); if (!e.repeat) hop(1); return; }
    }
    if (e.code in R.hopKeys) { e.preventDefault(); if (!e.repeat) hop(R.hopKeys[e.code]); return; }
    if (R.strumKeys.includes(e.code)) { e.preventDefault(); if (!e.repeat) strum(); }
  });
  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.classList.add('held'); const a = button.dataset.action; if (a === 'up') hop(-1); else if (a === 'down') hop(1); else strum(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(ev, () => button.classList.remove('held'));
  }
  window.addEventListener('blur', () => { if (session.status === 'playing') openMenu(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && session.status === 'playing') openMenu(); });
  window.addEventListener('pagehide', () => { if (!pageActive) return; pageActive = false; loaded = false; finishAt = 0; session.pause(); for (const b of [$('#start'), $('#menu-start')]) b.disabled = true; try { audio?.close().catch(() => {}); } catch {} });
  window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });

  // ---------- Engine events → scene ----------
  function processEvents() {
    let refresh = false;
    for (const e of session.drain()) {
      if (['note', 'start', 'finish', 'bossDown', 'round', 'heal'].includes(e.type)) refresh = true;
      if (e.type === 'tick') {
        if (e.countIn) { click(e.beat === 0); say(String(RULES.countInBeats - e.beat), color.lime, .45); }
        else { const step = session.steps[e.noteIndex]; if (guide && step) pluck(step.midi, .022, .3); if (!guide || e.roundStep % 4 === 0) click(e.roundStep % 4 === 0); }
      }
      if (e.type === 'note' && !session.timed && session.started && guide && session.current) pluck(session.current.midi, .022, .3);
      if (e.type === 'note' && inputMode === 'notes' && !auto && session.started && session.current && player.string !== session.current.string) { player.fromY = player.y; player.string = session.current.string; player.hopT = .18; }
      if (e.type === 'bossWindup' && boss.state !== 'breath' && !boss.dead) { boss.state = 'charge'; boss.clock = 0; boss.attack = 'breath'; }
      if (e.type === 'mistake') { tone(125, .07, .025, 80); notify(inputMode === 'notes' ? `Wrong key · the note is ${session.current ? session.current.label : ''} · type it again` : 'Wrong string'); }
      if (e.type === 'hit') {
        if (player.string !== e.note.string) { player.fromY = player.y; player.string = e.note.string; player.hopT = .18; }
        if (player.strumT <= 0) { player.strumT = .25; strumKind = (strumKind + 1) % 2; }
        const early = e.offsetMs != null && Math.abs(e.offsetMs) > RULES.perfectMs ? (e.offsetMs < 0 ? ' · EARLY' : ' · LATE') : '';
        say(e.grade.toUpperCase() + (e.grade === 'perfect' ? '!' : early), gradeColor[e.grade], .55);
        pluck(e.note.midi, .05, .45); flashes.push({ t: time, string: e.note.string, c: gradeColor[e.grade] }); burst(R.PLAYER_X + 10, R.railY(e.note.string) - 12, gradeColor[e.grade], 8);
        boss.hitTime = .16; boss.flash = .08; if (boss.state === 'charge') { boss.state = 'idle'; boss.clock = 0; }
      }
      if (e.type === 'attack') { shots.push({ key: e.kind === 'ultimate' ? 'ultimate' : e.kind === 'charged' ? 'charged-bolt' : e.kind === 'slash' ? 'slash' : 'bolt', t: 0, life: e.kind === 'ultimate' ? .6 : .38, y: R.railY(player.string) - 14, enemy: false }); if (e.kind === 'ultimate') { tone(220, .6, .07, 1100); say('RGB OVERDRIVE', '#ffc0e4', 1.2); shake = motion ? 5 : 0; } else if (e.kind === 'charged') tone(350, .2, .04, 950); }
      if (e.type === 'bossAttack') {
        say(e.damage === 2 ? 'ROOT MISSED · DRAKE ULTIMATE −2 ♥' : (e.reason === 'wrong' ? 'WRONG STRING' : 'MISS') + ' · −1 ♥', '#ff91b5', e.damage === 2 ? 1.4 : 1);
        notify(`${e.reason === 'wrong' ? 'Wrong string' : 'Missed the beat'}: ${e.word} · −${e.damage} ♥`); tone(130, .3, .035, 50);
        if (!boss.dead) { boss.state = 'breath'; boss.clock = 0; } shots.push({ key: e.damage === 2 ? 'boss-overdrive' : 'boss-breath', t: 0, life: .5, y: R.railY(player.string) - 14, enemy: true }); shake = motion ? 4 : 0;
      }
      if (e.type === 'late') { say('TOO SLOW · STREAK RESET', '#ff91b5', 1); tone(160, .12, .02, 120); }
      if (e.type === 'heal') healedFlag = true;
      if (e.type === 'round') { const r = e.round; say(`ROUND ${e.index + 1} · ${r.short} · ${r.bpm} BPM${healedFlag ? ' · +1 ♥' : ''}`, healedFlag ? '#a2ffe4' : color.lime, 1.5); notify(`Round ${e.index + 1}/${session.rounds.length} · ${r.name} at ${r.bpm} BPM · ${r.hint}${healedFlag ? ' · clean round +1 ♥' : ''}`); $('#status').textContent = `Round ${e.index + 1}/${session.rounds.length} · ${r.name} · ${r.bpm} BPM`; tone(healedFlag ? 660 : 520, .25, .04, healedFlag ? 990 : 780); healedFlag = false; }
      if (e.type === 'phase') { boss.phase = 2; say('PHASE II', '#ff82c5', 1.5); notify('Phase 2 · Synth Drake is faltering. Keep the run steady.'); tone(140, .65, .045, 420); }
      if (e.type === 'bossDown') { bossArt.defeat(boss); say('DRAKE DOWN · FINISH THE RUN', '#a2ffe4', 1.5); tone(440, .5, .04, 880); burst(boss.x + 40, boss.y + 40, color.pink, 24); }
      if (e.type === 'finish') {
        finishAt = performance.now() + (e.reason === 'victory' ? 1350 : e.reason === 'defeat' ? 1500 : 600); $('#finish').disabled = true;
        if (e.reason === 'victory') { say('FLOW CLEAR', '#a2ffe4', 1.6); tone(440, .6, .04, 880); } else if (e.reason === 'survived') say('FLOW COMPLETE · DRAKE STANDS', color.gold, 1.6); else if (e.reason === 'defeat') { say('SIGNAL LOST', '#ff91b5', 1.5); tone(190, .5, .04, 35); }
        $('#status').textContent = e.reason === 'victory' ? 'Synth Drake defeated · flow clear' : e.reason === 'defeat' ? 'Signal lost · one more run' : 'Run complete';
      }
    }
    if (refresh) controls();
  }

  // ---------- Update ----------
  /** Auto run: Punkman hops to the note's string and strums it on the beat (or every .6 s in practice). Nothing is saved. */
  function autopilot(dt) {
    const cur = session.current; if (!cur) return;
    const beatsAway = session.timed ? (session.dueMs(session.cursor) - session.clock) / session.beatMs : 0;
    autoHopT = Math.max(0, autoHopT - dt);
    if (player.string !== cur.string && beatsAway < 1.6 && autoHopT <= 0 && player.hopT <= 0) { hop(Math.sign(cur.string - player.string)); autoHopT = .09; }
    if (player.string !== cur.string) return;
    if (session.timed) { if (session.clock >= session.dueMs(session.cursor) - 8) strum(); }
    else { autoStrumAt -= dt; if (autoStrumAt <= 0) { strum(); autoStrumAt = .6; } }
  }
  function update(dt) {
    time += dt;
    if (session.status === 'playing') {
      session.tick(dt);
      if (auto && !menuOpen) autopilot(dt);
      if (session.timed && session.started) scroll += dt * R.BEAT_PX * session.currentBpm / 60;
    }
    if (player.hopT > 0) { player.hopT = Math.max(0, player.hopT - dt); const p = 1 - player.hopT / .18, target = R.railY(player.string) - player.h; player.y = player.fromY + (target - player.fromY) * p - Math.sin(p * Math.PI) * 9; }
    else player.y = R.railY(player.string) - player.h;
    player.strumT = Math.max(0, player.strumT - dt);
    boss.clock += dt; boss.hitTime = Math.max(0, boss.hitTime - dt); boss.flash = Math.max(0, boss.flash - dt);
    if (boss.dead) boss.deathTime += dt; else if (boss.state === 'breath' && boss.clock >= .72) { boss.state = 'idle'; boss.clock = 0; } else if (boss.state === 'charge') boss.clock = Math.min(boss.clock, bossArt.windup(boss)); // hold the windup pose while a root note waits
    for (const s of shots) s.t += dt; shots = shots.filter(s => s.t < s.life);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt; } particles = particles.filter(p => p.life > 0);
    flashes = flashes.filter(f => time - f.t < .5); shake = Math.max(0, shake - dt * 18);
    if (noteTimer > 0) { noteTimer -= dt; if (noteTimer <= 0) $('#notification').classList.remove('show'); }
  }

  // ---------- Render ----------
  function skyline() {
    rect(0, 0, W, H, '#141328');
    for (let i = 0; i < 7; i++) rect(0, 30 + i * 28, W, 28, ['#19162f', '#1c1733', '#241939', '#2c1c40', '#342044', '#3c2248', '#45244b'][i]);
    rect(362, 33, 33, 33, '#c76c95'); rect(356, 42, 45, 15, '#c76c95');
    for (let layer = 0; layer < 3; layer++) {
      const step = [60, 49, 72][layer], parallax = [.12, .25, .45][layer], base = [112, 118, 124][layer], cam = scroll * parallax;
      const from = Math.floor(cam / step) - 1;
      for (let i = from; i < from + Math.ceil(W / step) + 3; i++) {
        const x = Math.floor(i * step - cam), bh = 22 + ((i * 31 + layer * 19) % 55 + 55) % 55, bw = step - 5; if (x > W + 10 || x + bw < 0) continue;
        rect(x, base - bh, bw, bh, ['#272039', '#201b32', '#171827'][layer]); rect(x + 3, base - bh - 5, bw - 9, 5, ['#322440', '#2b2340', '#242137'][layer]);
        if (i % 3 === 0) { rect(x + 9, base - bh - 18, 2, 16, '#39304a'); rect(x + 8, base - bh - 19, 4, 2, color.pink); }
        for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) if ((i + row * 3 + col * 7) % 4 === 0) rect(x + 6 + col * 10, base - bh + 7 + row * 11, 3, 4, layer === 1 ? '#6f4a75' : '#473251');
      }
    }
    if (motion) for (let i = 0; i < 14; i++) { const x = (i * 53 + time * 10) % W, y = (i * 41 + time * 21) % 110; rect(x, y, 1, 2, '#77667c'); }
  }
  function rooftop() {
    const f = { x: 0, y: 240, w: W, h: 30 }, off = scroll % 32;
    rect(f.x, f.y, f.w, f.h, '#252538'); rect(f.x, f.y, f.w, 3, '#77969e'); rect(f.x, f.y + 3, f.w, 3, '#3d5864'); rect(f.x, f.y + 6, f.w, 2, '#141b2a');
    for (let x = 5 - off; x < W; x += 22) { rect(x, f.y + 11, 17, 2, '#3c354a'); rect(x, f.y + 13, 2, 8, '#3c354a'); }
    rect(f.x, f.y + f.h - 7, f.w, 2, '#593c57'); for (let x = -off; x < W; x += 32) rect(x, f.y + 2, 9, 2, color.cyan);
  }
  function rails() {
    const cur = session.current;
    for (let s = 1; s <= 6; s++) {
      const y = R.railY(s), hot = cur && cur.string === s && session.status !== 'finished';
      rect(34, y, W - 34, s >= 5 ? 2 : 1, hot ? color.cyan : s >= 4 ? '#5a4a6d' : '#6e5c80');
      if (hot) { rect(34, y - 1, W - 34, 4, color.cyan + '22'); }
      rect(18, y - 6, 12, 12, hot ? '#1d4740' : '#1a1322'); label(R.STRING_NAMES[s], 24, y + 3, hot ? color.cyan : '#a893b5', 7, 'center');
    }
  }
  function notes() {
    const cur = session.cursor, steps = session.steps, timed = session.timed;
    const xFor = i => timed ? R.noteX(session.dueMs(i), session.clock, session.beatMs) : R.PLAYER_X + (i - cur) * R.BEAT_PX;
    for (let i = Math.max(0, cur - 3); i < steps.length; i++) {
      const st = steps[i], x = xFor(i); if (x > W + 40) break; if (x < -40) continue;
      const y = R.railY(st.string), past = i < cur, isCur = i === cur, base = st.isRoot ? color.root : color.blue;
      const j = past ? session.judgements[i] : null;
      ctx.globalAlpha = past ? .3 : isCur ? 1 : .85;
      if (!past) { rect(x, R.RAIL.top - 10, 1, 240 - R.RAIL.top + 10, isCur ? '#ffffff22' : '#ffffff0c'); label(String(st.fret), x, 254, isCur ? color.white : '#8a7a9c', 6, 'center'); }
      if (st.roundStep === 0 && !past && i > 0) { const r = session.rounds[st.round]; label(`${String(r.index + 1).padStart(2, '0')} ${r.short} · ${r.bpm}`, x + 3, R.RAIL.top - 14, color.lime, 6); rect(x, R.RAIL.top - 12, 1, 4, color.lime); }
      const rad = isCur ? 8 : 6;
      if (isCur && motion) { const g = ctx.createRadialGradient(x, y, 2, x, y, 22); g.addColorStop(0, base + '88'); g.addColorStop(1, base + '00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fill(); }
      ctx.fillStyle = past ? (j ? gradeColor[j.grade] : base) : isCur ? '#ffffff' : base; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
      if (isCur) { ctx.fillStyle = base; ctx.beginPath(); ctx.arc(x, y, rad - 2.5, 0, 7); ctx.fill(); }
      label(st.label, x, y + 2.5, isCur ? '#fff' : '#120c1a', isCur ? 7 : 6, 'center');
      if (isCur && session.status === 'playing' && session.started) {
        const frac = clamp(timed ? Math.max(0, session.dueMs(i) - session.clock) / session.beatMs : session.wordDuration ? session.wordLeft / session.wordDuration : 1, 0, 1);
        ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke();
        ctx.strokeStyle = frac > .5 ? color.lime : frac > .25 ? color.gold : color.root; ctx.beginPath(); ctx.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const f of flashes) { const p = (time - f.t) / .5; ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(R.PLAYER_X, R.railY(f.string), 10 + p * 22, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  function drawPlayer() {
    if (!loaded) return;
    const p = player, x = R.PLAYER_X - 24 - p.w / 2;   // Punkman stands just left of the hit line so the note LED is never hidden
    let state = 'walk', frame = Math.floor(scroll / 10) % 8;
    if (p.strumT > 0) { state = strumKind ? 'shoot' : 'slash'; frame = Math.min(7, Math.floor((.25 - p.strumT) / .25 * 8)); }
    else if (p.hopT > 0) { state = 'jump'; frame = p.hopT > .09 ? 1 : 4; }
    else if (!session.timed || !session.started) frame = motion ? Math.floor(time * 8) % 8 : 0;
    if (session.status === 'finished' && session.reason === 'defeat' && Math.floor(time * 14) % 2) return;
    if (motion) { ctx.fillStyle = '#00000055'; ctx.beginPath(); ctx.ellipse(R.PLAYER_X - 24, R.railY(p.string) + 2, 11, 2.5, 0, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(Math.round(x + p.w / 2), Math.round(p.y + p.h)); ctx.scale(p.face, 1);
    ctx.drawImage(sprites[state].image, frame * 128, 0, 128, 128, -24, -44.25, 48, 48); ctx.restore();
  }
  function drawBoss() {
    if (boss.phase === 2 && !boss.dead) fx.draw(ctx, 'boss-overdrive', boss.x + boss.w / 2, boss.y + boss.h / 2, 143, 143, motion ? Math.floor(time * 14) % 8 : 0, 1, motion ? .22 : .12);
    bossArt.draw(ctx, boss);
    if (!boss.dead && boss.state === 'charge') { const m = bossArt.mouth(boss), progress = clamp(boss.clock / bossArt.windup(boss), 0, 1), size = 30 + progress * 23; fx.draw(ctx, 'boss-charge', m.x, m.y, size, size, motion ? Math.floor(time * 18) % 8 : 0); label('ROOT NOTE · DRAKE ULTIMATE READY', boss.x - 40, boss.y - 9, color.gold, 6); }
    if (boss.dead) label('DRAKE DOWN', boss.x + 10, boss.y + 20, '#a2ffe4', 7);
  }
  function drawShots() {
    for (const s of shots) { const p = s.t / s.life, from = s.enemy ? boss.x + 10 : R.PLAYER_X + 16, to = s.enemy ? R.PLAYER_X + 10 : boss.x + 30, x = motion ? from + (to - from) * p : (s.enemy ? R.PLAYER_X + 40 : boss.x - 10); const size = s.key === 'ultimate' ? 120 : s.key === 'boss-overdrive' ? 90 : 56; fx.draw(ctx, s.key, x, s.enemy ? R.railY(player.string) - 14 : s.y, size, size, Math.floor(p * 8), s.enemy ? -1 : 1, motion ? 1 : .6); }
    for (const p of particles) rect(p.x, p.y, 2, 2, p.c);
  }
  function hud() {
    const s = session.stats(), r = session.roundInfo, rn = session.roundIndex + 1;
    rect(8, 7, 118, 25, '#100d1bdd'); label('PUNKMAN', 14, 17, color.white, 7); for (let i = 0; i < session.maxHp; i++) { rect(14 + i * 15, 21, 12, 5, i < session.hp ? color.pink : '#4b324f'); if (i < session.hp) rect(14 + i * 15, 21, 12, 1, '#ffb3d8'); }
    rect(8, 34, 118, 19, '#100d1bdd'); label('OVERDRIVE ' + Math.round(session.charge) + '%', 14, 42, session.charge >= 88 ? color.cyan : color.dim, 6); rect(14, 46, 106, 3, '#4b324f'); rect(14, 46, 106 * session.charge / 100, 3, session.charge >= 88 ? color.cyan : color.pink);
    rect(134, 7, 206, 25, '#100d1bdd'); label('SCORE', 140, 17, color.dim, 6); label(s.score.toLocaleString(), 170, 17, color.lime, 8); label('TIMING', 232, 17, color.dim, 6); label(s.timingPct == null ? '—' : s.timingPct + '%', 268, 17, color.white, 8); label('NOTES', 140, 28, color.dim, 6); label(`${s.done}/${s.total}`, 170, 28, color.white, 7); label('STREAK', 232, 28, color.dim, 6); label(String(s.streak), 268, 28, color.pink, 7);
    rect(134, 34, 206, 19, '#130d20dd'); label(session.phase === 2 ? 'SYNTH DRAKE II - OVERDRIVE' : 'SYNTH DRAKE I', 140, 42, session.phase === 2 ? color.gold : color.pink, 6); label(Math.round(session.bossHp) + ' / 100', 334, 42, color.dim, 6, 'right'); rect(140, 46, 194, 3, '#493248'); rect(140, 46, 194 * session.bossHp / 100, 3, session.phase === 2 ? '#ff8b60' : color.pink);
    rect(348, 7, 124, 25, '#100d1bdd'); label(session.timed ? 'TIME LEFT' : 'TIME', 354, 17, color.dim, 6); label(session.timed ? mmss(session.started ? session.timeLeftMs : session.totalMs) : mmss(s.elapsed * 1000), 466, 19, color.white, 10, 'right');
    rect(348, 34, 124, 19, '#100d1bdd'); label(r ? `ROUND ${rn}/${session.rounds.length} · ${session.timed ? r.bpm + ' BPM' : 'NO TEMPO'}` : '—', 354, 46, color.lime, 6);
    // Route
    let x = 10; ctx.font = 'bold 6px monospace';
    session.rounds.forEach((rd, i) => { const text = `${String(i + 1).padStart(2, '0')} ${rd.short}${session.timed ? ' · ' + rd.bpm : ''}`, w = ctx.measureText(text).width; const state = session.status === 'finished' || i + 1 < rn ? 'cleared' : i + 1 === rn ? 'current' : 'pending'; label(text, x, 64, state === 'current' ? color.cyan : state === 'cleared' ? '#dbc0ef' : '#7d6a90', 6); x += w + 6; if (i < session.rounds.length - 1) { label('›', x, 64, '#6d517e', 6); x += 8; } });
    if (auto) label('AUTO RUN', 470, 64, color.gold, 6, 'right');
    const cur = session.current;
    if (cur) label(`NEXT  ${cur.label}  ·  ${R.STRING_NAMES[cur.string]} string ${cur.string}  ·  fret ${cur.fret}  ·  deg ${cur.degree}${cur.isRoot ? '  ·  ROOT' : ''}${session.buffer ? '  ·  TYPED ' + session.buffer.toUpperCase() + '_' : ''}`, 10, 78, cur.isRoot ? color.gold : color.white, 6);
    else if (session.status === 'finished') label(session.reason === 'defeat' ? 'SIGNAL LOST' : 'FLOW COMPLETE', 10, 78, color.white, 6);
    if (session.status === 'playing' && session.timed && session.countingIn) label(`COUNT-IN · ${r.name.toUpperCase()} · ${r.bpm} BPM`, 470, 78, color.lime, 6, 'right');
    else if (session.status === 'playing' && !session.timed && session.current) label(`PACE ${session.wordLeft.toFixed(1)}s`, 470, 78, session.wordLeft < .6 ? color.root : color.dim, 6, 'right');
    else if (session.status === 'ready') label(inputMode === 'notes' ? 'TYPE THE NOTE NAME · S OR # = SHARP · ↑ ↓ HOP' : 'W S HOP STRING · J X SPACE STRUM', 470, 78, color.dim, 6, 'right');
    if (callout && time < callout.until) { label(callout.text, W / 2, 100, callout.color, 11, 'center'); }
  }
  function render() {
    ctx.save(); if (shake > 0 && motion) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    skyline(); rooftop(); rails(); drawBoss(); drawPlayer(); notes(); drawShots(); ctx.restore(); hud(); // notes stay above Punkman and Drake
  }
  function frame(now) {
    if (!pageActive) return;
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    if (!menuOpen) update(dt); processEvents();
    if (!document.hidden) render();
    if (finishAt && now >= finishAt && !resultShown) results();
    requestAnimationFrame(frame);
  }

  // ---------- Results ----------
  function results() {
    resultShown = true; const s = session.stats(), r = session.reason, key = recordKey(), previous = records[key], complete = s.done === s.total;
    const personalBest = complete && !auto && (!previous || s.score > previous.score);
    if (personalBest) { records[key] = { score: s.score, timing: s.timingPct }; try { localStorage.setItem('punkman-scale-run-records', JSON.stringify(records)); } catch {} }
    const xp = complete && !auto ? xpFor(s, { practice: config.mode !== 'battle', firstClear: !previous, personalBest }) : 0;
    $('#result-kicker').textContent = (r === 'victory' ? 'FLOW CLEAR / ' : r === 'defeat' ? 'FLOW BROKEN / ' : 'FLOW COMPLETE / ') + `${title()} · ${positionLabel()} · ${octaveLabel()}`.toUpperCase();
    $('#result-title').innerHTML = (r === 'victory' ? 'In the flow.' : r === 'defeat' ? 'One more run.' : r === 'survived' ? 'Drake is still standing.' : 'Nice practice.') + (personalBest ? '<span class="pb-badge">PERSONAL BEST</span>' : '');
    $('#result-description').textContent = r === 'victory' ? `Synth Drake defeated! You ran ${title()} ${config.octave === 'full' ? 'across two octaves' : 'through one octave'} on the beat${s.rounds.length > 1 ? ` through ${s.rounds.length} rounds (${tempoRange()})` : ''}.` : r === 'defeat' ? 'The beat got away. Try a slower tempo or one octave first, then come back.' : r === 'survived' ? 'You finished the run but too many notes landed GOOD or late. Tighter timing deals more damage.' : 'Session ended early. The strings remember where you stopped.';
    $('#result-score').textContent = s.score.toLocaleString(); $('#result-timing').textContent = s.timingPct == null ? '—' : s.timingPct + '%'; $('#result-streak').textContent = s.bestStreak;
    $('#grade-row').innerHTML = [['perfect', s.perfect], ['great', s.great], ['good', s.good], ['miss', s.miss]].map(([g, n]) => `<div><strong class="grade-${g}">${n}</strong><span>${g.toUpperCase()}</span></div>`).join('');
    const offset = s.meanOffsetMs == null ? '' : ` · you tend ${s.meanOffsetMs < 0 ? 'early' : 'late'} by ${Math.abs(Math.round(s.meanOffsetMs))} ms`;
    $('#result-details').textContent = `${s.hits}/${s.total} notes · ${s.accuracy}% string accuracy${offset}${config.mode === 'battle' ? ` · ${config.bpm} BPM` : ''} · ${s.ultimates} overdrives${s.heals ? ` · ${s.heals} ♥ healed` : ''}`;
    const list = $('#round-list'); list.replaceChildren(); list.hidden = s.rounds.length < 2;
    for (const rr of s.rounds.length > 1 ? s.rounds : []) { const row = document.createElement('div'); for (const [tag, text] of [['b', String(rr.index + 1).padStart(2, '0')], ['span', `${rr.name}${config.mode === 'battle' ? ` · ${rr.bpm} BPM` : ''}`], ['strong', `${rr.hits}/${rr.total}`], ['em', rr.done ? (rr.timingPct == null ? (rr.done < rr.total ? 'stopped' : 'done') : rr.timingPct + '%') : '—']]) { const c = document.createElement(tag); c.textContent = text; row.append(c); } list.append(row); }
    const review = $('#result-review'); review.replaceChildren();
    review.append(auto ? 'Auto run' : `+${Math.round(xp)} XP` + (complete ? (!previous ? ' · first clear +30' : '') + (personalBest && previous ? ' · PB +20' : '') + (s.fullCombo ? ' · full combo +25' : '') : ' (complete the run to earn XP)'));
    review.append(document.createElement('br'));
    const longer = config.routine === 'single' ? 'set' : config.routine === 'set' ? 'marathon' : null, sharp = s.perfect / Math.max(1, s.total) > .7;
    const next = r === 'victory' && sharp && longer ? `Go longer: the ${ROUTINES[longer].title} (${ROUTINES[longer].tag}) adds patterns and raises the tempo.` : r === 'victory' && sharp ? `Try ${config.bpm + 10 <= RULES.maxBpm ? config.bpm + 10 + ' BPM' : 'a new scale type'}, ${config.position === 'r5' ? 'R 6th string' : 'R 5th string'} or another scale.` : s.miss > 3 ? `Drop to ${Math.max(RULES.minBpm, config.bpm - 10)} BPM or run Oct 1 only, then rebuild.` : 'Run it again — repetition is how a position becomes muscle memory.';
    const b = document.createElement('b'); b.textContent = next; review.append(b);
    if (auto) { review.append(document.createElement('br')); review.append('Auto run · watched, not saved. Turn Auto run off in the menu to play it yourself.'); }
    $('#results').showModal(); $('#again').focus(); bestDisplay();
  }

  // ---------- Menu wiring ----------
  for (const n of NOTE_NAMES) { const o = document.createElement('option'); o.value = n; o.textContent = n; $('#root').append(o); }
  for (const t of Object.keys(DATA.titles)) { const o = document.createElement('option'); o.value = t; o.textContent = DATA.titles[t]; $('#scale-type').append(o); }
  const settingsChanged = () => { if (session.status === 'ready') prepare(); };
  $('#root').addEventListener('change', () => { config.root = $('#root').value; settingsChanged(); });
  $('#scale-type').addEventListener('change', () => { config.type = $('#scale-type').value; settingsChanged(); });
  $('#bpm').addEventListener('input', () => { config.bpm = Number($('#bpm').value); $('#bpm-value').textContent = config.bpm + ' BPM'; settingsChanged(); });
  for (const [attr, key] of [['mode', 'mode'], ['position', 'position'], ['octave', 'octave'], ['routine', 'routine']]) for (const b of document.querySelectorAll(`[data-${attr}]`)) b.addEventListener('click', () => { if (session.status !== 'ready') return; config[key] = b.dataset[attr]; prepare(); });
  $('#start').addEventListener('click', start); $('#menu-start').addEventListener('click', start); $('#setup').addEventListener('click', openMenu);
  $('#pause').addEventListener('click', toggleMenu); $('#fullscreen-pause').addEventListener('click', toggleMenu);
  $('#menu-resume').addEventListener('click', () => closeMenu()); $('#menu-close').addEventListener('click', () => closeMenu());
  menu.addEventListener('cancel', e => { e.preventDefault(); closeMenu(); }); menu.addEventListener('close', () => { if (!menu.open && menuOpen) closeMenu(); });
  $('#finish').addEventListener('click', finish);
  $('#keys').addEventListener('click', () => { inputMode = inputMode === 'notes' ? 'rails' : 'notes'; inputUI(); tone(520, .08); });
  inputUI();
  $('#auto').addEventListener('click', () => { auto = !auto; $('#auto').textContent = 'Auto run: ' + (auto ? 'On' : 'Off'); $('#auto').setAttribute('aria-pressed', auto); autoStrumAt = 0; if (session.status === 'playing' || session.status === 'paused') $('#status').textContent = auto ? 'Auto run on · Punkman takes over · not saved' : 'Auto run off · your turn'; tone(auto ? 660 : 440, .08); });
  $('#again').addEventListener('click', () => { prepare(); start(); });
  $('#change-session').addEventListener('click', () => { prepare(); openMenu(); $('#root').focus(); });
  $('#results').addEventListener('cancel', e => { e.preventDefault(); prepare(); openMenu(); });
  $('#sound').addEventListener('click', () => { sound = !sound; $('#sound').textContent = 'Sound: ' + (sound ? 'On' : 'Off'); $('#sound').setAttribute('aria-pressed', sound); tone(660, .08); });
  $('#guide').addEventListener('click', () => { guide = !guide; $('#guide').textContent = 'Note guide: ' + (guide ? 'On' : 'Off'); $('#guide').setAttribute('aria-pressed', guide); if (guide) pluck(60, .03, .3); });
  $('#motion').addEventListener('click', () => { motion = !motion; $('#motion').textContent = 'Effects: ' + (motion ? 'On' : 'Reduced'); $('#motion').setAttribute('aria-pressed', motion); });
  $('#motion').textContent = 'Effects: ' + (motion ? 'On' : 'Reduced'); $('#motion').setAttribute('aria-pressed', motion);

  prepare(); loadSprites(); requestAnimationFrame(frame);
  // Read-only diagnostics for local QA.
  window.scaleRunSnapshot = () => ({ status: session.status, reason: session.reason, clock: session.clock, cursor: session.cursor, string: player.string, target: session.current ? { label: session.current.label, string: session.current.string, fret: session.current.fret } : null, dueMs: session.current ? session.dueMs(session.cursor) : null, accepting: session.acceptingInput, hp: session.hp, bossHp: session.bossHp, round: session.roundIndex + 1, rounds: session.rounds.length, currentBpm: session.currentBpm, timeLeftMs: session.timeLeftMs, score: session.score, stats: session.stats(), config: { ...config }, loaded, sound, guide });
})();
