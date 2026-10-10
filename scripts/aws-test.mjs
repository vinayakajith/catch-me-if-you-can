import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

// No AWS account or credentials are used. Never silently fall back to real AWS.
const name = `father-dynamo-${randomUUID()}`;
let owned = false;
try {
  let endpoint = process.env.FH_DYNAMO_ENDPOINT;
  if (!endpoint) {
    execFileSync('docker', ['run', '-d', '--rm', '--name', name, '-p', '127.0.0.1::8000', 'amazon/dynamodb-local@sha256:ff89bd48ff32cd8d9be5fee8873b65b8854dc408f1afe881be6eb00247bc0dab', '-jar', 'DynamoDBLocal.jar', '-inMemory', '-sharedDb'], { stdio: 'inherit' }); owned = true;
    endpoint = `http://${execFileSync('docker', ['port', name, '8000'], { encoding: 'utf8' }).trim()}`;
  }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error('Only a local DynamoDB test endpoint is allowed.');
  for (let i = 0; ; i++) { try { await fetch(endpoint); break; } catch (error) { if (i > 30) throw error; await sleep(500); } }
  const load = process.argv.includes('--load');
  const child = spawn(process.execPath, load ? ['scripts/multiplayer-load-check.mjs'] : ['--test', 'apps/server/test/aws/*.test.ts'], { stdio: 'inherit', env: { ...process.env, FH_DYNAMO_ENDPOINT: endpoint, ...(load ? { FH_LOAD_STORAGE: 'dynamo' } : {}) } });
  process.exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
} finally { if (owned) execFileSync('docker', ['stop', name], { stdio: 'ignore' }); }
