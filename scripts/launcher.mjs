import { mkdir, readFile, writeFile, rm, stat, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { instanceId, PROJECT_ROOT, DEFAULT_PORTS } from './server.mjs';
import { runServerProcess } from './server-process.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const statePath = root => path.join(root, '.arcade', 'state.json');

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

function callInstance(state, route, method = 'GET') {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port: state.port, path: route, method,
      headers: { 'X-Arcade-Token': state.token }, timeout: 700 }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
      res.on('end', () => resolve(res.statusCode === 200 ? body : null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function runningInstance(root) {
  try {
    const state = JSON.parse(await readFile(statePath(root), 'utf8'));
    const instance = await instanceId(root);
    if (state.application !== 'litejam-play-arcade' || state.instance !== instance
      || !Number.isInteger(state.port) || state.port < 1 || state.port > 65535
      || typeof state.token !== 'string' || !/^[a-f0-9]{64}$/.test(state.token)) return null;
    const status = JSON.parse(await callInstance(state, '/__arcade/status'));
    return status?.application === state.application && status.instance === instance && status.pid === state.pid ? state : null;
  } catch { return null; }
}

async function withLock(root, action) {
  const directory = path.join(root, '.arcade');
  const lock = path.join(directory, 'launcher.lock');
  await mkdir(directory, { recursive: true });
  const deadline = Date.now() + 15000;
  while (true) {
    try {
      const handle = await open(lock, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = Number(await readFile(lock, 'utf8'));
        const age = Date.now() - (await stat(lock)).mtimeMs;
        let alive = false;
        if (Number.isInteger(owner) && owner > 0) {
          try { process.kill(owner, 0); alive = true; } catch (probe) { alive = probe.code !== 'ESRCH'; }
        }
        if (!alive && age > 1000) { await rm(lock, { force: true }); continue; }
      } catch { /* Another launcher released the lock. */ }
      if (Date.now() > deadline) throw new Error('Another Arcade launch is still in progress. Please retry in a moment.');
      await delay(100);
    }
  }
  try { return await action(); }
  finally { await rm(lock, { force: true }); }
}

export async function startManaged(root = PROJECT_ROOT, { ports = DEFAULT_PORTS, foreground = false } = {}) {
  return withLock(root, async () => {
    const existing = await runningInstance(root);
    if (existing) return { url: `http://127.0.0.1:${existing.port}/`, reused: true };
    const token = randomBytes(32).toString('hex');
    if (foreground) {
      const app = await runServerProcess(root, ports, token);
      return { url: app.url, reused: false };
    }
    const log = await open(path.join(root, '.arcade', 'server.log'), 'a');
    let child;
    try {
      child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'scripts', 'server-process.mjs'), root], {
        cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
        env: { ...process.env, LITEJAM_TOKEN: token, LITEJAM_PORTS: JSON.stringify(ports) },
      });
    } finally { await log.close(); }
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.unref();
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      const current = await runningInstance(root);
      if (current?.token === token) return { url: `http://127.0.0.1:${current.port}/`, reused: false };
      if (child.exitCode !== null) break;
      await delay(100);
    }
    throw new Error(`Arcade did not start. Check ${path.join(root, '.arcade', 'server.log')}. Ports 8790–8799 may be occupied.`);
  });
}

export async function stopManaged(root = PROJECT_ROOT) {
  return withLock(root, async () => {
    const running = await runningInstance(root);
    if (!running) return false;
    if (await callInstance(running, '/__arcade/stop', 'POST') === null) return false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (!await runningInstance(root) && !processAlive(running.pid)) return true;
      await delay(100);
    }
    throw new Error('Arcade is still finishing a request. Close its browser tab and try Stop Arcade again.');
  });
}

function openBrowser(url) {
  // The URL is generated locally from a validated numeric port.
  const command = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const command = process.argv[2] || 'start';
  const task = command === 'stop' ? stopManaged().then(stopped => console.log(stopped ? 'LiteJam Play: Arcade stopped.' : 'No verified Arcade instance is running for this folder.'))
    : command === 'start' ? startManaged(PROJECT_ROOT, { foreground: process.argv.includes('--foreground') }).then(result => {
      console.log(`${result.reused ? 'Reusing' : 'Ready:'} LiteJam Play: Arcade — ${result.url}`);
      if (!process.argv.includes('--no-open')) openBrowser(result.url);
    }) : Promise.reject(new Error('Use: node scripts/launcher.mjs start|stop [--foreground] [--no-open]'));
  task.catch(error => { console.error(error.message); process.exitCode = 1; });
}
