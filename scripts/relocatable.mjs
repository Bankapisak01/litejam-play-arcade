/** Build dist-web/: the arcade as a relocatable static folder (every link relative, no leading slash),
 *  for hosting under any sub-path such as a claude.ai artifact. Source of truth stays public/ and games/<slug>/dist. */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT, GAME_SLUGS } from './server.mjs';

const TEXT = new Set(['.html', '.css', '.js', '.mjs']);
const slugs = GAME_SLUGS.join('|');

/** Rewrite root-absolute references for a file that will live `depth` folders below the output root. */
export function relocate(text, depth, filename) {
  const up = '../'.repeat(depth);
  if (filename === 'arcade-shell.js') {
    // Runs inside games/<slug>/ pages: image paths are page-relative, and the route regex loses its anchor.
    return text.replace('/^\\/games\\/', '/\\/games\\/').replace(/(['"])\/assets\//g, '$1../../assets/');
  }
  return text
    .replace(/href="\/"/g, `href="${up}index.html"`)
    .replace(/(["'(])\/(assets|shared)\//g, `$1${up}$2/`)
    .replace(/(["'])\/(hub\.css|hub\.js)/g, `$1${up}$2`)
    .replace(new RegExp(`"/games/(${slugs})/"`, 'g'), `"${up}games/$1/index.html"`)
    .replace(/`\/games\/\$\{(\w+)\}\/`/g, '`' + up + 'games/${$1}/index.html`')
    .replace(/(['"])\/games\/([^'"]+)\1/g, `$1${up}games/$2$1`);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const file = path.join(dir, entry.name);
    out.push(...(entry.isDirectory() ? await walk(file) : [file]));
  }
  return out;
}

export async function buildRelocatable(target = path.join(PROJECT_ROOT, 'dist-web')) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(path.join(PROJECT_ROOT, 'public'), target, { recursive: true });
  for (const slug of GAME_SLUGS) await cp(path.join(PROJECT_ROOT, 'games', slug, 'dist'), path.join(target, 'games', slug), { recursive: true });
  let rewritten = 0;
  for (const file of await walk(target)) {
    if (!TEXT.has(path.extname(file).toLowerCase())) continue;
    const relative = path.relative(target, file), depth = relative.split(path.sep).length - 1;
    const text = await readFile(file, 'utf8'), next = relocate(text, depth, path.basename(file));
    if (next !== text) { await writeFile(file, next); rewritten++; }
    if (/(["'(])\/(assets|shared|games|hub\.)/.test(next)) throw new Error(`Absolute runtime reference left in ${relative}`);
  }
  return { target, rewritten, files: (await walk(target)).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildRelocatable(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`Relocatable build: ${result.files} files in ${result.target} (${result.rewritten} rewritten).`);
}
