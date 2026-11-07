import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { collectSourceFiles, verifyRuntime, writeZip } from '../scripts/package.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'litejam-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('source packaging includes intended source but excludes runtime, output, secrets and unrelated media', async t => {
  const root = await fixture(t);
  for (const file of ['README.md', 'package.json', 'public/index.html', 'public/tokens.css', 'games/neon-relay/dist/index.html', 'games/neon-relay/smoke-test.cjs', 'runtime/node.exe', 'releases/demo.zip', '.arcade/state.json', 'public/.env', 'public/credentials.json', 'public/model.glb', 'node_modules/something/index.js', 'games/old-work/notes.md']) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'fixture');
  }
  const files = await collectSourceFiles(root);
  assert.deepEqual(files.map(item => item.relative).sort(), ['README.md', 'games/neon-relay/dist/index.html', 'games/neon-relay/smoke-test.cjs', 'package.json', 'public/index.html', 'public/tokens.css']);
});

test('runtime verification rejects an executable that differs from its checksum manifest', async t => {
  const root = await fixture(t);
  const bytes = Buffer.from('MZ fixture runtime');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(root, 'node.exe'), bytes);
  await writeFile(path.join(root, 'SHASUMS256.txt'), `${checksum}  win-x64/node.exe\n`);
  await writeFile(path.join(root, 'LICENSE'), 'Runtime license fixture');
  assert.equal((await verifyRuntime(root)).sha256, checksum);
  await writeFile(path.join(root, 'node.exe'), 'tampered');
  await assert.rejects(verifyRuntime(root), /checksum/i);
});

test('ZIP writer emits portable deflated entries with original payload and central directory', async t => {
  const root = await fixture(t);
  const output = path.join(root, 'demo.zip');
  await writeZip(output, [{ relative: 'Arcade/hello.txt', data: Buffer.from('Hello Arcade!') }]);
  const zip = await readFile(output);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt16LE(8), 8);
  const size = zip.readUInt32LE(18);
  const nameLength = zip.readUInt16LE(26);
  assert.equal(zip.subarray(30, 30 + nameLength).toString(), 'Arcade/hello.txt');
  assert.equal(inflateRawSync(zip.subarray(30 + nameLength, 30 + nameLength + size)).toString(), 'Hello Arcade!');
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 1);
});
