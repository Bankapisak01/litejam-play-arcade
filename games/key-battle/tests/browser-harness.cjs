// Run the real controller, scene and rules with controllable browser APIs.
const fs = require('node:fs');
const vm = require('node:vm');
const noop = () => {};
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function boot({ reducedMotion = true, viewport } = {}) {
  const elements = new Map(), handlers = new Map(), documentHandlers = new Map(), viewportHandlers = new Map(), images = [];
  let activeElement;
  const gradient = () => ({ addColorStop: noop });
  const ctx = new Proxy({ createLinearGradient: gradient, createRadialGradient: gradient }, { get: (o, k) => o[k] ?? noop, set: (o, k, v) => (o[k] = v, true) });
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
    currentTime = 0; state = 'running';
    close() { closed++; return Promise.resolve(); }
    createOscillator() { return { frequency: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop, start: noop, stop: noop }; }
    createGain() { return { gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop }; }
  }
  function element() {
    return {
      handlers: {}, dataset: {}, style: { setProperty(name, value) { this[name] = value; } }, value: '', tagName: 'INPUT',
      closest(selector) { return selector.split(',').some(tag => tag.trim().toUpperCase() === this.tagName) ? this : this.parentElement?.closest(selector); },
      classList: { add: noop, remove: noop, toggle: noop }, append: noop, replaceChildren: noop,
      setAttribute: noop, focus() { activeElement = this; }, getContext: () => ctx,
      addEventListener(type, fn) { this.handlers[type] = fn; }, click() { this.handlers.click?.(); },
      close() { if (!this.open) return; this.open = false; this.handlers.close?.(); }, showModal() { this.open = true; }
    };
  }
  function el(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  }
  el('#lesson').value = 'warmup'; el('#start').disabled = true;
  const sandbox = {
    console, Image, matchMedia: () => ({ matches: reducedMotion }), performance: { now: () => now },
    localStorage: { getItem: () => null, setItem: noop },
    requestAnimationFrame: fn => { nextFrame = fn; return ++scheduled; },
    document: { querySelector: el, querySelectorAll: () => [], createElement: element, addEventListener: (type, fn) => documentHandlers.set(type, fn), body: element(), documentElement: element(), get activeElement() { return activeElement; } },
    window: { innerHeight: 768, innerWidth: 1366, visualViewport: viewport ? { ...viewport, addEventListener: (type, fn) => viewportHandlers.set(type, fn) } : undefined, AudioContext, addEventListener: (type, fn) => handlers.set(type, fn), location: { reload: () => reloaded++ } }
  };
  vm.runInNewContext(fs.readFileSync('dist/typing-engine.js', 'utf8'), sandbox);
  sandbox.window.KeyBattle = sandbox.KeyBattle;
  for (const file of ['vfx.js', 'scene.js', 'app.js']) vm.runInNewContext(fs.readFileSync('dist/' + file, 'utf8'), sandbox);
  return {
    el, document: sandbox.document, viewport: sandbox.window.visualViewport,
    emitViewport: type => viewportHandlers.get(type)?.(),
    load: () => images.forEach(image => image.load()), snapshot: () => sandbox.window.keyBattleSnapshot(),
    emit: (type, event = {}) => handlers.get(type)?.(event),
    emitDocument: (type, event = {}) => documentHandlers.get(type)?.(event),
    tick() { now += 100; nextFrame(now); },
    get scheduled() { return scheduled; }, get closed() { return closed; }, get reloaded() { return reloaded; }
  };
}

module.exports = { boot, settle, noop };
