#!/usr/bin/env node
// browser-sweep: find agent browsers that earlier tasks left running and close
// them. Only agent-owned browsers are recognised:
//   - CloakBrowser launched from the Paseobility runtime/profiles
//     (command line under .../paseobility/browser/ or ~/.cloakbrowser)
//   - Microsoft Playwright CLI session daemons (playwright-core cliDaemon.js)
//     and Playwright "Chrome for Testing" browsers whose daemon is gone
// The user's own Chrome/Edge/Safari and Paseo's desktop browser are never
// matched. Paseo `browser_*` tabs live inside Paseo; close those with
// `browser_close_tab`.
//
//   node browser-sweep.mjs                 list leftovers (no changes)
//   node browser-sweep.mjs --close         close leftovers idle past --older-than
//   node browser-sweep.mjs --close --pid N close one listed browser now
//   options: --older-than <minutes> (default 60), --json
//
// A CloakBrowser still attached to a live controlling script is reported as
// "in use" and left alone; an orphaned one, or any Playwright CLI daemon past
// the age limit, is closed. Exit codes: 0 ok, 1 something could not be closed,
// 2 usage or process-listing error.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLOAK_PATH = /[\\/]paseobility[\\/]browser[\\/]|[\\/]\.cloakbrowser[\\/]/i;
const PLAYWRIGHT_DAEMON = /playwright[^\s]*[\\/]cliDaemon\.js/i;
const PLAYWRIGHT_BROWSER = /[\\/]ms-playwright[\\/]/i;
const HELPER = /\s--type=/;
const CRASHPAD = /crashpad_handler/i;

export function parseEtime(value) {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(String(value).trim());
  if (!m) return null;
  const [, d = 0, h = 0, min, s] = m;
  return ((Number(d) * 24 + Number(h)) * 60 + Number(min)) * 60 + Number(s);
}

export function listProcesses() {
  if (process.platform === 'win32') {
    const ps = 'Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; ppid = $_.ParentProcessId; created = if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString("o") } else { $null }; command = $_.CommandLine } } | ConvertTo-Json -Compress';
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`process listing failed: ${r.stderr.trim()}`);
    const now = Date.now();
    return [].concat(JSON.parse(r.stdout || '[]')).map(p => ({
      pid: p.pid, ppid: p.ppid, command: p.command || '',
      ageSeconds: p.created ? Math.max(0, Math.round((now - Date.parse(p.created)) / 1000)) : null,
    }));
  }
  const r = spawnSync('ps', ['-axww', '-o', 'pid=,ppid=,etime=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`process listing failed: ${r.stderr.trim()}`);
  return r.stdout.split('\n').filter(Boolean).map(line => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    return m && { pid: Number(m[1]), ppid: Number(m[2]), ageSeconds: parseEtime(m[3]), command: m[4] };
  }).filter(Boolean);
}

function sessionOf(command) {
  const m = /cliDaemon\.js\s+([^\s]+)/i.exec(command);
  return m ? m[1] : null;
}

// Classify every agent-owned browser root and decide whether to close it.
export function findLeftovers(processes, { olderThanMinutes = 60, selfPid = process.pid } = {}) {
  const byPid = new Map(processes.map(p => [p.pid, p]));
  const alive = pid => pid > 1 && byPid.has(pid);
  const limit = olderThanMinutes * 60;
  const isBrowser = p => !HELPER.test(p.command) && !CRASHPAD.test(p.command) &&
    (PLAYWRIGHT_BROWSER.test(p.command) || (CLOAK_PATH.test(p.command) && /chrom/i.test(p.command)));
  // A crash handler belongs to a running browser; it only counts once none is left.
  const browserAlive = processes.some(isBrowser);
  const found = [];
  for (const p of processes) {
    if (p.pid === selfPid || HELPER.test(p.command)) continue;
    if (CRASHPAD.test(p.command) && browserAlive) continue;
    let kind = null, session = null;
    if (PLAYWRIGHT_DAEMON.test(p.command)) {
      kind = 'playwright-cli';
      session = sessionOf(p.command);
    } else if (CLOAK_PATH.test(p.command) && /chrom/i.test(p.command)) {
      kind = 'cloakbrowser';
    } else if (PLAYWRIGHT_BROWSER.test(p.command)) {
      const parent = byPid.get(p.ppid);
      if (parent && PLAYWRIGHT_DAEMON.test(parent.command)) continue; // counted with its daemon
      kind = 'playwright-browser';
    }
    if (!kind) continue;
    const attached = kind === 'cloakbrowser' && alive(p.ppid);
    const old = p.ageSeconds != null && p.ageSeconds >= limit;
    let action = 'keep (recent)';
    if (attached) action = `keep (in use by pid ${p.ppid})`;
    else if (old) action = 'close';
    found.push({ pid: p.pid, ppid: p.ppid, kind, session, ageSeconds: p.ageSeconds, action,
      command: p.command.length > 160 ? p.command.slice(0, 157) + '...' : p.command });
  }
  return found;
}

function descendants(processes, root) {
  const out = [], queue = [root];
  while (queue.length) {
    const pid = queue.shift();
    for (const p of processes) if (p.ppid === pid) { out.push(p.pid); queue.push(p.pid); }
  }
  return out;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

export function closeTree(processes, pid) {
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
    return r.status === 0 || !isAlive(pid);
  }
  const tree = [pid, ...descendants(processes, pid)];
  for (const p of tree) { try { process.kill(p, 'SIGTERM'); } catch {} }
  for (let i = 0; i < 30 && tree.some(isAlive); i++) sleep(100);
  for (const p of tree) if (isAlive(p)) { try { process.kill(p, 'SIGKILL'); } catch {} }
  sleep(200);
  return !isAlive(pid);
}

function human(seconds) {
  if (seconds == null) return '?';
  const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60);
  return d ? `${d}d${h}h` : h ? `${h}h${m}m` : `${m}m`;
}

function main(argv) {
  const opts = { close: false, json: false, olderThan: 60, pid: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--close') opts.close = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--older-than') opts.olderThan = Number(argv[++i]);
    else if (a === '--pid') opts.pid = Number(argv[++i]);
    else if (a === '--processes') opts.fixture = argv[++i];
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 22).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
    else { console.error(`unknown option: ${a}`); return 2; }
  }
  if (!Number.isFinite(opts.olderThan) || opts.olderThan < 0) { console.error('--older-than needs minutes >= 0'); return 2; }
  if (opts.pid != null && !Number.isInteger(opts.pid)) { console.error('--pid needs a process id'); return 2; }
  let processes;
  try {
    processes = opts.fixture ? JSON.parse(fs.readFileSync(opts.fixture, 'utf8')) : listProcesses();
  } catch (e) { console.error(e.message); return 2; }
  const found = findLeftovers(processes, { olderThanMinutes: opts.olderThan });
  if (opts.pid != null) {
    const hit = found.find(f => f.pid === opts.pid);
    if (!hit) { console.error(`pid ${opts.pid} is not an agent browser listed by this sweep`); return 2; }
    for (const f of found) f.action = f.pid === opts.pid ? 'close' : 'skip';
  }
  let failed = 0;
  for (const f of found) {
    if (!opts.close || f.action !== 'close') continue;
    if (opts.fixture) { f.result = 'would close (fixture)'; continue; }
    const ok = closeTree(processes, f.pid);
    f.result = ok ? 'closed' : 'still running';
    if (!ok) failed++;
  }
  // Closing a browser can leave its crash handler behind; sweep those once more.
  if (opts.close && !opts.fixture && found.some(f => f.result === 'closed')) {
    for (const f of findLeftovers(listProcesses(), { olderThanMinutes: 0 })) {
      if (f.action !== 'close' || !CRASHPAD.test(f.command) || found.some(g => g.pid === f.pid)) continue;
      const ok = closeTree(processes, f.pid);
      found.push({ ...f, result: ok ? 'closed' : 'still running' });
      if (!ok) failed++;
    }
  }
  if (opts.json) console.log(JSON.stringify({ closeMode: opts.close, olderThanMinutes: opts.olderThan, browsers: found }, null, 2));
  else if (!found.length) console.log('No leftover agent browsers.');
  else for (const f of found) {
    console.log(`${f.kind}${f.session ? ` "${f.session}"` : ''} pid ${f.pid} age ${human(f.ageSeconds)} -> ${f.result || (opts.close ? f.action : f.action.replace(/^close$/, 'close (run with --close)'))}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
