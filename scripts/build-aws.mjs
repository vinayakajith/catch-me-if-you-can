import { build } from 'esbuild';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/aws');
await mkdir(`${output}/functions`, { recursive: true });
await build({ entryPoints: { api: `${root}/apps/server/src/aws/api.ts`, workers: `${root}/apps/server/src/aws/workers.ts`, realtime: `${root}/apps/server/src/aws/realtime.ts` }, outdir: `${output}/functions`, bundle: true, platform: 'node', target: 'node24', format: 'cjs', outExtension: { '.js': '.cjs' }, external: ['sharp'], sourcemap: false, minify: false });
const { dependencies } = JSON.parse(await readFile(`${root}/apps/server/package.json`, 'utf8'));
const layer = `${output}/layer/nodejs`, manifest = JSON.stringify({ name: 'catch-me-if-you-can-image-layer', private: true, version: '1.0.0', dependencies: { sharp: dependencies.sharp } }, null, 2);
const binary = `${layer}/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-${dependencies.sharp}.node`;
await mkdir(layer, { recursive: true });
let ready = false;
try { ready = await readFile(`${layer}/package.json`, 'utf8') === manifest; await access(binary); } catch { ready = false; }
if (!ready) {
  await writeFile(`${layer}/package.json`, manifest);
  execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--os=linux', '--cpu=x64', '--libc=glibc'], { cwd: layer, stdio: 'inherit' });
}
const native = await readFile(binary);
if (native.subarray(0, 4).toString('hex') !== '7f454c46') throw new Error('The Lambda layer must contain a Linux ELF binary.');
await writeFile(`${output}/build.json`, JSON.stringify({ application: 'Catch Me If You Can', node: 24, architecture: 'x86_64', sharp: dependencies.sharp }, null, 2));
console.log('AWS bundles and Linux x86_64 image layer prepared. No AWS resources were created.');
