import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateProject } from '../scripts/build.mjs';

test('validation catches broken local references and invalid runtime JSON', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'litejam-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['public', ...['neon-relay', 'key-battle', 'tempo-rush'].map(slug => `games/${slug}/dist`)]) {
    await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(path.join(root, dir, 'index.html'), '<h1>Fixture</h1>');
  }
  assert.deepEqual((await validateProject(root)).errors, []);
  await writeFile(path.join(root, 'public', 'index.html'), '<a href="https://example.com/project">Project</a>');
  assert.deepEqual((await validateProject(root)).errors, [], 'External navigation is allowed; only runtime resources must remain local.');
  await writeFile(path.join(root, 'public', 'index.html'), '<img src="missing.png">');
  await writeFile(path.join(root, 'public', 'bad.json'), '{broken');
  const result = await validateProject(root);
  assert.ok(result.errors.some(error => error.includes('missing.png')));
  assert.ok(result.errors.some(error => error.includes('bad.json')));
});
