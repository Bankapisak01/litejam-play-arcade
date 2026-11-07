// Exercise the real controller against a small DOM boundary and real local sprites.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const noop = () => {};
function boot() {
  const nodes = new Map(), events = new Map(), documentEvents = new Map(), images = [], closeEvents = [];
  const ctx = new Proxy({}, { get: (o, k) => o[k] ?? noop, set: (o, k, v) => (o[k] = v, true) });
  let now = 0, frame;
  const document = { hidden: false, activeElement: null, querySelector: el, querySelectorAll: () => touch,
    addEventListener: (type, fn) => documentEvents.set(type, fn) };
  function el(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { handlers: {}, open: false, tagName: 'DIV', hidden: false,
        classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
        setAttribute: noop, getContext: () => ctx, setPointerCapture: noop,
        closest(selector) { return selector.split(',').some(s => s.trim().toUpperCase() === this.tagName) ? this : this.parentElement?.closest(selector); },
        addEventListener(type, fn) { this.handlers[type] = fn; },
        focus() { document.activeElement = this; },
        click() { this.handlers.click?.(); },
        showModal() { this.open = true; el('#menu-resume').focus(); },
        close() { if (this.open) { this.open = false; closeEvents.push(() => this.handlers.close?.()); } }
      });
    }
    return nodes.get(id);
  }
  const touch = ['KeyJ', 'KeyX', 'ArrowRight'].map(key => Object.assign(el('touch-' + key), { dataset: { key } }));
  class Image {
    constructor() { images.push(this); }
    set src(url) { this.url = url; }
    load() { const data = fs.readFileSync('dist/' + this.url); this.naturalWidth = data.readUInt32BE(16); this.naturalHeight = data.readUInt32BE(20); this.onload?.(); }
  }
  const env = { console, Image, performance: { now: () => now }, matchMedia: () => ({ matches: true }),
    localStorage: { getItem: () => null, setItem: noop }, document,
    requestAnimationFrame: fn => frame = fn, window: { addEventListener: (type, fn) => events.set(type, fn) } };
  for (const file of ['vfx.js', 'boss.js', 'game.js']) vm.runInNewContext(fs.readFileSync('dist/' + file, 'utf8'), env);
  const key = (code, target = document.activeElement || el('#game'), repeat = false) => {
    let prevented = false;
    events.get('keydown')({ code, target, repeat, preventDefault() { prevented = true; } });
    return prevented;
  };
  return { el, key, touch, document, load: () => images.forEach(image => image.load()),
    snapshot: () => env.window.punkmanSnapshot(), emit: type => events.get(type)?.(),
    release: code => events.get('keyup')({ code }),
    tick(seconds) { for (let i = 0; i < seconds * 120; i++) { now += 1000 / 120; frame(now); } },
    flushClose: () => { while (closeEvents.length) closeEvents.shift()(); },
    cancel() { let prevented = false; el('#pause-menu').handlers.cancel?.({ preventDefault() { prevented = true; } }); if (!prevented) el('#pause-menu').close(); },
    hide() { document.hidden = true; documentEvents.get('visibilitychange')?.(); }
  };
}

const ready = boot();
ready.el('#pause').focus(); ready.el('#pause').click();
assert.equal(ready.el('#pause-menu').open, true, 'Menu is available before sprite loading and before a run');
ready.el('#sound').click(); ready.el('#cinema').click();
ready.cancel(); ready.flushClose();
assert.equal(ready.snapshot().mode, 'ready', 'Closing the ready menu must not start a run');
assert.equal(ready.document.activeElement, ready.el('#pause'), 'Closing a ready menu returns focus to its opener');
ready.load(); ready.key('Enter', ready.el('#game'));
assert.equal(ready.snapshot().mode, 'playing', 'Enter on the canvas still starts play');

const g = boot(); g.load(); g.el('#start').click(); g.tick(.5);
g.key('KeyJ'); g.tick(.6); g.key('KeyD');
assert(g.snapshot().combat.shotCharge > .5);
g.key('Escape');
assert.equal(g.snapshot().mode, 'paused', 'Escape pauses an active run');
assert.equal(g.el('#pause-menu').open, true, 'Escape opens the native menu');
assert.equal(g.el('#overlay').hidden, true, 'Pause must not duplicate the start overlay');
const frozen = g.snapshot(); g.tick(.7);
assert.equal(g.snapshot().elapsed, frozen.elapsed, 'Pause freezes the simulation');
assert.equal(g.snapshot().combat.shotCharge, 0, 'Pause cancels a held charge');
for (const tag of ['DIV', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']) {
  const target = g.el('menu-' + tag); target.tagName = tag;
  for (const code of ['KeyR', 'KeyJ', 'KeyX', 'KeyL', 'KeyD', 'Space', 'Enter']) g.key(code, target);
}
assert.equal(g.snapshot().mode, 'paused', 'Menu shortcuts must never resume or restart the run');
assert.equal(g.snapshot().elapsed, frozen.elapsed);
assert.equal(g.key('Escape', undefined, true), true, 'Holding Escape must not immediately cancel the menu it opened');
assert.equal(g.key('Escape'), false, 'The native dialog cancel event owns Escape while open');
g.cancel(); g.flushClose();
assert.equal(g.snapshot().mode, 'playing', 'Native cancel resumes once');
assert.equal(g.el('#pause-menu').open, false);
assert.equal(g.document.activeElement, g.el('#game'), 'Keyboard pause restores focus to the canvas');
g.tick(.1);
assert.equal(g.snapshot().player.x, frozen.player.x, 'Held movement is cleared on pause');
assert.equal(g.snapshot().combat.shotsFired, frozen.combat.shotsFired, 'No stored charged attack leaks after resume');
g.el('#pause').focus(); g.el('#pause').click(); g.el('#menu-resume').click();
assert.equal(g.document.activeElement, g.el('#game'), 'Resuming an active run returns keyboard control to the canvas');

g.key('KeyP'); g.key('KeyP', g.el('#menu-resume'), true);
assert.equal(g.snapshot().mode, 'paused', 'Repeating P cannot immediately unpause');
g.key('KeyP', g.el('#menu-resume'));
assert.equal(g.snapshot().mode, 'playing', 'P can resume with a menu button focused');
g.key('KeyP'); g.flushClose();
assert.equal(g.snapshot().mode, 'paused', 'A queued close event cannot close a newly reopened menu');
g.el('#practice').click(); g.flushClose();
assert.equal(g.snapshot().mode, 'playing');
assert.equal(g.snapshot().boss.practice, true, 'Boss practice starts from the menu');
assert.equal(g.snapshot().combat.meter, 100);
assert.equal(g.el('#pause-menu').open, false);
g.tick(.3); g.key('KeyP'); g.el('#restart').click(); g.flushClose();
assert.equal(g.snapshot().mode, 'playing');
assert.equal(g.snapshot().boss.practice, false, 'Restart leaves practice and resets the stage');
assert.equal(g.snapshot().checkpoint, 45);
assert.equal(g.snapshot().elapsed, 0);

const touch = g.touch[0]; touch.handlers.pointerdown({ pointerId: 7, preventDefault: noop }); g.tick(.6);
g.emit('blur'); assert.equal(g.snapshot().mode, 'paused');
assert.equal(touch.classList.contains('held'), false, 'Pause clears held touch presentation');
touch.handlers.pointerup(); g.el('#menu-resume').click(); g.tick(.1);
assert.equal(g.snapshot().combat.shotsFired, 1, 'Releasing a touch after pause cannot fire its stored charge');
g.hide(); g.emit('blur');
assert.equal(g.snapshot().mode, 'paused', 'Visibility and blur cannot toggle an already paused run back on');
g.el('#menu-resume').click();
assert.equal(g.snapshot().mode, 'paused', 'A hidden page cannot resume from a stale menu event');
g.emit('pagehide'); g.el('#practice').click(); g.el('#restart').click();
assert.equal(g.snapshot().mode, 'paused', 'Stale menu actions cannot mutate a departed game');
console.log('PASS: ready menu, native Escape/P, focus restoration, frozen clocks, shortcut isolation, touch/charge cancellation, restart/practice and lifecycle guards.');
