import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GAME_SLUGS = ['neon-relay', 'key-battle', 'tempo-rush'];
export const DEFAULT_PORTS = Array.from({ length: 10 }, (_, index) => 8790 + index);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

export async function instanceId(root) {
  const canonical = await realpath(root);
  return createHash('sha256').update(process.platform === 'win32' ? canonical.toLowerCase() : canonical).digest('hex');
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function respond(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

function validToken(value, token) {
  return typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(token)
    && timingSafeEqual(Buffer.from(value), Buffer.from(token));
}

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  let start;
  let end;
  if (!match[1]) {
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count) || count < 1) return null;
    start = Math.max(0, size - count);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

export async function startArcadeServer({ root = PROJECT_ROOT, ports = DEFAULT_PORTS, token = randomBytes(32).toString('hex') } = {}) {
  root = await realpath(root);
  const instance = await instanceId(root);
  const roots = new Map([['/', await realpath(path.join(root, 'public'))]]);
  for (const slug of GAME_SLUGS) roots.set(`/games/${slug}/`, await realpath(path.join(root, 'games', slug, 'dist')));
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (![expectedHost, `localhost:${server.address().port}`].includes(req.headers.host)) return respond(res, 403, 'Local requests only.');
    let pathname;
    try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
    catch { return respond(res, 400, 'Invalid path encoding.'); }
    if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\x00-\x1f:%]/.test(pathname)
      || pathname.split('/').some(part => part.startsWith('.'))) return respond(res, 403, 'Path not allowed.');
    if (pathname.startsWith('/__arcade/')) {
      const origin = req.headers.origin;
      if (!validToken(req.headers['x-arcade-token'], token) || (origin && origin !== `http://${req.headers.host}`)) return respond(res, 403, 'Instance authentication required.');
      if (pathname === '/__arcade/status' && req.method === 'GET') {
        return respond(res, 200, JSON.stringify({ application: 'litejam-play-arcade', instance, pid: process.pid }), { 'Content-Type': 'application/json; charset=utf-8' });
      }
      if (pathname === '/__arcade/stop' && req.method === 'POST') {
        respond(res, 200, 'Arcade stopped.');
        setImmediate(() => { server.close(); server.closeIdleConnections(); });
        return;
      }
      return respond(res, 404, 'Not found.');
    }
    if (!['GET', 'HEAD'].includes(req.method)) return respond(res, 405, 'GET or HEAD required.', { Allow: 'GET, HEAD' });
    let route = '/';
    if (pathname === '/games' || pathname.startsWith('/games/')) {
      const slug = pathname.split('/')[2];
      if (!GAME_SLUGS.includes(slug)) return respond(res, 404, 'Not found.');
      route = `/games/${slug}/`;
      if (pathname === route.slice(0, -1)) return respond(res, 308, 'Redirecting.', { Location: route });
    }
    const base = roots.get(route);
    const relative = pathname.slice(route.length);
    const filename = path.resolve(base, relative || 'index.html');
    if (!inside(base, filename)) return respond(res, 403, 'Path not allowed.');
    try {
      const actual = await realpath(filename);
      if (!inside(base, actual)) return respond(res, 403, 'Path not allowed.');
      const info = await stat(actual);
      if (!info.isFile()) return respond(res, 404, 'Not found.');
      const headers = {
        'Content-Type': MIME[path.extname(actual).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
      };
      let range;
      if (req.headers.range) {
        range = byteRange(req.headers.range, info.size);
        if (!range) return respond(res, 416, 'Range not satisfiable.', { 'Content-Range': `bytes */${info.size}` });
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
        headers['Content-Length'] = range.end - range.start + 1;
      }
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(actual, range || {});
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      respond(res, ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500, 'File unavailable.');
    }
  });
  let lastError;
  for (const port of ports) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
      });
      const chosenPort = server.address().port;
      return { server, root, instance, token, port: chosenPort, url: `http://127.0.0.1:${chosenPort}/`,
        close: () => new Promise(resolve => { server.close(() => resolve()); server.closeIdleConnections(); }) };
    } catch (error) {
      lastError = error;
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error(`No free Arcade port (${ports.join(', ')}). Close an unused instance or try again.`, { cause: lastError });
}
