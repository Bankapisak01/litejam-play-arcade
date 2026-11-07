import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { startArcadeServer, PROJECT_ROOT, GAME_SLUGS } from './server.mjs';

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Runtime symlinks are not portable: ${filename}`);
    if (entry.isDirectory()) files.push(...await walk(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

function references(text, extension) {
  const result = [];
  if (extension === '.html') {
    for (const tag of text.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)) {
      for (const match of tag[0].matchAll(/\b(src|href|poster)\s*=\s*["']([^"']+)["']/gi)) {
        if (tag[1].toLowerCase() === 'a' && match[1].toLowerCase() === 'href' && /^(?:https?:)?\/\//i.test(match[2])) continue;
        result.push(match[2]);
      }
    }
  }
  if (extension === '.css' || extension === '.html') {
    for (const match of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) result.push(match[1]);
  }
  if (['.js', '.mjs'].includes(extension)) {
    for (const match of text.matchAll(/(?:import\s*(?:[^;\n]*?from\s*)?|export\s+[^;\n]*?from\s*)["']([^"']+)["']/g)) result.push(match[1]);
    for (const match of text.matchAll(/["']((?:\/|\.\/|\.\.\/|assets\/|audio\/|charts\/)[^"'\n]+\.(?:png|jpg|webp|gif|svg|wav|mp3|json|woff2?))["']/g)) result.push(match[1]);
  }
  return [...new Set(result)].filter(ref => !ref.startsWith('#') && !/^(?:data|mailto|tel):/i.test(ref) && !ref.includes('${'));
}

export async function validateProject(root = PROJECT_ROOT) {
  const errors = [];
  let count = 0;
  const app = await startArcadeServer({ root, ports: [0] });
  try {
    const routes = [['/', path.join(root, 'public')], ...GAME_SLUGS.map(slug => [`/games/${slug}/`, path.join(root, 'games', slug, 'dist')])];
    for (const [route, directory] of routes) {
      const home = await fetch(`${app.url.slice(0, -1)}${route}`);
      if (!home.ok) errors.push(`Missing entrypoint: ${route} (${home.status})`);
      await home.arrayBuffer();
      for (const file of await walk(directory)) {
        count++;
        const relative = path.relative(directory, file).split(path.sep).join('/');
        const url = new URL(route + relative, app.url);
        const res = await fetch(url, { method: 'HEAD' });
        if (!res.ok) errors.push(`Runtime file is not served: ${url.pathname} (${res.status})`);
        const ext = path.extname(file).toLowerCase();
        if (['.html', '.css', '.js', '.mjs', '.json'].includes(ext)) {
          const text = await readFile(file, 'utf8');
          if (ext === '.json') {
            try { JSON.parse(text); } catch { errors.push(`Invalid JSON: ${url.pathname}`); }
          }
          if (['.js', '.mjs'].includes(ext)) {
            const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
            if (check.status !== 0) errors.push(`JavaScript syntax error: ${url.pathname}\n${check.stderr}`);
          }
          for (const ref of references(text, ext)) {
            // Image/audio/chart literals in game JS are document-relative; imports are module-relative.
            const base = ['.js', '.mjs'].includes(ext) && /^(?:assets|audio|charts)\//.test(ref) ? new URL(route, app.url) : url;
            const target = new URL(ref, base);
            if (target.origin !== new URL(app.url).origin) {
              errors.push(`External runtime reference in ${url.pathname}: ${ref}`);
              continue;
            }
            const linked = await fetch(target, { method: 'HEAD' });
            if (!linked.ok) errors.push(`Broken reference in ${url.pathname}: ${ref} (${linked.status})`);
          }
        }
        if (ext === '.wav') {
          const sample = await fetch(url, { headers: { Range: 'bytes=0-11' } });
          const header = Buffer.from(await sample.arrayBuffer());
          if (sample.status !== 206 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') errors.push(`Invalid WAV or range response: ${url.pathname}`);
        }
      }
    }
  } finally { await app.close(); }
  return { count, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  validateProject().then(({ count, errors }) => {
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log(`Validated ${count} local runtime files, all four entry routes, static references, JavaScript/JSON syntax and WAV ranges. No bundling or downloads required.`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
