import { preview } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../apps/server/src/app.ts';
import { FixtureProvider } from '../apps/server/test/fixtures.ts';

// Serve the actual production build with the production CSP. In particular,
// connect-src does not allow blob URLs; image decoding must use img-src.
const directory = await mkdtemp(join(tmpdir(), 'production-game-'));
const { app } = await buildApp({ directory, provider: new FixtureProvider() }); let web;
try {
  const api = await app.listen({ host: '127.0.0.1', port: 0 });
  web = await preview({ root: fileURLToPath(new URL('../apps/web', import.meta.url)), logLevel: 'error', preview: { host: '127.0.0.1', port: 0,
    proxy: { '/api': { target: api, ws: true, changeOrigin: false } }, headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:*; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    } } });
  const child = spawn(process.execPath, ['scripts/live-shared-browser-check.mjs', `http://127.0.0.1:${web.httpServer.address().port}`, '--quick'], { stdio: 'inherit' });
  const [code] = await once(child, 'exit'); if (code) process.exitCode = code;
} finally { await new Promise(resolve => web ? web.httpServer.close(resolve) : resolve()); await app.close(); await rm(directory, { recursive: true, force: true }); }
