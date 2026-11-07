import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startArcadeServer, PROJECT_ROOT, DEFAULT_PORTS } from './server.mjs';

export async function runServerProcess(root = PROJECT_ROOT, ports = DEFAULT_PORTS, token) {
  const app = await startArcadeServer({ root, ports, token });
  const statePath = path.join(app.root, '.arcade', 'state.json');
  await mkdir(path.dirname(statePath), { recursive: true });
  try {
    await writeFile(statePath, JSON.stringify({ application: 'litejam-play-arcade', instance: app.instance, pid: process.pid, port: app.port, token: app.token }, null, 2));
  } catch (error) { await app.close(); throw error; }
  app.server.once('close', async () => {
    try {
      const current = JSON.parse(await readFile(statePath, 'utf8'));
      if (current.token === app.token) await rm(statePath, { force: true });
    } catch { /* State was already removed, or belongs to a new launch. */ }
  });
  const shutdown = () => { app.close(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log(`LiteJam Play: Arcade is ready at ${app.url}`);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runServerProcess(process.argv[2] || PROJECT_ROOT, process.env.LITEJAM_PORTS ? JSON.parse(process.env.LITEJAM_PORTS) : DEFAULT_PORTS, process.env.LITEJAM_TOKEN)
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
