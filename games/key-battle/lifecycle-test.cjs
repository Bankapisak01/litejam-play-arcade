const assert = require('node:assert/strict');
const { boot, settle, noop } = require('./tests/browser-harness.cjs');

(async () => {
  const navigation = boot(); navigation.load(); await settle();
  for (const status of ['ready', 'paused']) {
    if (status === 'paused') { navigation.el('#start').click(); navigation.el('#pause').click(); }
    assert.equal(navigation.snapshot().status, status);
    for (const tag of ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']) {
      const target = navigation.el(tag === 'A' ? '.arcade-game-nav' : tag); target.tagName = tag;
      let prevented = false;
      navigation.emitDocument('keydown', { key: 'Enter', target, preventDefault() { prevented = true; } });
      assert.equal(prevented, false, `${tag} Enter must retain native keyboard behavior in ${status}`);
      assert.equal(navigation.snapshot().status, status, `${tag} Enter must not start or resume gameplay`);
    }
  }
  navigation.el('#session-menu').handlers.cancel({ preventDefault: noop });
  assert.equal(navigation.snapshot().status, 'playing', 'Native Escape must resume from the modal menu');
  let gameplayPrevented = false;
  navigation.emitDocument('keydown', { key: 'Escape', target: navigation.el('#typing-input'), preventDefault() { gameplayPrevented = true; } });
  assert.equal(gameplayPrevented, true, 'Escape still controls the gameplay field');
  assert.equal(navigation.snapshot().status, 'paused', 'Escape from the typing field still pauses play');
  console.log('PASS: native Enter works on Arcade links and form controls in ready and paused states; typing Escape pauses and native dialog Escape resumes.');

  const active = boot(); active.load(); await settle(); active.el('#sound').click(); active.el('#start').click();
  const input = active.el('#typing-input');
  input.handlers.keydown({ key: active.snapshot().target[0], preventDefault: noop }); active.tick();
  assert.equal(active.snapshot().status, 'playing');
  active.emit('pagehide'); const elapsed = active.snapshot().elapsed, scheduled = active.scheduled;
  active.tick(); active.el('#start').click();
  assert.equal(active.snapshot().status, 'paused', 'Leaving the page must pause active gameplay');
  assert.equal(active.snapshot().elapsed, elapsed, 'A queued frame must not advance a departed game');
  assert.equal(active.scheduled, scheduled, 'A departed game must not schedule another frame');
  assert.equal(active.closed, 1, 'Leaving must close the active Web Audio context');
  assert.equal(input.disabled, true, 'A departed game must disable typing');
  active.emit('pageshow', { persisted: true }); assert.equal(active.reloaded, 1, 'A cached page returns as a fresh game');

  const loading = boot(); loading.emit('pagehide'); loading.load(); await settle(); loading.el('#start').click();
  assert.equal(loading.el('#start').disabled, true, 'Late sprite loads must not enable a departed game');
  assert.equal(loading.snapshot().status, 'ready', 'Late readiness must not start an obsolete session');
  console.log('PASS: navigation pauses play, closes audio, stops frames, rejects late readiness and resets cached pages.');
})().catch(error => { console.error(error); process.exitCode = 1; });
