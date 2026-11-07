// Decorative scenes reuse the same local atlases as the games. No gameplay clock runs here.
const base = '/games/neon-relay/assets/';
const sources = { hero: 'punkman-shoot-right.png', dash: 'punkman-dash-right.png', boss: 'boss-idle-left.png', bolt: 'fx-bolt.png', trail: 'fx-dash.png' };
const colors = ['#6de7dc', '#ffd46f', '#ff75c7', '#b58bff'];
export function createArcadeArt() {
  let motion = false, frameId = 0, last = 0;
  const images = {};
  const scenes = [...document.querySelectorAll('[data-art]')].map(element => ({ element, canvas: element.querySelector('canvas'), kind: element.dataset.art, visible: false, active: false }));
  const rect = (ctx, x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  function sprite(ctx, name, frame, x, y, w, h) { const img = images[name]; if (!img) return; const fw = img.width / 8; ctx.drawImage(img, Math.floor(frame) % 8 * fw, 0, fw, img.height, Math.round(x), Math.round(y), w, h); }
  function city(ctx, w, h, t, hero) {
    const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#27123e'); gradient.addColorStop(.6, '#51305f'); gradient.addColorStop(1, '#120e23'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { const x = (i * 127 + 21) % w, y = (i * 61 + 39) % (h * .68); rect(ctx, x, y, i % 7 === 0 ? 3 : 2, 2, i % 3 ? '#956bb2' : '#eed4f2'); }
    // A stepped sunset keeps the scene crisp at every CSS size.
    const sx = hero ? 495 : 450, sy = hero ? 138 : 80, radius = hero ? 93 : 57;
    for (let y = -radius; y < radius; y += 6) { const half = Math.floor(Math.sqrt(radius * radius - y * y) / 6) * 6; rect(ctx, sx - half, sy + y, half * 2, y > 30 ? 4 : 6, y < -20 ? '#ffb377' : y < 30 ? '#fc7997' : '#be4b9c'); }
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 15; i++) {
      const bw = 35 + (i * 17) % 30, x = i * (w / 13) - 20 + layer * 12, bh = 40 + (i * 43 + layer * 21) % (hero ? 135 : 110), y = h - 55 - bh + layer * 28;
      rect(ctx, x, y, bw, bh + 60, layer ? '#191227' : '#392047');
      if (i % 4 === 0) rect(ctx, x + bw / 2, y - 23, 3, 23, '#6f477b');
      if (layer) for (let wx = 6; wx < bw - 4; wx += 10) for (let wy = 10; wy < bh; wy += 16) if ((i + wx + wy) % 5) rect(ctx, x + wx, y + wy, 4, 6, (i + wy) % 3 ? '#71476c' : '#be7987');
    }
    ctx.strokeStyle = '#80538435'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(w / 2, h * .62); ctx.lineTo(i * w / 8, h); ctx.stroke(); }
    for (let i = 0; i < 5; i++) rect(ctx, 0, h - 15 - i * i * 4, w, 1, '#67437135');
  }
  function notes(ctx, t, hero) {
    const startX = hero ? 390 : 275, startY = hero ? 290 : 225;
    for (let i = 0; i < 6; i++) {
      const progress = (i / 6 + t * .09) % 1;
      const x = startX + progress * (hero ? 250 : 300), y = startY - Math.sin(progress * 2.6) * (hero ? 140 : 105);
      const color = colors[i % 4]; ctx.globalAlpha = .3 + Math.sin(progress * Math.PI) * .7;
      rect(ctx, x, y - 23, 4, 25, color); rect(ctx, x + 4, y - 23, 14, 5, color); rect(ctx, x - 9, y - 2, 12, 7, color); rect(ctx, x + 14, y - 19, 4, 20, color); rect(ctx, x + 5, y, 12, 7, color); ctx.globalAlpha = 1;
    }
  }
  function floor(ctx, y, w) { rect(ctx, 0, y, w, 6, '#c575c9'); rect(ctx, 0, y + 6, w, 7, '#673a80'); rect(ctx, 0, y + 13, w, 90, '#1a1228'); for (let x = 0; x < w; x += 24) rect(ctx, x + 2, y + 17, 20, 7, '#30203e'); }
  function draw(scene, time) {
    const ctx = scene.canvas.getContext('2d'); if (!ctx) return;
    const w = scene.canvas.width, h = scene.canvas.height, t = motion && (scene.kind === 'hero' || scene.active) ? time : 0;
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, w, h); city(ctx, w, h, t, scene.kind === 'hero');
    if (scene.kind === 'hero') {
      ctx.save(); ctx.translate(24, 100); ctx.rotate(-.11); ctx.font = 'bold 115px "Pixelify Sans", monospace'; ctx.strokeStyle = '#c393db25'; ctx.lineWidth = 2; ctx.strokeText('PLAY', 0, 0); ctx.restore();
      const glow = ctx.createRadialGradient(310, 280, 20, 310, 280, 195); glow.addColorStop(0, '#fa69ff22'); glow.addColorStop(1, '#fa69ff00'); ctx.fillStyle = glow; ctx.fillRect(70, 80, 450, 330);
      floor(ctx, 386, w); notes(ctx, t, true); sprite(ctx, 'hero', t * 7, 110, 104 + Math.sin(t * 3) * 2, 300, 300);
      rect(ctx, 35, 343, 60, 43, '#302041'); rect(ctx, 42, 350, 46, 27, '#151023'); rect(ctx, 45, 353, 3, 21, '#8d4d91'); rect(ctx, 30, 381, 70, 5, '#b978ba');
      for (let i = 0; i < 8; i++) { const x = 492 + i * 19; const bh = 10 + ((i * 13) % 38) + Math.sin(t * 4 + i) * 8; rect(ctx, x, 380 - bh, 9, Math.max(4, Math.round(bh)), '#a87cc0'); }
    } else if (scene.kind === 'tempo-rush') {
      ctx.fillStyle = '#110d26aa'; ctx.beginPath(); ctx.moveTo(355, 20); ctx.lineTo(475, 20); ctx.lineTo(640, 340); ctx.lineTo(200, 340); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.strokeStyle = i === 0 || i === 4 ? '#b075ee' : '#603582'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(350 + i * 32, 20); ctx.lineTo(200 + i * 110, 340); ctx.stroke(); }
      for (let i = 0; i < 10; i++) { const lane = i % 4, p = (i / 10 + t * .18) % 1, y = 40 + p * 260, center = 366 + lane * 30 + (lane - 1.5) * p * 76; rect(ctx, center - (10 + p * 18), y, 20 + p * 36, 5 + p * 5, colors[lane]); }
      for (let i = 0; i < 4; i++) { ctx.strokeStyle = colors[i]; ctx.lineWidth = 3; ctx.strokeRect(235 + i * 95, 286, 54, 18); }
      sprite(ctx, 'hero', t * 7, 65, 58, 224, 224);
    } else if (scene.kind === 'key-battle') {
      floor(ctx, 290, w); sprite(ctx, 'hero', t * 7, 125, 108, 180, 180); sprite(ctx, 'boss', t * 5, 340, 72 + Math.sin(t * 2) * 3, 290, 218);
      ctx.font = '600 23px "Pixelify Sans", monospace'; ctx.textAlign = 'center'; rect(ctx, 230, 54, 155, 37, '#20122fe8'); ctx.strokeStyle = '#ff75c7'; ctx.strokeRect(230, 54, 155, 37); ctx.fillStyle = '#ffb8e4'; ctx.fillText('P O W E R', 307, 81); ctx.textAlign = 'start';
      if (t) sprite(ctx, 'bolt', t * 9, 230 + (t * 105) % 160, 157, 96, 96);
    } else {
      floor(ctx, 277, w); rect(ctx, 390, 232, 150, 7, '#7be6db'); rect(ctx, 390, 239, 150, 18, '#254348');
      sprite(ctx, 'trail', t * 10, 152, 120, 215, 162); sprite(ctx, 'dash', t * 8, 255 + Math.sin(t * 1.5) * 9, 97, 205, 205);
      for (let i = 0; i < 4; i++) rect(ctx, 474 + i * 24, 192 + Math.sin(t * 2 + i) * 3, 8, 8, '#d5ff62');
    }
  }
  function still() { scenes.filter(scene => scene.visible).forEach(scene => draw(scene, 0)); }
  function tick(timestamp) {
    frameId = 0; if (!motion || document.hidden) return;
    if (timestamp - last >= 1000 / 30) { last = timestamp; scenes.filter(scene => scene.visible && (scene.kind === 'hero' || scene.active)).forEach(scene => draw(scene, timestamp / 1000)); }
    if (scenes.some(scene => scene.visible && (scene.kind === 'hero' || scene.active))) frameId = requestAnimationFrame(tick);
  }
  function start() { if (!frameId && motion && !document.hidden && scenes.some(scene => scene.visible && (scene.kind === 'hero' || scene.active))) frameId = requestAnimationFrame(tick); }
  const observer = new IntersectionObserver(entries => { for (const entry of entries) { const scene = scenes.find(item => item.element === entry.target); scene.visible = entry.isIntersecting; if (scene.visible) draw(scene, 0); } start(); }, { threshold: .05 });
  for (const scene of scenes) { observer.observe(scene.element); const target = scene.element.closest('.game-card') || scene.element; const activate = () => { scene.active = true; start(); }; const deactivate = () => { scene.active = false; draw(scene, 0); }; target.addEventListener('pointerenter', activate); target.addEventListener('pointerleave', deactivate); target.addEventListener('focusin', activate); target.addEventListener('focusout', event => { if (!target.contains(event.relatedTarget)) deactivate(); }); }
  for (const [name, file] of Object.entries(sources)) { const image = new Image(); image.onload = () => { images[name] = image; still(); start(); }; image.src = base + file; }
  document.fonts.ready.then(still);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frameId); frameId = 0; } else { still(); start(); } });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frameId); frameId = 0; });
  window.addEventListener('pageshow', start);
  return { setMotion(enabled) { motion = enabled; if (!enabled) { cancelAnimationFrame(frameId); frameId = 0; still(); } else start(); } };
}
