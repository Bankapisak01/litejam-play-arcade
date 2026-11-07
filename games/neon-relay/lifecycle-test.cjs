// Browser lifecycle simulation using the real game and local sprite files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const noop = () => {};

function boot() {
  const elements = new Map(), handlers = new Map(), images = [];
  const ctx = new Proxy({}, { get: (o, k) => o[k] ?? noop, set: (o, k, v) => (o[k] = v, true) });
  let now = 0, nextFrame, scheduled = 0, closed = 0, reloaded = 0;
  class Image {
    constructor() { images.push(this); }
    set src(url) { this.url = url; }
    load() {
      const data = fs.readFileSync('dist/' + this.url);
      this.naturalWidth = data.readUInt32BE(16); this.naturalHeight = data.readUInt32BE(20);
      this.onload?.();
    }
  }
  class AudioContext {
    currentTime = 0;
    resume() {}
    close() { closed++; return Promise.resolve(); }
    createOscillator() { return { frequency: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop, start: noop, stop: noop }; }
    createGain() { return { gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop }; }
  }
  function el(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      handlers: {}, tagName: 'DIV', classList: { add: noop, remove: noop }, setAttribute: noop, focus: noop,
      showModal() { this.open = true; }, close() { this.open = false; this.handlers.close?.(); },
      closest(selector) { return selector.split(',').some(tag => tag.trim().toUpperCase() === this.tagName) ? this : this.parentElement?.closest(selector); },
      addEventListener(type, fn) { this.handlers[type] = fn; },
      click() { this.handlers.click?.(); }, getContext() { return ctx; }
    });
    return elements.get(selector);
  }
  const sandbox = {
    console, Image, HTMLButtonElement: class {}, matchMedia: () => ({ matches: true }),
    performance: { now: () => now }, localStorage: { getItem: () => null, setItem: noop },
    requestAnimationFrame: fn => { nextFrame = fn; return ++scheduled; },
    document: { querySelector: el, querySelectorAll: () => [], addEventListener: noop },
    window: { AudioContext, addEventListener: (type, fn) => handlers.set(type, fn), location: { reload: () => reloaded++ } }
  };
  for (const file of ['vfx.js', 'boss.js', 'game.js']) vm.runInNewContext(fs.readFileSync('dist/' + file, 'utf8'), sandbox);
  return {
    el, load: () => images.forEach(image => image.load()), snapshot: () => sandbox.window.punkmanSnapshot(),
    emit: (type, event = {}) => handlers.get(type)?.(event),
    tick() { now += 100; nextFrame(now); },
    get scheduled() { return scheduled; }, get closed() { return closed; }, get reloaded() { return reloaded; }
  };
}

const navigation = boot(); navigation.load();
for (const mode of ['ready', 'paused']) {
  if (mode === 'paused') { navigation.el('#start').click(); navigation.el('#pause').click(); }
  assert.equal(navigation.snapshot().mode, mode);
  for (const tag of ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']) {
    const target = navigation.el(tag === 'A' ? '.arcade-game-nav' : tag); target.tagName = tag;
    let prevented = false;
    navigation.emit('keydown', { code: 'Enter', target, preventDefault() { prevented = true; } });
    assert.equal(prevented, false, `${tag} Enter must retain native keyboard behavior in ${mode}`);
    assert.equal(navigation.snapshot().mode, mode, `${tag} Enter must not start or resume gameplay`);
  }
}
let gameplayPrevented = false;
navigation.el('#menu-resume').click();
const readyGame = boot(); readyGame.load();
readyGame.emit('keydown', { code: 'Enter', target: readyGame.el('#game'), preventDefault() { gameplayPrevented = true; } });
assert.equal(gameplayPrevented, true, 'Enter still controls the focused game');
assert.equal(readyGame.snapshot().mode, 'playing', 'Enter on the game still starts play');
console.log('PASS: native Enter works on Arcade links and form controls in ready and paused states; game Enter still starts.');

const active = boot(); active.load(); active.el('#sound').click(); active.el('#start').click(); active.tick();
assert.equal(active.snapshot().mode, 'playing');
active.emit('pagehide'); const elapsed = active.snapshot().elapsed, scheduled = active.scheduled;
active.tick(); active.el('#start').click();
assert.equal(active.snapshot().mode, 'paused', 'Leaving the page must pause active gameplay');
assert.equal(active.snapshot().elapsed, elapsed, 'A queued frame must not advance a departed game');
assert.equal(active.scheduled, scheduled, 'A departed game must not schedule another frame');
assert.equal(active.closed, 1, 'Leaving must close the active Web Audio context');
active.emit('pageshow', { persisted: true }); assert.equal(active.reloaded, 1, 'A cached page returns as a fresh game');

const loading = boot(); loading.emit('pagehide'); loading.load(); loading.el('#start').click();
assert.equal(loading.el('#start').disabled, true, 'Late sprite loads must not enable a departed game');
assert.equal(loading.snapshot().mode, 'ready', 'Late readiness must not start an obsolete session');
console.log('PASS: navigation pauses play, closes audio, stops frames, rejects late readiness and resets cached pages.');
