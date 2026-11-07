import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT, GAME_SLUGS } from './server.mjs';

let failed = false;
function run(label, args, cwd) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}

const ownTests = (await readdir(path.join(PROJECT_ROOT, 'tests'))).filter(name => name.endsWith('.test.mjs')).sort();
run('Arcade server, launch and delivery tests', ['--test', ...ownTests.map(name => `tests/${name}`)], PROJECT_ROOT);
for (const slug of GAME_SLUGS) {
  const directory = path.join(PROJECT_ROOT, 'games', slug);
  if (slug === 'tempo-rush') {
    const files = (await readdir(path.join(directory, 'tests'))).filter(name => name.endsWith('.test.mjs')).sort();
    run('Tempo Rush inherited tests', ['--test', ...files.map(name => `tests/${name}`)], directory);
  } else {
    for (const file of (await readdir(directory)).filter(name => name.endsWith('-test.cjs')).sort()) run(`${slug}: ${file}`, [file], directory);
  }
}
process.exitCode = failed ? 1 : 0;
