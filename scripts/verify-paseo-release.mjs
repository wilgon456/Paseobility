#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openSync, closeSync} from 'node:fs';
import {mkdtemp, writeFile, readFile, access, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT, CHECKS, version, readState} from './paseo-compatibility.mjs';

const [candidate, runtimeArg, baselineArg, sourceSha, receiptArg] = process.argv.slice(2);
version(candidate);
assert(/^[0-9a-f]{40}$/.test(sourceSha || ''), 'Expected exact checkout SHA');
assert(runtimeArg && baselineArg && receiptArg, 'Expected runtime, baseline runtime, source SHA and receipt path');
const runtime = path.resolve(runtimeArg), baseline = path.resolve(baselineArg);
const packageVersion = async (prefix, name) => JSON.parse(await readFile(path.join(prefix, 'node_modules', name, 'package.json'), 'utf8')).version;
assert.equal(await packageVersion(runtime, '@getpaseo/cli'), candidate);
assert.equal(await packageVersion(runtime, '@getpaseo/plugin'), candidate);
assert.equal(await packageVersion(baseline, '@getpaseo/cli'), (await readState()).policy.remoteBaseline);
const checkedOut = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'});
assert.equal(checkedOut.status, 0);
assert.equal(checkedOut.stdout.trim(), sourceSha, 'Verification checkout differs from the proof SHA');
async function candidateState() {
  const changed = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(changed.status, 0);
  for (const line of changed.stdout.split('\n').filter(Boolean))
    assert(['config/paseo-compatibility.json', 'plugin/paseo-plugin.json'].includes(line.slice(3)), 'Unexpected source changes during release verification');
  const digest = createHash('sha256');
  for (const file of ['config/paseo-compatibility.json', 'plugin/paseo-plugin.json'])
    digest.update(await readFile(path.join(ROOT, file)));
  return digest.digest('hex');
}
const initialState = await candidateState();
const cli = path.join(runtime, 'node_modules/@getpaseo/cli/dist/index.js');
const load = (name) => import(pathToFileURL(path.join(runtime, 'node_modules', name)).href);
const env = {...process.env};
delete env.PASEO_HOST;
delete env.PASEO_HOME;
delete env.PASEO_PLUGIN_CLIENT_RUNTIME;
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, {cwd: ROOT, env: {...env, ...extra}, stdio: 'inherit', timeout: 120000});
  if (result.error || result.status !== 0) throw Error(`Compatibility step failed (${path.basename(command)} ${args[0]}): ${result.error?.message || result.status}`);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
run(npm, ['--prefix', 'plugin', 'run', 'typecheck']);
run(npm, ['--prefix', 'plugin', 'test']);
const checker = path.join(ROOT, 'scripts/check-plugin-runtime.mjs');
run(process.execPath, [checker, runtime]);
run(process.execPath, [checker, baseline], {PASEO_PLUGIN_CLIENT_RUNTIME: runtime});
run(process.execPath, [checker, runtime], {PASEO_PLUGIN_CLIENT_RUNTIME: baseline});

// An owned, short-path Unix socket and separate --home keep the real daemon intact.
assert.notEqual(process.platform, 'win32', 'Live release probes run on the Linux Actions runner');
const home = await mkdtemp(path.join(os.tmpdir(), 'paseo-compat-'));
const socket = path.join(home, 'daemon.sock');
const daemonEnv = {...env, PASEO_LISTEN: socket, PASEO_RELAY_ENABLED: 'false', PASEO_SERVICE_PROXY_ENABLED: 'false', PASEO_VOICE_MODE_ENABLED: 'false', PASEO_DICTATION_ENABLED: 'false'};
await writeFile(path.join(home, 'config.json'), JSON.stringify({pluginsEnabled: true, daemon: {listen: socket, relay: {enabled: false}}}));
const log = openSync(path.join(home, 'probe.log'), 'a', 0o600);
const daemon = spawn(process.execPath, [cli, 'daemon', 'run', '--home', home], {env: daemonEnv, stdio: ['ignore', log, log]});
let launchError;
daemon.on('error', error => { launchError = error; });
let client, api, stop;
let success = false;
try {
  const deadline = Date.now() + 45000;
  while (true) {
    if (launchError) throw launchError;
    if (daemon.exitCode !== null) throw Error('Isolated daemon exited before readiness');
    try { await access(socket); break; } catch { /* wait only for our own socket */ }
    assert(Date.now() < deadline, 'Isolated daemon readiness deadline exceeded');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  run(process.execPath, [cli, 'plugin', 'install', path.join(ROOT, 'plugin'), '--home', home, '--json'], daemonEnv);
  const {connectToDaemon} = await load('@getpaseo/cli/dist/utils/client.js');
  const {createPaseoApi} = await load('@getpaseo/client/dist/index.js');
  client = await connectToDaemon({target: {kind: 'instance', home}, timeout: 15000});
  api = createPaseoApi(client);
  assert.equal((await client.listPlugins()).find(p => p.id === 'paseobility')?.status, 'running');
  const status = await client.invokePluginRpc('paseobility', 'skills.status', {});
  assert.equal(status.skills.length, 15);
  const search = await client.invokePluginRpc('paseobility', 'skills.search', {query: 'browser'});
  const installed = status.skills.some(s => s.id === 'ps-browser' && (s.paseo || s.claude));
  if (installed) assert.equal(search.items[0]?.id, 'ps-browser');
  else assert.deepEqual(search.items, []); // Empty runner homes are valid; do not alter HOME or personal skills.
  stop = api.agents.subscribe(() => {});
  assert(Array.isArray((await api.agents.list({filter: {includeArchived: false}, page: {limit: 200}})).entries));
  success = true;
} finally {
  // Disposal errors must never skip stopping our isolated daemon.
  for (const cleanup of [() => stop?.(), () => api?.dispose(), () => client?.close()]) {
    try { await cleanup(); } catch { success = false; }
  }
  const stopped = spawnSync(process.execPath, [cli, 'daemon', 'stop', '--home', home, '--json'], {env: daemonEnv, stdio: 'inherit', timeout: 20000});
  if (stopped.status !== 0) { daemon.kill('SIGTERM'); success = false; }
  const exitDeadline = Date.now() + 5000;
  while (daemon.exitCode === null && Date.now() < exitDeadline)
    await new Promise(resolve => setTimeout(resolve, 100));
  if (daemon.exitCode === null) { daemon.kill('SIGTERM'); success = false; }
  closeSync(log);
  if (success) await rm(home, {recursive: true});
  else console.error(`Owned probe diagnostics retained at ${home}`);
}
assert(success, 'Live compatibility probe or cleanup failed');
assert.equal(await candidateState(), initialState, 'Candidate changed during verification');
const receipt = {schemaVersion: 1, version: candidate, sourceSha, checks: CHECKS, result: 'pass'};
await writeFile(path.resolve(receiptArg), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
