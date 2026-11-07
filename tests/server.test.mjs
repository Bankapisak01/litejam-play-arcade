import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startArcadeServer } from '../scripts/server.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'litejam-server-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    'public/index.html': '<h1>Arcade fixture</h1>',
    'public/app.js': 'console.log("local")',
    'public/.private': 'secret',
    'docs/private.txt': 'secret',
    'games/neon-relay/dist/index.html': '<h1>Neon</h1>',
    'games/key-battle/dist/index.html': '<h1>Keys</h1>',
    'games/tempo-rush/dist/index.html': '<h1>Tempo</h1>',
    'games/tempo-rush/dist/audio/test.wav': 'RIFF0123456789WAVE',
    'games/tempo-rush/tests/private.mjs': 'secret',
  };
  for (const [name, value] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), value);
  }
  const app = await startArcadeServer({ root, ports: [0], token: 'fixture-secret-token' });
  t.after(() => app.close());
  return { root, app };
}

function request(app, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: app.port, path: pathname, ...options }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves the hub and three isolated game routes with browser MIME types', async t => {
  const { app } = await fixture(t);
  for (const [route, content] of [['/', 'Arcade fixture'], ['/games/neon-relay/', 'Neon'], ['/games/key-battle/', 'Keys'], ['/games/tempo-rush/', 'Tempo']]) {
    const res = await request(app, route);
    assert.equal(res.status, 200, route);
    assert.match(res.body, new RegExp(content));
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  }
  assert.match((await request(app, '/app.js')).headers['content-type'], /javascript/);
  assert.equal((await request(app, '/games/neon-relay')).headers.location, '/games/neon-relay/');
  assert.equal((await request(app, '/app.js', { method: 'HEAD' })).body, '');
});

test('rejects traversal, private paths, malformed encoding, and unknown routes', async t => {
  const { app } = await fixture(t);
  for (const route of ['/../docs/private.txt', '/%2e%2e/docs/private.txt', '/games/tempo-rush/%2e%2e/tests/private.mjs', '/%252e%252e/docs/private.txt', '/%5c..%5cdocs%5cprivate.txt', '/C:/Windows/win.ini', '/%00', '/%E0%A4%A', '/.private', '/docs/private.txt', '/runtime/node.exe', '/games/unknown/']) {
    const res = await request(app, route);
    assert.ok([400, 403, 404].includes(res.status), `${route}: ${res.status}`);
    assert.ok(!res.body.includes('secret'), route);
  }
  assert.equal((await request(app, '/', { method: 'POST' })).status, 405);
  assert.equal((await request(app, '/', { headers: { Host: 'attacker.example' } })).status, 403);
});

test('real paths cannot escape a served directory through a junction', async t => {
  const { app, root } = await fixture(t);
  await symlink(path.join(root, 'docs'), path.join(root, 'public', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const res = await request(app, '/escape/private.txt');
  assert.equal(res.status, 403);
});

test('WAV ranges return exact bytes and invalid or multiple ranges return 416', async t => {
  const { app } = await fixture(t);
  const route = '/games/tempo-rush/audio/test.wav';
  const full = await request(app, route);
  assert.equal(full.headers['content-type'], 'audio/wav');
  assert.equal(full.headers['accept-ranges'], 'bytes');
  for (const [range, body, contentRange] of [['bytes=0-3', 'RIFF', 'bytes 0-3/18'], ['bytes=14-', 'WAVE', 'bytes 14-17/18'], ['bytes=-4', 'WAVE', 'bytes 14-17/18']]) {
    const res = await request(app, route, { headers: { Range: range } });
    assert.equal(res.status, 206);
    assert.equal(res.body, body);
    assert.equal(res.headers['content-range'], contentRange);
    assert.equal(res.headers['content-length'], '4');
  }
  for (const range of ['bytes=99-', 'bytes=4-2', 'bytes=0-1,3-4', 'bytes=-0', 'invalid']) {
    const res = await request(app, route, { headers: { Range: range } });
    assert.equal(res.status, 416, range);
    assert.equal(res.headers['content-range'], 'bytes */18');
  }
});

test('an occupied preferred port falls back without disturbing its listener', async t => {
  const { root, app } = await fixture(t);
  const fallback = await startArcadeServer({ root, ports: [app.port, 0] });
  t.after(() => fallback.close());
  assert.notEqual(fallback.port, app.port);
  assert.equal((await request(app, '/')).status, 200);
  assert.equal((await request(fallback, '/')).status, 200);
});

test('instance status and shutdown require a private token and reject foreign origins', async t => {
  const { app } = await fixture(t);
  assert.equal((await request(app, '/__arcade/status')).status, 403);
  assert.equal((await request(app, '/__arcade/stop', { method: 'POST', headers: { 'X-Arcade-Token': 'wrong' } })).status, 403);
  const headers = { 'X-Arcade-Token': 'fixture-secret-token' };
  const status = await request(app, '/__arcade/status', { headers });
  assert.equal(status.status, 200);
  assert.equal(JSON.parse(status.body).application, 'litejam-play-arcade');
  assert.equal((await request(app, '/__arcade/stop', { method: 'POST', headers: { ...headers, Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await request(app, '/')).status, 200);
  assert.equal((await request(app, '/__arcade/stop', { method: 'POST', headers })).status, 200);
});
