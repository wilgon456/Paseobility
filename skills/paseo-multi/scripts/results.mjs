// Controller-local receipts. Publish complete, private bytes before any close.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

function location(stateDir, run, create = false) {
  if (!/^[a-f0-9-]{36}$/.test(run.runId)) throw Error('Invalid run identity.');
  const directory = path.join(stateDir, 'results');
  if (create && !fs.existsSync(directory)) fs.mkdirSync(directory, {mode: 0o700});
  for (const dir of [stateDir, directory]) {
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        (process.platform !== 'win32' && (stat.mode & 0o077)))
      throw Error('Run storage must be a private directory.');
  }
  if (create) syncDirectory(stateDir);
  return path.join(directory, run.runId + '.json');
}

function verify(value, run) {
  if (value.version !== 1 || value.serverId !== run.serverId || value.name !== run.name ||
      value.result?.runId !== run.runId || value.result.host !== run.host ||
      typeof value.result.terminalId !== 'string' || !value.result.terminalId ||
      (run.terminalId && value.result.terminalId !== run.terminalId) ||
      value.result.status !== 'completed' || value.result.exitCode !== 0 ||
      typeof value.result.output !== 'string') throw Error('Saved result identity or schema changed.');
  return value;
}

function read(file, run) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() ||
      (process.platform !== 'win32' && (stat.mode & 0o077))) throw Error('Unsafe result file.');
  const bytes = fs.readFileSync(file, 'utf8');
  let value;
  try { value = JSON.parse(bytes); }
  catch { throw Error('Saved result is not valid JSON; terminal retained.'); }
  return verify(value, run);
}

export function loadResult(stateDir, run) {
  try { return read(location(stateDir, run), run); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function syncDirectory(directory) {
  // Windows cannot open directories with Node's fs.openSync. The file itself
  // is fsynced on both platforms; POSIX also persists the directory entry.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

export function saveResult(stateDir, run, result) {
  const file = location(stateDir, run, true);
  const value = verify({version: 1, serverId: run.serverId, name: run.name,
    savedAt: new Date().toISOString(), result}, run);
  const bytes = JSON.stringify(value);
  const temporary = file + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(fd, bytes, 'utf8');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    // Hard-link publication is atomic and never overwrites another receipt.
    // Unsupported filesystems fail closed, leaving the terminal untouched.
    try { fs.linkSync(temporary, file); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    syncDirectory(path.dirname(file));
    const saved = read(file, run);
    if (saved.result.output !== result.output || saved.result.terminalId !== result.terminalId)
      throw Error('Concurrent result differs; terminal retained.');
    return saved;
  } finally { fs.unlinkSync(temporary); }
}

export function claimCleanup(stateDir, run) {
  const file = location(stateDir, run) + '.close-attempt';
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try { fs.writeFileSync(fd, 'Inspect terminal state before a manual retry.\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  syncDirectory(path.dirname(file));
  return true;
}
