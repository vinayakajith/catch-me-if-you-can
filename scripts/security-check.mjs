import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const git = (args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 64 * 1024 * 1024 });
let exact = [];
try { const env = parseEnv(await readFile(`${root}/.env`, 'utf8')); exact = [env.OPENAI_API_KEY].filter(key => key?.length >= 20); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const patterns = [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/, /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const findings = [], inspect = (bytes, label) => { const text = bytes.toString('utf8'); if (patterns.some(p => p.test(text)) || exact.some(key => text.includes(key))) findings.push(label); };
const files = [...new Set(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean))];
for (const file of files) {
  if (/(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example') || file.startsWith('.father-hunter/')) findings.push(`private file tracked: ${file}`);
  try { inspect(await readFile(resolve(root, file)), `working tree: ${file}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const objects = git(['rev-list', '--objects', '--all']).toString().split('\n').filter(Boolean).map(line => line.split(' ')[0]);
const blobs = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], objects.join('\n')).toString().split('\n').filter(line => line.endsWith(' blob')).map(line => line.split(' ')[0]);
for (const oid of blobs) inspect(git(['cat-file', 'blob', oid]), `reachable history blob: ${oid}`);
let built = 0;
async function scan(directory) {
  let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) { const path = resolve(directory, entry.name); if (entry.isDirectory()) await scan(path); else { inspect(await readFile(path), `build: ${relative(root, path)}`); built++; } }
}
await scan(`${root}/apps/web/dist`); await scan(`${root}/artifacts/aws/functions`);
if (findings.length) { console.error('Potential credentials found (values redacted):\n' + [...new Set(findings)].join('\n')); process.exitCode = 1; }
else console.log(`PASS credential scan: ${files.length} working files, ${blobs.length} reachable history blobs, ${built} built files. No key matches; configured development key checked without printing it.`);
