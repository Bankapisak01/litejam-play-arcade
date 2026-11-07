const assert = require('node:assert/strict');
const { boot, settle, noop } = require('./tests/browser-harness.cjs');

function sample(game, count = 30) {
  return Array.from({ length: count }, () => { game.tick(); return game.snapshot(); });
}
function assertLivingIdle(samples) {
  assert(new Set(samples.map(s => s.actors.heroFrame)).size >= 3, 'Punkman must animate without a typing or movement event');
  assert.equal(new Set(samples.map(s => s.actors.heroX)).size, 1, 'An idle character must not slide across the platform');
  assert.equal(new Set(samples.map(s => s.actors.heroY)).size, 1, 'The idle pose must remain grounded');
  for (const s of samples) {
    assert.equal(s.elapsed, 0, 'Decorative motion must not start the typing clock');
    assert.equal(s.hp, 5);
    assert.equal(s.bossHp, 100, 'Idle guitar motion must not trigger an attack');
  }
}

(async () => {
  const game = boot({ reducedMotion: false });
  game.load(); await settle();
  assertLivingIdle(sample(game));
  game.el('#start').click();
  assertLivingIdle(sample(game));
  assert.equal(game.snapshot().started, false);

  game.el('#pause').click();
  const frozen = JSON.stringify(game.snapshot().actors);
  for (const s of sample(game)) assert.equal(JSON.stringify(s.actors), frozen, 'Pause must freeze the idle animation');
  game.el('#resume').click();
  assertLivingIdle(sample(game));
  game.document.hidden = true;
  const hidden = JSON.stringify(game.snapshot().actors);
  for (const s of sample(game)) assert.equal(JSON.stringify(s.actors), hidden, 'Hidden tabs must stop animating');
  game.document.hidden = false;

  // Exercise real battle inputs: idle must yield to attack and dodge poses.
  const states = new Set();
  for (let i = 0; i < 300 && game.snapshot().status === 'playing'; i++) {
    const s = game.snapshot();
    if (s.acceptingInput && i % 20 === 0) {
      for (const key of s.target + ' ') game.el('#typing-input').handlers.keydown({ key, preventDefault: noop });
    }
    game.tick(); states.add(game.snapshot().actors.heroState);
  }
  assert(states.has('shoot') || states.has('special'), 'Battle attacks must take precedence over idle');
  assert(states.has('dash'), 'A successful defense must retain its dodge animation');
  assert(states.has('slash'), 'Counterattacks must retain their slash animation');

  const reduced = boot({ reducedMotion: true });
  reduced.load(); await settle();
  const still = sample(reduced);
  assert.equal(new Set(still.map(s => JSON.stringify(s.actors))).size, 1, 'Reduced motion must keep decorative actor animation still');
  console.log('PASS: ready/waiting Punkman animates on the ground without starting clocks or attacks; Pause, hidden tabs, reduced motion and combat poses stay intact.');
})().catch(error => { console.error(error); process.exitCode = 1; });
