import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findLeftovers, parseEtime } from './browser-sweep.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'browser-sweep.mjs');
const HOUR = 3600;

const PROCS = [
  { pid: 1, ppid: 0, ageSeconds: 9e6, command: '/sbin/launchd' },
  // Playwright CLI daemon left for days, with its browser and a helper.
  { pid: 100, ppid: 1, ageSeconds: 50 * 86400, command: '/usr/bin/node /x/_npx/1/node_modules/playwright-core/lib/entry/cliDaemon.js season --config=./playwright-cli.json' },
  { pid: 101, ppid: 100, ageSeconds: 50 * 86400, command: '/u/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --headless' },
  { pid: 103, ppid: 1, ageSeconds: 50 * 86400, command: '/u/Library/Caches/ms-playwright/chromium-1234/x/Helpers/chrome_crashpad_handler --no-periodic-tasks' },
  { pid: 102, ppid: 101, ageSeconds: 50 * 86400, command: '/u/Library/Caches/ms-playwright/chromium-1234/x/Google Chrome for Testing Helper --type=renderer' },
  // Fresh Playwright CLI session in use.
  { pid: 200, ppid: 1, ageSeconds: 300, command: 'node /x/playwright-core/lib/entry/cliDaemon.js paseo-task --config=./c.json' },
  // CloakBrowser still driven by its node script.
  { pid: 300, ppid: 1, ageSeconds: 2 * HOUR, command: 'node --input-type=module -' },
  { pid: 301, ppid: 300, ageSeconds: 2 * HOUR, command: '/u/.local/share/paseobility/browser/cloakbrowser/cache/chromium-145/Chromium.app/Contents/MacOS/Chromium --headless' },
  // Orphaned CloakBrowser (controller died).
  { pid: 400, ppid: 1, ageSeconds: 3 * HOUR, command: '/u/.local/share/paseobility/browser/cloakbrowser/cache/chromium-145/Chromium.app/Contents/MacOS/Chromium --user-data-dir=/u/.local/share/paseobility/browser/profiles/github' },
  // Orphaned Playwright browser without a daemon.
  { pid: 500, ppid: 1, ageSeconds: 5 * HOUR, command: 'C:\\Users\\u\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win\\chrome.exe --headless' },
  // The user's own browsers must never match.
  { pid: 600, ppid: 1, ageSeconds: 30 * 86400, command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  { pid: 601, ppid: 1, ageSeconds: 30 * 86400, command: '/Applications/Paseo.app/Contents/MacOS/Paseo' },
];

test('parseEtime handles ps elapsed formats', () => {
  assert.equal(parseEtime('05:07'), 307);
  assert.equal(parseEtime('02:05:07'), 7507);
  assert.equal(parseEtime('50-20:38:28'), 50 * 86400 + 20 * 3600 + 38 * 60 + 28);
  assert.equal(parseEtime('nonsense'), null);
});

test('only agent browsers are found, and only stale unattached ones are closed', () => {
  const found = findLeftovers(PROCS, { olderThanMinutes: 60, selfPid: -1 });
  const byPid = Object.fromEntries(found.map(f => [f.pid, f]));
  assert.deepEqual(Object.keys(byPid).map(Number).sort((a, b) => a - b), [100, 200, 301, 400, 500]);
  assert.equal(byPid[100].kind, 'playwright-cli');
  assert.equal(byPid[100].session, 'season');
  assert.equal(byPid[100].action, 'close');
  assert.equal(byPid[200].action, 'keep (recent)');
  assert.equal(byPid[301].action, 'keep (in use by pid 300)');
  assert.equal(byPid[400].action, 'close');
  assert.equal(byPid[500].kind, 'playwright-browser');
  assert.equal(byPid[500].action, 'close');
});

test('crash handlers are skipped while a browser runs, swept once none is left', () => {
  assert.ok(!findLeftovers(PROCS, { selfPid: -1 }).some(f => f.pid === 103));
  const alone = [{ pid: 1, ppid: 0, ageSeconds: 9e6, command: '/sbin/launchd' }, PROCS.find(p => p.pid === 103)];
  assert.equal(findLeftovers(alone, { selfPid: -1 })[0].action, 'close');
});

test('--older-than 0 closes recent unattached browsers too', () => {
  const found = findLeftovers(PROCS, { olderThanMinutes: 0, selfPid: -1 });
  assert.equal(found.find(f => f.pid === 200).action, 'close');
  assert.equal(found.find(f => f.pid === 301).action, 'keep (in use by pid 300)');
});

test('CLI fixture mode lists and refuses unknown pids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  const fixture = path.join(dir, 'p.json');
  fs.writeFileSync(fixture, JSON.stringify(PROCS));
  const list = spawnSync(process.execPath, [SCRIPT, '--processes', fixture, '--json'], { encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr);
  const out = JSON.parse(list.stdout);
  assert.equal(out.closeMode, false);
  assert.ok(out.browsers.every(b => !b.result));
  const close = spawnSync(process.execPath, [SCRIPT, '--processes', fixture, '--close', '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(close.stdout).browsers.filter(b => b.result).map(b => b.pid).sort(), [100, 400, 500]);
  const bad = spawnSync(process.execPath, [SCRIPT, '--processes', fixture, '--close', '--pid', '600'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a real orphaned fake browser process is closed', { skip: process.platform === 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  const fake = path.join(dir, 'paseobility', 'browser', 'cloakbrowser', 'cache', 'Chromium');
  fs.mkdirSync(path.dirname(fake), { recursive: true });
  fs.writeFileSync(fake, '#!/bin/sh\nsleep 60\n:\n', { mode: 0o755 });
  // Detach so the fake browser is re-parented away from this test process.
  const launcher = spawn('/bin/sh', ['-c', `"${fake}" --headless & echo $!`], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const pid = Number((await new Promise(r => launcher.stdout.once('data', r))).toString().trim());
  await new Promise(r => launcher.once('exit', r));
  await new Promise(r => setTimeout(r, 300));
  const r = spawnSync(process.execPath, [SCRIPT, '--close', '--pid', String(pid), '--json'], { encoding: 'utf8' });
  const hit = JSON.parse(r.stdout).browsers.find(b => b.pid === pid);
  try {
    assert.ok(hit, `fake browser ${pid} not found: ${r.stdout}`);
    assert.equal(hit.result, 'closed');
  } finally {
    try { process.kill(pid, 'SIGKILL'); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
