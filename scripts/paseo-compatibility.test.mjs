import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT, CHECKS, version, validatePolicy, rangeFor, withVersions, plan, readState, applyVersions, provenVersions} from './paseo-compatibility.mjs';

const fixturePolicy = () => ({schemaVersion: 1, baseRange: '>=0.12.0 <0.16.0', remoteBaseline: '0.15.4', verifiedVersions: ['0.15.4', '0.16.0-beta.1', '0.16.0-beta.2']});
const sourceSha = 'a'.repeat(40);
const proof = v => ({schemaVersion: 1, version: v, sourceSha, checks: [...CHECKS], result: 'pass'});

test('current policy, manifest and baseline are consistent', async () => {
  const {policy, manifest} = await readState();
  assert.equal(manifest.requirements.paseo, rangeFor(policy));
});

test('discovery skips verified releases and force rechecks both current channels', () => {
  const policy = fixturePolicy(), tags = {latest: '0.15.4', beta: '0.16.0-beta.2'};
  assert.deepEqual(plan(policy, tags).versions, []);
  assert.deepEqual(plan(policy, tags, true).versions, ['0.15.4', '0.16.0-beta.2']);
  assert.deepEqual(plan(policy, {latest: '0.15.4'}).versions, []);
  assert.deepEqual(plan(policy, {latest: '0.15.4', beta: '0.15.4'}, true).versions, ['0.15.4']);
});

test('new stable, patch and beta releases all require an explicit proof', () => {
  assert.deepEqual(plan(fixturePolicy(), {latest: '0.15.5', beta: '0.16.0-beta.3'}).versions, ['0.15.5', '0.16.0-beta.3']);
  assert.deepEqual(plan(fixturePolicy(), {latest: '0.16.0', beta: '0.16.0'}).versions, ['0.16.0']);
});

test('discovery rejects malformed versions, shell text and a prerelease on latest', () => {
  for (const value of ['v0.16.0', '0.16.0\n', '0.16.0;echo secret', '../main', '0.16.0+unbounded', '01.2.3', '', null, 123])
    assert.throws(() => version(value));
  assert.throws(() => plan(fixturePolicy(), {latest: '0.16.0-beta.3', beta: '0.16.0-beta.3'}));
  assert.throws(() => plan(fixturePolicy(), {latest: '0.1.0'}));
});

test('policy rejects duplicate, unsorted, missing-baseline and widened-base states', () => {
  const policy = fixturePolicy();
  assert.throws(() => validatePolicy({...policy, verifiedVersions: [...policy.verifiedVersions, '0.15.4']}));
  assert.throws(() => validatePolicy({...policy, verifiedVersions: [...policy.verifiedVersions].reverse()}));
  assert.throws(() => validatePolicy({...policy, remoteBaseline: '0.15.3'}));
  assert.throws(() => validatePolicy({...policy, baseRange: '>=0.12.0'}));
});

test('allowing a beta never implicitly admits the next beta or stable core', async () => {
  const {assertPluginCompatibility} = await import(pathToFileURL(path.join(ROOT, 'plugin/node_modules/@getpaseo/protocol/dist/plugin-requirements.js')).href);
  const policy = withVersions(fixturePolicy(), ['0.16.0-beta.3']);
  for (const runtime of ['daemon', 'app']) {
    const check = v => assertPluginCompatibility({id: 'fixture', requirements: {paseo: rangeFor(policy)}, version: v, runtime});
    assert.doesNotThrow(() => check('0.16.0-beta.3'));
    assert.throws(() => check('0.16.0-beta.4'));
    assert.throws(() => check('0.16.0'));
    assert.throws(() => check('0.17.0'));
  }
});

test('allowing one stable release never widens to its next patch or minor', async () => {
  const {assertPluginCompatibility} = await import(pathToFileURL(path.join(ROOT, 'plugin/node_modules/@getpaseo/protocol/dist/plugin-requirements.js')).href);
  const policy = withVersions(fixturePolicy(), ['0.16.0']);
  const check = v => assertPluginCompatibility({id: 'fixture', requirements: {paseo: rangeFor(policy)}, version: v, runtime: 'app'});
  assert.doesNotThrow(() => check('0.16.0'));
  assert.throws(() => check('0.16.1'));
  assert.throws(() => check('0.17.0'));
});

async function fixture(fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'paseo-policy-test-'));
  try {
    await mkdir(path.join(root, 'config'));
    await mkdir(path.join(root, 'plugin'));
    const policy = fixturePolicy();
    await writeFile(path.join(root, 'config/paseo-compatibility.json'), JSON.stringify(policy));
    await writeFile(path.join(root, 'plugin/paseo-plugin.json'), JSON.stringify({id: 'fixture', custom: 'preserved', requirements: {paseo: rangeFor(policy)}}));
    await fn(root);
  } finally { await rm(root, {recursive: true}); }
}

test('promotion is repeatable and preserves existing versions and manifest fields', async () => fixture(async root => {
  assert.equal(await applyVersions(root, ['0.16.0-beta.3']), true);
  const first = await readFile(path.join(root, 'config/paseo-compatibility.json'), 'utf8');
  assert.equal(await applyVersions(root, ['0.16.0-beta.3']), false);
  assert.equal(await readFile(path.join(root, 'config/paseo-compatibility.json'), 'utf8'), first);
  const {policy, manifest} = await readState(root);
  assert.equal(manifest.custom, 'preserved');
  assert.deepEqual(policy.verifiedVersions, [...fixturePolicy().verifiedVersions, '0.16.0-beta.3']);
}));

test('promotion refuses concurrent/manual manifest drift instead of replacing it', async () => fixture(async root => {
  const file = path.join(root, 'plugin/paseo-plugin.json');
  const changed = JSON.stringify({id: 'fixture', requirements: {paseo: '>=0.12.0'}});
  await writeFile(file, changed);
  await assert.rejects(applyVersions(root, ['0.16.0-beta.3']), /Manifest and compatibility policy differ/);
  assert.equal(await readFile(file, 'utf8'), changed);
}));

test('all candidate receipts must pass for the exact source checkout', () => {
  const versions = ['0.15.5', '0.16.0-beta.3'];
  const receipts = versions.map(proof);
  assert.deepEqual(provenVersions(receipts, versions, sourceSha), versions);
  assert.throws(() => provenVersions(receipts.slice(0, 1), versions, sourceSha));
  assert.throws(() => provenVersions([receipts[0], receipts[0]], versions, sourceSha));
  assert.throws(() => provenVersions(receipts, versions, 'b'.repeat(40)));
  assert.throws(() => provenVersions([{...receipts[0], result: 'fail'}, receipts[1]], versions, sourceSha));
  assert.throws(() => provenVersions([{...receipts[0], checks: CHECKS.slice(0, -1)}, receipts[1]], versions, sourceSha));
  assert.throws(() => provenVersions(receipts, [...versions, '0.16.0-beta.4'], sourceSha));
});
