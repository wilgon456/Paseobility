import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initRun, resumeRun, listRuns } from './god-run.mjs';

const script = fileURLToPath(new URL('./god-run.mjs', import.meta.url));
const skill = fileURLToPath(new URL('../', import.meta.url));
const fixtures = new WeakMap();
function test(name, run) {
  nodeTest(name, async t => {
    fixtures.set(t, []);
    try { await run(t); }
    finally { await Promise.all(fixtures.get(t).map(root => rm(root, { recursive: true, force: true }))); }
  });
}
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paseo-god-test-'));
  fixtures.get(t).push(root);
  return root;
}

test('init and resume preserve Unicode, literal placeholders and edited checkpoints', async t => {
  const root = await fixture(t);
  const goal = '재개 확인 {{RUN_ID}}\n`$(do-not-run)`';
  const run = await initRun(root, goal);
  const metadata = JSON.parse(await readFile(path.join(path.dirname(run.record), 'run.json'), 'utf8'));
  assert.equal(metadata.goal, goal);
  const initial = await readFile(run.record, 'utf8');
  assert.ok(initial.includes('> 재개 확인 {{RUN_ID}}'));
  await writeFile(run.record, initial + '\nCheckpoint: C1 passed; C2 pending.\n');
  const before = await readFile(run.record, 'utf8');
  assert.equal((await resumeRun(root, run.id)).content, before);
  assert.equal(await readFile(run.record, 'utf8'), before);
});

test('parallel run creation never shares a record or overwrites existing work', async t => {
  const root = await fixture(t);
  const runs = await Promise.all(Array.from({ length: 12 }, (_, i) => initRun(root, `Task ${i}`)));
  assert.equal(new Set(runs.map(run => run.id)).size, 12);
  for (let i = 0; i < runs.length; i++) {
    assert.ok((await resumeRun(root, runs[i].id)).content.split(/\r?\n/).includes(`> Task ${i}`));
  }
});

test('invalid and blank requests do not create storage', async t => {
  const root = await fixture(t);
  await assert.rejects(initRun(root, '  '), /goal/);
  await assert.rejects(resumeRun(root, '../another-run'), /UUID/);
  assert.deepEqual(await readdir(root), []);
});

test('missing run is a read-only failure', async t => {
  const root = await fixture(t);
  const run = await initRun(root, 'Keep');
  const directory = path.dirname(run.record);
  const before = await readFile(run.record, 'utf8');
  await assert.rejects(resumeRun(root, '00000000-0000-4000-8000-000000000000'), /ENOENT/);
  assert.deepEqual(await readdir(path.dirname(directory)), [run.id]);
  assert.equal(await readFile(run.record, 'utf8'), before);
});

test('copied records cannot silently resume under another project', async t => {
  const root = await fixture(t);
  const other = await fixture(t);
  const run = await initRun(root, 'Original project');
  await cp(path.join(root, '.paseobility'), path.join(other, '.paseobility'), { recursive: true });
  await assert.rejects(resumeRun(other, run.id), /identity or project root differs/);
});

test('corrupt metadata fails without changing the record', async t => {
  const root = await fixture(t);
  const run = await initRun(root, 'Keep checkpoint');
  const before = await readFile(run.record, 'utf8');
  await writeFile(path.join(path.dirname(run.record), 'run.json'), '{broken');
  await assert.rejects(resumeRun(root, run.id), SyntaxError);
  assert.equal(await readFile(run.record, 'utf8'), before);
});

test('storage symlinks are refused before writes', async t => {
  const root = await fixture(t);
  const other = await fixture(t);
  await symlink(other, path.join(root, '.paseobility'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(initRun(root, 'Do not write elsewhere'), /symlinks/);
  assert.deepEqual(await readdir(other), []);
});

test('symlinked record files are refused on resume', async t => {
  const root = await fixture(t);
  const run = await initRun(root, 'Keep');
  const external = path.join(root, 'external.md');
  await writeFile(external, 'External file');
  await rm(run.record);
  try {
    await symlink(external, run.record, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows file symlinks require Developer Mode or elevation'); return;
    }
    throw error;
  }
  await assert.rejects(resumeRun(root, run.id), /regular files/);
  assert.equal(await readFile(external, 'utf8'), 'External file');
});

test('list finds the project runs newest first with status and skips foreign or broken ones', async t => {
  const root = await fixture(t);
  const other = await fixture(t);
  assert.deepEqual((await listRuns(root)).runs, []);
  assert.deepEqual(await readdir(root), []);
  const first = await initRun(root, 'First task');
  const second = await initRun(root, 'Second task');
  for (const [run, createdAt] of [[first, '2026-01-01T00:00:00.000Z'], [second, '2026-01-02T00:00:00.000Z']]) {
    const metadataPath = path.join(path.dirname(run.record), 'run.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    await writeFile(metadataPath, JSON.stringify({ ...metadata, createdAt }));
  }
  await writeFile(second.record, (await readFile(second.record, 'utf8')).replace('- Status: active', '- Status: blocked'));
  const foreign = await initRun(other, 'Foreign');
  await cp(path.dirname(foreign.record), path.join(root, '.paseobility/god/runs', foreign.id), { recursive: true });
  const broken = await initRun(root, 'Broken');
  await writeFile(path.join(path.dirname(broken.record), 'run.json'), '{broken');
  const { runs } = await listRuns(root);
  assert.deepEqual(runs.map(run => [run.id, run.status, run.goal]),
    [[second.id, 'blocked', 'Second task'], [first.id, 'active', 'First task']]);
});

test('CLI provides parseable JSON and rejects unsupported or duplicate options', async t => {
  const root = await fixture(t);
  const args = ['--root', root, '--goal', 'CLI task'];
  const created = JSON.parse(execFileSync(process.execPath, [script, 'init', ...args], { encoding: 'utf8' }));
  const resumed = JSON.parse(execFileSync(process.execPath, [script, 'resume', '--id', created.id, '--root', root], { encoding: 'utf8' }));
  assert.equal(resumed.record, created.record);
  assert.ok(resumed.content.includes('> CLI task'));
  const listed = JSON.parse(execFileSync(process.execPath, [script, 'list', '--root', root], { encoding: 'utf8' }));
  assert.deepEqual(listed.runs.map(run => run.id), [created.id]);
  for (const invalid of [
    ['init', '--root', root, '--root', root],
    ['init', '--root', root, '--auto-save', 'yes'],
    ['complete', '--root', root, '--id', created.id],
    ['list', '--root', root, '--id', created.id],
    ['constructor', '--root', root],
  ]) {
    const result = spawnSync(process.execPath, [script, ...invalid], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Usage:/);
  }
  assert.deepEqual(await readdir(path.dirname(path.dirname(created.record))), [created.id]);
});

test('copied skill works with a CRLF template and a path containing spaces', async t => {
  const root = await fixture(t);
  const target = path.join(root, 'installed skill');
  await cp(skill, target, { recursive: true });
  const template = path.join(target, 'templates', 'RUN.md');
  await writeFile(template, (await readFile(template, 'utf8')).replace(/\r?\n/g, '\r\n'));
  const project = path.join(root, 'project with spaces');
  await mkdir(project);
  const result = JSON.parse(execFileSync(process.execPath, [path.join(target, 'scripts', 'god-run.mjs'), 'init', '--root', project, '--goal', 'Copied install'], { encoding: 'utf8' }));
  const record = await readFile(result.record, 'utf8');
  assert.ok(record.includes('\r\n'));
  assert.ok(record.split(/\r?\n/).includes('> Copied install'));
});
