#!/usr/bin/env node
import assert from 'node:assert/strict';
import {appendFile, readFile, readdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'plugin/package.json'));
const semver = require('semver');
const policyPath = 'config/paseo-compatibility.json';
const manifestPath = 'plugin/paseo-plugin.json';
export const CHECKS = ['typecheck', 'regression', 'compiler-sdk', 'older-daemon-new-app', 'new-daemon-older-app', 'live-rpc'];

export function version(value) {
  if (typeof value !== 'string' || value.length > 80 || semver.valid(value) !== value || value.includes('+'))
    throw Error('Expected a canonical, bounded Paseo version without build metadata');
  return value;
}

export function validatePolicy(policy) {
  assert.equal(policy.schemaVersion, 1);
  // The automation can add proven exact versions; widening the base is a human change.
  assert.equal(policy.baseRange, '>=0.12.0 <0.16.0');
  assert(Array.isArray(policy.verifiedVersions) && policy.verifiedVersions.length > 0);
  assert(policy.verifiedVersions.length <= 500, 'Too many versions');
  policy.verifiedVersions.forEach(version);
  assert.deepEqual(policy.verifiedVersions, [...new Set(policy.verifiedVersions)].sort(semver.compare));
  assert(policy.verifiedVersions.includes(version(policy.remoteBaseline)), 'Baseline must be verified');
  assert(policy.verifiedVersions.every(v => semver.gte(v, '0.12.0')));
  return policy;
}

export function coveredByBase(v, baseRange) {
  // Paseo tests prereleases normally and also tests their stable core.
  const parsed = semver.parse(version(v));
  return semver.satisfies(v, baseRange) || semver.satisfies(`${parsed.major}.${parsed.minor}.${parsed.patch}`, baseRange);
}

export function rangeFor(policy) {
  validatePolicy(policy);
  return [policy.baseRange, ...policy.verifiedVersions.filter(v => !coveredByBase(v, policy.baseRange))].join(' || ');
}

export function withVersions(policy, versions) {
  validatePolicy(policy);
  assert(Array.isArray(versions) && versions.length <= 2, 'Only stable and beta candidates are allowed');
  versions.forEach(version);
  return validatePolicy({...policy, verifiedVersions: [...new Set([...policy.verifiedVersions, ...versions])].sort(semver.compare)});
}

export function plan(policy, tags, force = false) {
  validatePolicy(policy);
  assert.equal(typeof force, 'boolean');
  const channels = {latest: version(tags.latest), ...(tags.beta == null ? {} : {beta: version(tags.beta)})};
  assert.equal(semver.prerelease(channels.latest), null, 'latest must be stable');
  const current = [...new Set(Object.values(channels))].sort(semver.compare);
  assert(current.every(v => semver.gte(v, '0.12.0')), 'Published version is below the supported minimum');
  return {channels, versions: current.filter(v => force || !policy.verifiedVersions.includes(v)), remoteBaseline: policy.remoteBaseline};
}

export async function readState(root = ROOT) {
  const policy = validatePolicy(JSON.parse(await readFile(path.join(root, policyPath), 'utf8')));
  const manifest = JSON.parse(await readFile(path.join(root, manifestPath), 'utf8'));
  assert.equal(manifest.requirements.paseo, rangeFor(policy), 'Manifest and compatibility policy differ');
  return {policy, manifest};
}

export async function applyVersions(root, versions) {
  const {policy, manifest} = await readState(root);
  const next = withVersions(policy, versions);
  manifest.requirements.paseo = rangeFor(next);
  if (JSON.stringify(next) === JSON.stringify(policy)) return false;
  await writeFile(path.join(root, policyPath), JSON.stringify(next, null, 2) + '\n');
  await writeFile(path.join(root, manifestPath), JSON.stringify(manifest, null, 2) + '\n');
  return true;
}

export function provenVersions(receipts, candidates, sourceSha) {
  assert(/^[0-9a-f]{40}$/.test(sourceSha), 'Invalid source SHA');
  assert(Array.isArray(candidates) && candidates.length > 0 && candidates.length <= 2);
  candidates.forEach(version);
  assert.equal(new Set(candidates).size, candidates.length);
  assert.equal(receipts.length, candidates.length, 'Every candidate needs exactly one proof');
  for (const v of candidates) {
    const matches = receipts.filter(r => r.version === v);
    assert.equal(matches.length, 1, 'Missing or duplicate proof');
    const r = matches[0];
    assert.equal(r.schemaVersion, 1);
    assert.equal(r.sourceSha, sourceSha, 'Proof is for another checkout');
    assert.deepEqual(r.checks, CHECKS, 'Incomplete compatibility proof');
    assert.equal(r.result, 'pass');
  }
  return candidates;
}

async function receiptsIn(dir) {
  const result = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    assert(!entry.isSymbolicLink(), 'Proof artifacts cannot contain symlinks');
    if (entry.isDirectory()) result.push(...await receiptsIn(file));
    else if (entry.isFile() && entry.name.endsWith('.json')) result.push(JSON.parse(await readFile(file, 'utf8')));
  }
  return result;
}

async function output(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${JSON.stringify(value)}\n`);
}

export async function main(args) {
  const [command, ...rest] = args;
  if (command === 'matrix') {
    const {policy} = await readState();
    await output('versions', policy.verifiedVersions);
    console.log(JSON.stringify(policy.verifiedVersions));
  } else if (command === 'detect') {
    assert(rest.length === 0 || (rest.length === 1 && rest[0] === '--force'));
    const {policy} = await readState();
    const response = await fetch('https://registry.npmjs.org/-/package/@getpaseo%2fcli/dist-tags', {signal: AbortSignal.timeout(20000)});
    assert(response.ok, `npm discovery failed: ${response.status}`);
    const result = plan(policy, await response.json(), rest[0] === '--force');
    await output('versions', result.versions);
    // Strings are written without JSON quoting for normal scalar Actions expressions.
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `baseline=${result.remoteBaseline}\n`);
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### Paseo release discovery\n\nStable: ${result.channels.latest}; beta: ${result.channels.beta || 'none'}.\n\nCandidates: ${result.versions.join(', ') || 'none; all current versions are verified'}.\n`);
  } else if (command === 'prepare') {
    assert.equal(rest.length, 1);
    await applyVersions(ROOT, [version(rest[0])]);
  } else if (command === 'promote') {
    assert.equal(rest.length, 1);
    const candidates = JSON.parse(process.env.PASEO_CANDIDATES || 'null');
    const versions = provenVersions(await receiptsIn(rest[0]), candidates, process.env.PASEO_SOURCE_SHA || '');
    const changed = await applyVersions(ROOT, versions);
    console.log(JSON.stringify({versions, changed}));
  } else {
    throw Error('Usage: paseo-compatibility.mjs matrix | detect [--force] | prepare VERSION | promote PROOF_DIRECTORY');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
