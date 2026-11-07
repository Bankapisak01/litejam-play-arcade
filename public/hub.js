import { createArcadeArt } from './hub-art.js';

const names = { 'tempo-rush': 'Tempo Rush', 'key-battle': 'Key Battle', 'neon-relay': 'Neon Relay' };
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Browsing still works without storage. */ } };
const recent = read('litejam-arcade:last-played');
if (names[recent]) { const link = document.querySelector('#recent-game'); link.textContent = `Back to ${names[recent]} ↗`; link.href = `/games/${recent}/`; link.hidden = false; }
document.addEventListener('click', event => { const play = event.target.closest('[data-play]'); if (play && names[play.dataset.play]) write('litejam-arcade:last-played', play.dataset.play); });

document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  const filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  let count = 0;
  document.querySelectorAll('.game-card').forEach(card => { card.hidden = filter !== 'all' && card.dataset.category !== filter; if (!card.hidden) count++; });
  document.querySelector('#filter-status').textContent = `Showing ${count} ${filter === 'all' ? '' : filter + ' '}game${count === 1 ? '' : 's'}`;
}));

const guides = {
  'tempo-rush': { intro: 'Choose one of two original tracks, then pick Easy or Normal. Press each key as its note reaches the glowing hit line.', controls: [['D F J K', 'Play the four lanes'], ['HOLD', 'Keep the key down for long notes'], ['ESC', 'Pause the track'], ['SPACE / ESC', 'Resume after the countdown']], hint: 'Start on Easy. Listen for the kick and snare, and let the beat guide your hands. Adjust the timing offset in the game if needed.' },
  'key-battle': { intro: 'Type the word on screen, then press Space to send your attack. Choose free practice or a timed battle against Synth Drake.', controls: [['A–Z', 'Type the displayed English word'], ['SPACE', 'Submit your word'], ['BACKSPACE', 'Correct a mistake before submitting'], ['ESC', 'Pause or resume']], hint: 'Check before you send: an incorrect submission triggers a counterattack. Highlighted danger words have a harder hit if their timer runs out.' },
  'neon-relay': { intro: 'Take Punkman across the neon rooftops and face Synth Drake. Land attacks to build your ultimate gauge.', controls: [['A D / ← →', 'Move left and right'], ['S / ↓', 'Crouch'], ['SPACE', 'Jump'], ['J', 'Shoot · hold to charge'], ['X', 'Slash · hold to charge'], ['K', 'Dash'], ['L', 'Ultimate when the gauge is full'], ['P / R', 'Pause / restart']], hint: 'Watch the boss: at half health, Synth Drake enters phase two. Dash through danger, then punish the opening.' }
};
function selectGuide(slug) {
  const guide = guides[slug]; if (!guide) return;
  document.querySelectorAll('[data-guide-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.guideTab === slug)));
  const content = document.querySelector('#guide-content'); content.replaceChildren();
  const intro = document.createElement('p'); intro.textContent = guide.intro; content.append(intro);
  const list = document.createElement('div'); list.className = 'control-list';
  for (const [keys, meaning] of guide.controls) { const row = document.createElement('div'); row.className = 'control-row'; const label = document.createElement('span'); label.textContent = meaning; const group = document.createElement('div'); const key = document.createElement('kbd'); key.textContent = keys; group.append(key); row.append(label, group); list.append(row); }
  content.append(list); const hint = document.createElement('p'); hint.className = 'guide-hint'; hint.textContent = guide.hint; content.append(hint);
  const play = document.querySelector('#guide-play'); play.href = `/games/${slug}/`; play.dataset.play = slug; play.textContent = `Play ${names[slug]} ↗`;
}
function showGuide(slug = 'tempo-rush') { selectGuide(slug); document.querySelector('#guide-dialog').showModal(); }
document.querySelectorAll('[data-guide]').forEach(button => button.addEventListener('click', () => showGuide(button.dataset.guide)));
document.querySelectorAll('[data-guide-tab]').forEach(button => button.addEventListener('click', () => selectGuide(button.dataset.guideTab)));
for (const id of ['guide-open', 'guide-bottom']) document.getElementById(id).addEventListener('click', () => showGuide());
const audio = [...document.querySelectorAll('audio')];
const stopMusic = () => audio.forEach(player => player.pause());
document.querySelector('#music-open').addEventListener('click', () => { audio.forEach(player => { if (!player.getAttribute('src')) player.src = player.dataset.audio; }); document.querySelector('#music-dialog').showModal(); });
audio.forEach(player => player.addEventListener('play', () => audio.filter(other => other !== player).forEach(other => other.pause())));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target !== dialog) return; const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); }));
document.querySelector('#music-dialog').addEventListener('close', stopMusic);
window.addEventListener('pagehide', stopMusic);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMusic(); });

const preference = matchMedia('(prefers-reduced-motion: reduce)');
let motionRequested = read('litejam-arcade:motion') !== 'reduce';
const art = createArcadeArt();
function updateMotion() {
  const enabled = motionRequested && !preference.matches;
  document.documentElement.classList.toggle('reduced-motion', !enabled);
  const button = document.querySelector('#motion-toggle'); button.setAttribute('aria-pressed', String(enabled));
  button.replaceChildren(); const led = document.createElement('span'); led.className = 'motion-led'; led.setAttribute('aria-hidden', 'true'); button.append(led, `Background motion: ${enabled ? 'on' : 'off'}`);
  button.title = preference.matches ? 'Reduced motion is enabled in your system settings' : 'Toggle decorative sprite animation';
  art.setMotion(enabled);
}
document.querySelector('#motion-toggle').addEventListener('click', () => { motionRequested = !motionRequested; write('litejam-arcade:motion', motionRequested ? 'full' : 'reduce'); updateMotion(); });
preference.addEventListener('change', updateMotion); updateMotion();
