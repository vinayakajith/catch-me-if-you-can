import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
execFileSync('docker', ['run', '--rm', '--platform', 'linux/amd64', '-e', 'NODE_PATH=/opt/nodejs/node_modules',
  '-v', `${root}/artifacts/aws/functions:/var/task:ro`, '-v', `${root}/artifacts/aws/layer:/opt:ro`, '--entrypoint', '/var/lang/bin/node',
  'public.ecr.aws/lambda/nodejs@sha256:04e58cbe7bef1dadb74a4223df35d9ee917663ab24c1cbb8d9010b125bfe8558', '-e',
  'const sharp=require("sharp"); Promise.all([sharp({create:{width:32,height:32,channels:4,background:"#663399"}}).png().toBuffer(),Promise.resolve(require("/var/task/api.cjs")),Promise.resolve(require("/var/task/workers.cjs")),Promise.resolve(require("/var/task/realtime.cjs"))]).then(([b,api,workers,realtime])=>{if(b.length<10||!api.handler||!workers.imageHandler||!realtime.handler)throw Error("Invalid Lambda bundle"); console.log("PASS Node 24 Lambda runtime, Linux Sharp and three server bundles")})',
], { stdio: 'inherit' });
