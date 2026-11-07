import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startManaged, stopManaged } from '../scripts/launcher.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'litejam launch '));
  t.after(async () => { await stopManaged(root); await rm(root, { recursive: true, force: true }); });
  for (const dir of ['public', ...['neon-relay', 'key-battle', 'tempo-rush'].map(slug => `games/${slug}/dist`)]) {
    await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(path.join(root, dir, 'index.html'), '<h1>Fixture</h1>');
  }
  return root;
}

test('simultaneous launches reuse the same root and stop only that verified instance', async t => {
  const root = await fixture(t);
  const results = await Promise.all([startManaged(root, { ports: [0] }), startManaged(root, { ports: [0] })]);
  assert.equal(results[0].url, results[1].url);
  assert.equal(results.filter(item => item.reused).length, 1);
  assert.equal((await fetch(results[0].url)).status, 200);
  assert.equal(await stopManaged(root), true);
  assert.equal(await stopManaged(root), false);
});

test('copied state from a different root never reuses or stops that server', async t => {
  const first = await fixture(t);
  const second = await fixture(t);
  const running = await startManaged(first, { ports: [0] });
  await mkdir(path.join(second, '.arcade'), { recursive: true });
  await writeFile(path.join(second, '.arcade', 'state.json'), await readFile(path.join(first, '.arcade', 'state.json')));
  assert.equal(await stopManaged(second), false);
  assert.equal((await fetch(running.url)).status, 200);
  const another = await startManaged(second, { ports: [0] });
  assert.notEqual(another.url, running.url);
  assert.equal(another.reused, false);
  assert.equal((await fetch(running.url)).status, 200);
});
