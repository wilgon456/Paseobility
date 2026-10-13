#!/usr/bin/env node
// Local record creation/resumption only; no tools, model calls or task execution.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, stat, lstat, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const templateUrl = new URL('../templates/RUN.md', import.meta.url);

async function project(root) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('--root is required');
  const resolved = await realpath(root);
  if (!(await stat(resolved)).isDirectory()) throw new Error('Project root must be a directory');
  return resolved;
}

async function storage(root, create) {
  let current = root;
  for (const part of ['.paseobility', 'god', 'runs']) {
    current = path.join(current, part);
    if (create) await mkdir(current, { mode: 0o700 }).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
    const entry = await lstat(current);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error('Run storage must contain real directories, not symlinks');
    }
  }
  return current;
}

export async function initRun(root, goal) {
  if (typeof goal !== 'string' || !goal.trim()) throw new Error('--goal is required');
  const projectRoot = await project(root);
  const template = await readFile(templateUrl, 'utf8');
  const runs = await storage(projectRoot, true);
  const id = randomUUID();
  const directory = path.join(runs, id);
  // Exclusive mkdir: collisions fail rather than reuse or overwrite a run.
  await mkdir(directory, { mode: 0o700 });
  const metadata = { schemaVersion: 1, id, projectRoot, createdAt: new Date().toISOString(), goal };
  const values = { RUN_ID: id, PROJECT_ROOT: JSON.stringify(projectRoot),
    CREATED_AT: metadata.createdAt, GOAL: goal.split(/\r?\n/).map(line => `> ${line}`).join('\n') };
  try {
    await writeFile(path.join(directory, 'run.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(path.join(directory, 'RUN.md'), template.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key] ?? match), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    // Only this invocation's freshly created directory is rolled back.
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { id, projectRoot, record: path.join(directory, 'RUN.md') };
}

export async function resumeRun(root, id) {
  if (typeof id !== 'string' || !uuid.test(id)) throw new Error('--id must be a generated run UUID');
  const projectRoot = await project(root);
  const runs = await storage(projectRoot, false);
  const directory = path.join(runs, id);
  const entry = await lstat(directory);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Run must be a real directory');
  for (const name of ['run.json', 'RUN.md']) {
    const file = await lstat(path.join(directory, name));
    if (!file.isFile() || file.isSymbolicLink()) throw new Error('Run files must be regular files');
  }
  const metadata = JSON.parse(await readFile(path.join(directory, 'run.json'), 'utf8'));
  if (metadata.schemaVersion !== 1 || metadata.id !== id || metadata.projectRoot !== projectRoot) {
    throw new Error('Run identity or project root differs; inspect the record before resuming');
  }
  const record = path.join(directory, 'RUN.md');
  const content = await readFile(record, 'utf8');
  return { id, projectRoot, record, content };
}

const usage = 'Usage: god-run.mjs init --root <project> --goal <text> | resume --root <project> --id <uuid>';
async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(usage + '\n'); return; }
  const [command, ...rest] = args;
  const allowed = command === 'init' ? ['--root', '--goal'] : command === 'resume' ? ['--root', '--id'] : [];
  if (!allowed.length || rest.length !== 4) throw new Error(usage);
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (!allowed.includes(key) || key in options || !rest[i + 1]?.trim()) throw new Error(usage);
    options[key] = rest[i + 1];
  }
  const result = command === 'init'
    ? await initRun(options['--root'], options['--goal'])
    : await resumeRun(options['--root'], options['--id']);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

const entryPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (entryPath === await realpath(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`paseo-god: ${error.message}\n`);
    process.exitCode = 1;
  });
}
