import { readdir, readFile, mkdir, open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { PROJECT_ROOT, GAME_SLUGS } from './server.mjs';
import { validateProject } from './build.mjs';

const ROOT_FILES = new Set(['README.md', 'AGENTS.md', 'package.json', 'package-lock.json', '.gitignore', '.gitattributes', 'Start Arcade.cmd', 'Stop Arcade.cmd']);
const EXTENSIONS = new Set(['.md', '.txt', '.json', '.html', '.css', '.js', '.mjs', '.cjs', '.ps1', '.cmd', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.wav', '.mp3', '.ogg', '.woff', '.woff2', '.ttf']);
const EXCLUDED = /^(?:node_modules|runtime|releases?|old|backup|backups|coverage|test-results|playwright-report)$/i;

export async function collectSourceFiles(root = PROJECT_ROOT) {
  const files = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Refusing to package a symlink: ${relative}`);
      if (!prefix && ROOT_FILES.has(entry.name) && entry.isFile()) {
        files.push({ relative, absolute: path.join(directory, entry.name) });
        continue;
      }
      if (entry.name.startsWith('.') || EXCLUDED.test(entry.name) || /^(?:(?:credentials?|secrets?|(?:access[-_])?tokens?)\.(?:json|txt|env)|id_rsa)/i.test(entry.name)) continue;
      const parts = relative.split('/');
      if (!['public', 'games', 'scripts', 'tests', 'docs'].includes(parts[0])) continue;
      if (parts[0] === 'games' && parts.length > 1 && !GAME_SLUGS.includes(parts[1])) continue;
      if (parts[0] === 'games' && parts.length > 2 && !['dist', 'tests'].includes(parts[2]) && !(parts.length === 3 && (entry.name.endsWith('-test.cjs') || entry.name === 'package.json'))) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile() && (EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || entry.name === 'LICENSE')) files.push({ relative, absolute });
    }
  }
  await walk(root);
  return files.sort((left, right) => left.relative.localeCompare(right.relative));
}

export async function verifyRuntime(directory) {
  const node = await readFile(path.join(directory, 'node.exe'));
  const manifest = await readFile(path.join(directory, 'SHASUMS256.txt'), 'utf8');
  const license = await readFile(path.join(directory, 'LICENSE'), 'utf8');
  const checksum = manifest.split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+\*?win-x64\/node\.exe\s*$/i.exec(line)).find(Boolean)?.[1]?.toLowerCase();
  const sha256 = createHash('sha256').update(node).digest('hex');
  if (!checksum || checksum !== sha256) throw new Error('Node runtime checksum does not match SHASUMS256.txt (win-x64/node.exe).');
  if (!license.trim()) throw new Error('The Node runtime LICENSE is missing or empty.');
  return { sha256, manifest, license };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export async function writeZip(destination, files) {
  const output = await open(destination, 'wx');
  const directory = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  async function append(bytes) {
    let position = 0;
    while (position < bytes.length) {
      const { bytesWritten } = await output.write(bytes, position, bytes.length - position);
      position += bytesWritten;
    }
    offset += bytes.length;
  }
  try {
    for (const file of files) {
      if (file.relative.startsWith('/') || file.relative.split('/').includes('..') || file.relative.includes('\\')) throw new Error(`Unsafe ZIP entry: ${file.relative}`);
      const name = Buffer.from(file.relative, 'utf8');
      const bytes = file.data ?? await readFile(file.absolute);
      const compressed = deflateRawSync(bytes, { level: 6 });
      const crc = crc32(bytes);
      if (offset + compressed.length > 0xffffffff || name.length > 65535) throw new Error('Archive exceeds the supported ZIP size.');
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14);
      central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24);
      central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
      directory.push(central, name);
      await append(local); await append(name); await append(compressed);
    }
    const directoryOffset = offset;
    for (const bytes of directory) await append(bytes);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(offset - directoryOffset, 12); end.writeUInt32LE(directoryOffset, 16);
    await append(end);
  } finally { await output.close(); }
}

async function packageProject() {
  const args = process.argv.slice(2);
  const argument = name => {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Provide a path after ${name}.`);
    return path.resolve(args[index + 1]);
  };
  for (let index = 0; index < args.length; index += 2) if (!['--runtime-dir', '--out-dir'].includes(args[index])) throw new Error('Use: npm run package -- [--runtime-dir PATH] [--out-dir PATH]');
  const runtimeDirectory = argument('--runtime-dir');
  const outputDirectory = argument('--out-dir') || path.join(PROJECT_ROOT, 'releases');
  const { errors, count } = await validateProject();
  if (errors.length) throw new Error(`Validation failed:\n${errors.join('\n')}`);
  const source = await collectSourceFiles();
  for (const required of ['README.md', 'package.json', 'Start Arcade.cmd', 'Stop Arcade.cmd', 'public/index.html']) if (!source.some(file => file.relative === required)) throw new Error(`Required handoff file is missing: ${required}`);
  const runtime = runtimeDirectory ? await verifyRuntime(runtimeDirectory) : null;
  if (runtime && runtime.sha256 !== '9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52de') throw new Error('The portable package expects the verified Node.js 24.18.0 Windows x64 runtime. Its SHA-256 does not match the pinned release.');
  await mkdir(outputDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const base = `LiteJam-Play-Arcade-${stamp}`;
  const archives = [];
  const sourcePath = path.join(outputDirectory, `${base}-source.zip`);
  const sourceEntries = source.map(file => ({ ...file, relative: `LiteJam-Play-Arcade/${file.relative}` }));
  await writeZip(sourcePath, sourceEntries);
  archives.push(sourcePath);
  if (runtime) {
    const provenance = {
      name: 'Node.js', version: '24.18.0', platform: 'Windows x64',
      source: 'https://nodejs.org/dist/v24.18.0/win-x64/node.exe',
      checksumSource: 'https://nodejs.org/dist/v24.18.0/SHASUMS256.txt',
      sha256: runtime.sha256,
      verification: 'SHA-256 of node.exe matched win-x64/node.exe in the supplied, previously verified SHASUMS256.txt before packaging.',
      license: 'See runtime/LICENSE. This license covers Node.js and its included third-party components, not the Arcade application or media.',
    };
    const runtimeEntries = ['node.exe', 'SHASUMS256.txt', 'LICENSE'].map(name => ({ relative: `LiteJam-Play-Arcade/runtime/${name}`, absolute: path.join(runtimeDirectory, name) }));
    runtimeEntries.push({ relative: 'LiteJam-Play-Arcade/runtime/provenance.json', data: Buffer.from(JSON.stringify(provenance, null, 2) + '\n') });
    const portablePath = path.join(outputDirectory, `${base}-windows-x64.zip`);
    await writeZip(portablePath, [...sourceEntries, ...runtimeEntries]);
    archives.push(portablePath);
  }
  const sums = [];
  for (const archive of archives) {
    const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
    sums.push(`${sha256}  ${path.basename(archive)}`);
    console.log(archive);
  }
  await writeFile(path.join(outputDirectory, `${base}-SHA256SUMS.txt`), sums.join('\n') + '\n');
  console.log(`Packaged ${source.length} source files after validating ${count} runtime files. ${runtime ? 'Windows runtime checksum verified; license and provenance included.' : 'For a Windows portable ZIP, add --runtime-dir PATH containing node.exe, SHASUMS256.txt and LICENSE.'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) packageProject().catch(error => { console.error(error.message); process.exitCode = 1; });
