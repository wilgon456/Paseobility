'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { frontmatter, scan } = require('./skill-catalog.js');
const SCRIPT = path.join(__dirname, 'skill-catalog.js');

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-catalog-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  function write(relative, content) {
    const file = path.join(home, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  }
  function skill(source, name, description = 'A synthetic specialist.', body = '', directory = name) {
    return write(`.${source}/skills/${directory}/SKILL.md`, `---\nname: ${name}\ndescription: ${description}\n---\n${body}`);
  }
  function run(...args) {
    return spawnSync(process.execPath, [SCRIPT, '--home', home, ...args], { encoding: 'utf8', timeout: 10000 });
  }
  function json(...args) {
    const result = run(...args, '--json');
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  return { home, write, skill, run, json };
}

test('frontmatter supports plain, quoted, folded, literal, BOM and CRLF forms', () => {
  for (const [value, expected] of [
    ['plain text # comment', 'plain text'],
    ['"quoted: text # literal"', 'quoted: text # literal'],
    ["'it''s quoted'", "it's quoted"],
    ['"first line\n  second line"', 'first line second line'],
    ['"quoted \\"word\\""', 'quoted "word"'],
    ['>-\n  first line\n  second line', 'first line second line'],
    ['>\n  first line\n  second line', 'first line second line\n'],
    ['> # a-comment\n  first line\n\n  second line', 'first line\nsecond line\n'],
    ['|\n  first line\n  second line', 'first line\nsecond line\n'],
    ['|-\n  first\n  second', 'first\nsecond'],
    ['|+\n  first\n\n', 'first\n\n\n'],
  ]) {
    const parsed = frontmatter(`\uFEFF---\r\nname: 'fixture'\r\ndescription: ${value.replace(/\n/g, '\r\n')}\r\n---\r\nbody`);
    assert.equal(parsed.name, 'fixture');
    assert.equal(parsed.description, expected);
    assert.equal(parsed.body, 'body');
    assert.equal(parsed.error, null);
  }
});

test('missing name falls back to directory; invalid descriptions/frontmatter are excluded and reported', t => {
  const f = fixture(t);
  f.write('.agents/skills/fallback/SKILL.md', '---\ndescription: fallback description\n---\nbody');
  f.write('.agents/skills/no-header/SKILL.md', 'no frontmatter');
  f.write('.agents/skills/no-description/SKILL.md', '---\nname: no-description\n---\nbody');
  assert.deepEqual(f.json('list').map(e => e.name), ['fallback']);
  assert.deepEqual(f.json('conflicts').map(e => e.message).sort(), ['missing description', 'missing frontmatter']);
});

test('nested categories, exact four-level depth, skipped directories and skill subtree boundary', t => {
  const f = fixture(t);
  f.skill('hermes', 'nested', 'Nested skill', '', 'category/group/nested');
  f.skill('hermes', 'fourth', 'Fourth level', '', 'one/two/three/fourth');
  f.skill('hermes', 'too-deep', 'Too deep', '', 'a/b/c/d/too-deep');
  for (const dir of ['.hidden', 'node_modules', 'vendor'])
    f.skill('agents', 'hidden-' + dir.replace('.', ''), 'Skipped', '', dir + '/child');
  f.skill('agents', 'outer');
  f.skill('agents', 'inner', 'Bundled', '', 'outer/inner');
  assert.deepEqual(f.json('list').map(e => e.name), ['fourth', 'nested', 'outer']);
});

test('follows symlinked skill directories, deduplicates real paths and stops cycles', t => {
  const f = fixture(t);
  f.write('outside/SKILL.md', '---\nname: linked\ndescription: Linked skill\n---\n');
  fs.mkdirSync(path.join(f.home, '.agents/skills/category'), { recursive: true });
  try {
    fs.symlinkSync(path.join(f.home, 'outside'), path.join(f.home, '.agents/skills/link'), 'junction');
    fs.symlinkSync(path.join(f.home, '.agents/skills'), path.join(f.home, '.agents/skills/category/loop'), 'junction');
    fs.symlinkSync(path.join(f.home, 'outside'), path.join(f.home, '.agents/skills/link-again'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP', 'EINVAL'].includes(error.code)) return t.skip('Symlink creation unavailable');
    throw error;
  }
  assert.deepEqual(f.json('list').map(e => e.name), ['linked']);
});

test('identical hashes merge across sources, preserving original and other locations', t => {
  const f = fixture(t);
  const selected = f.skill('agents', 'alpha');
  const other = f.skill('codex', 'alpha');
  assert.deepEqual(f.json('list'), [{ name: 'alpha', source: 'agents', path: selected,
    description: 'A synthetic specialist.', otherLocations: [{ source: 'codex', path: other }] }]);
  assert.deepEqual(f.json('conflicts'), []);
  assert.equal(f.run('path', 'alpha@codex').stdout.trim(), other);
});

test('same description and different hash produces one prioritized entry and stale copies', t => {
  const f = fixture(t);
  const selected = f.skill('hermes', 'alpha', 'Same description', 'new');
  const stale = f.skill('claude', 'alpha', 'Same description', 'old');
  f.skill('codex', 'alpha', 'Same description', 'oldest');
  assert.equal(f.json('list').length, 1);
  assert.equal(f.json('list')[0].path, selected);
  assert.equal(f.json('conflicts').filter(p => p.type === 'stale').length, 2);
  assert.match(f.run('path', 'alpha').stdout, /note: other copy has different content:/);
  assert.equal(f.run('path', 'alpha@claude').stdout.split('\n')[0], stale);
});

test('different descriptions split with @source while identical split copies merge', t => {
  const f = fixture(t);
  f.skill('agents', 'alpha', 'First meaning');
  f.skill('hermes', 'alpha', 'Other meaning');
  f.skill('codex', 'alpha', 'Other meaning');
  assert.deepEqual(f.json('list').map(e => e.name), ['alpha', 'alpha@hermes']);
  assert.deepEqual(f.json('conflicts').map(e => e.type), ['split']);
  assert.match(f.run('path', 'alpha@hermes').stdout, /\.hermes[/\\]skills/);
});

test('extra sources and explicit or default priority, relative and tilde paths', t => {
  const f = fixture(t);
  f.skill('agents', 'alpha', 'Same', 'shared');
  f.skill('hermes', 'alpha', 'Same', 'hermes');
  f.write('vault/alpha/SKILL.md', '---\nname: alpha\ndescription: Same\n---\nvault');
  f.write('vault/beta/SKILL.md', '---\nname: beta\ndescription: Extra\n---\n');
  const config = '.paseobility/catalog/sources.json';
  f.write(config, JSON.stringify({ sources: [{ id: 'vault', path: '~/vault' }] }));
  assert.equal(f.json('list')[0].source, 'agents');
  f.write(config, JSON.stringify({ sources: [{ id: 'vault', path: 'vault' }], priority: ['vault'] }));
  assert.equal(f.json('list')[0].source, 'vault');
  assert.deepEqual(f.json('list').map(e => e.name), ['alpha', 'beta']);
  f.write(config, JSON.stringify({ sources: [{ id: 'vault', path: path.join(f.home, 'vault') }], priority: ['hermes', 'vault'] }));
  assert.equal(f.json('list')[0].source, 'hermes');
});

test('invalid sources configuration falls back wholly to defaults with stderr', t => {
  const f = fixture(t);
  f.skill('agents', 'alpha');
  for (const config of ['{', 'null', '[]', '{"sources":{}}', '{"sources":null}', '{"priority":null}',
    '{"sources":[{"path":"elsewhere"}]}',
    '{"sources":[{"id":"agents","path":"elsewhere"}]}',
    '{"sources":[{"id":"../bad","path":"elsewhere"}]}',
    '{"sources":[{"id":"vault"}]}', '{"priority":["unknown"]}', '{"priority":["agents","agents"]}']) {
    f.write('.paseobility/catalog/sources.json', config);
    const result = f.run('list', '--names');
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'alpha');
    assert.match(result.stderr, /Invalid sources.json; using default/);
  }
});

test('list sorts names, collapses whitespace and truncates at 110 Unicode characters', t => {
  const f = fixture(t);
  f.skill('agents', 'zeta', '"' + '가'.repeat(130) + '"');
  f.skill('agents', 'alpha', '|\n  first line\n  second line');
  const result = f.run('list');
  assert.equal(result.status, 0);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], 'alpha — first line second line');
  assert.equal(Array.from(lines[1].split(' — ')[1]).length, 110);
  assert.ok(lines[1].endsWith('…'));
  assert.equal(f.run('list', '--names').stdout, 'alpha zeta\n');
  assert.equal(f.json('list')[1].description.length, 130);
});

test('path warns for every relative directory family, file-shaped folders, required tools and similar names', t => {
  const f = fixture(t);
  const body = ['references/missing.md', './scripts/missing.js', 'agents/missing.yaml',
    'templates/missing.md', 'assets/missing.png'].map(p => '`' + p + '`').join('\n') +
    '\n[reference](references/link.md)\n`assets/exists.png`\n[anchor](assets/exists.png#example)\n' +
    'skill_view skill_manage skills_list session_search delegate_task cronjob';
  const file = f.skill('agents', 'revise', 'Synthetic warning fixture', body);
  f.skill('agents', 'revise-korean');
  f.write('.agents/skills/revise/references', 'file');
  f.write('.agents/skills/revise/scripts', 'file');
  f.write('.agents/skills/revise/assets/exists.png', 'exists');
  const result = f.run('path', 'revise');
  assert.equal(result.status, 0);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], file);
  assert.ok(lines.slice(1).every(line => line.startsWith('note: ')));
  for (const word of ['references exists as a file', 'scripts exists as a file',
    'references/missing.md', 'scripts/missing.js', 'agents/missing.yaml', 'templates/missing.md',
    'assets/missing.png', 'references/link.md', 'skill_view', 'skill_manage', 'skills_list',
    'session_search', 'delegate_task', 'cronjob', 'similar names (prefix or suffix): revise-korean'])
    assert.ok(result.stdout.includes(word), word);
  assert.ok(!result.stdout.includes('assets/exists.png'));
  assert.equal(f.json('conflicts').filter(p => p.type === 'reference').length, 8);
});

test('unknown names suggest closest entries; unsafe names never resolve as paths', t => {
  const f = fixture(t);
  f.skill('agents', 'alpha');
  f.skill('agents', 'bravo');
  const result = f.run('path', 'alpa');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Closest names: alpha/);
  for (const name of ['../alpha', 'alpha/beta', 'alpha\\beta', '..', 'a..b']) {
    assert.equal(f.run('path', name).status, 1);
    assert.match(f.run('path', name).stderr, /Unsafe skill name/);
  }
});

test('related name warning covers suffix inflections as well as literal prefixes', t => {
  const f = fixture(t);
  f.skill('agents', 'organizer');
  f.skill('agents', 'organize-korean');
  assert.match(f.run('path', 'organizer').stdout, /similar names .*organize-korean/);
});

test('hash comparisons use original bytes, including non-UTF8 content', t => {
  const f = fixture(t);
  const a = f.skill('agents', 'alpha');
  const b = f.skill('codex', 'alpha');
  fs.appendFileSync(a, Buffer.from([0x80]));
  fs.appendFileSync(b, Buffer.from([0x81]));
  assert.equal(f.json('list').length, 1);
  assert.deepEqual(f.json('conflicts').map(p => p.type), ['stale']);
});

test('all output modes strip scanned controls, including JSON and path diagnostics', t => {
  const f = fixture(t);
  f.skill('agents', 'alpha', '"hello\\u0007 world\\u001b[31m"', '`assets/missing\x07.png`');
  for (const args of [['list'], ['list', '--names'], ['list', '--json'], ['path', 'alpha'],
    ['conflicts'], ['conflicts', '--json'], ['budget'], ['budget', '--json']]) {
    const result = f.run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
    if (args.includes('--json')) assert.doesNotMatch(JSON.stringify(JSON.parse(result.stdout)), /\\u0007|\\u001b/);
  }
  assert.equal(f.json('list')[0].description, 'hello world');
});

test('unreadable SKILL.md entries are reported; scanning does not execute scripts', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.home, '.agents/skills/unreadable/SKILL.md'), { recursive: true });
  f.skill('agents', 'alpha', 'Safe', '`scripts/hostile.js`');
  f.write('.agents/skills/alpha/scripts/hostile.js', 'throw Error("must never run")');
  const problems = f.json('conflicts');
  assert.equal(problems.length, 1);
  assert.equal(problems[0].type, 'unreadable');
  assert.deepEqual(f.json('list').map(e => e.name), ['alpha']);
});

test('budget counts physical skill frontmatter per source and limits largest to ten', t => {
  const f = fixture(t);
  let expected = 0;
  for (let n = 0; n < 12; n++) {
    const file = f.skill('agents', 'fixture-' + n, 'x'.repeat(n + 1));
    expected += frontmatter(fs.readFileSync(file, 'utf8')).chars;
  }
  f.skill('codex', 'fixture-0', 'x');
  const budget = f.json('budget');
  assert.equal(budget.find(s => s.source === 'agents').skills, 12);
  assert.equal(budget.find(s => s.source === 'agents').characters, expected);
  assert.equal(budget.find(s => s.source === 'agents').largest.length, 10);
  assert.equal(budget.find(s => s.source === 'agents').largest[0].name, 'fixture-11');
  assert.equal(budget.find(s => s.source === 'codex').skills, 1);
  assert.match(f.run('budget').stdout, /agents: 12 skills/);
});

test('missing sources are silent; --home overrides environment home', t => {
  const f = fixture(t);
  assert.equal(f.run('list').stdout, '');
  assert.equal(f.run('list').stderr, '');
  assert.deepEqual(f.json('list'), []);
  assert.deepEqual(f.json('conflicts'), []);
  const file = f.skill('hermes', 'alpha');
  const result = spawnSync(process.execPath, [SCRIPT, 'path', 'alpha'], {
    encoding: 'utf8', env: { ...process.env, PASEOBILITY_CATALOG_HOME: f.home },
  });
  assert.equal(result.stdout.trim(), file);
  const override = spawnSync(process.execPath, [SCRIPT, '--home', path.join(f.home, 'empty'), 'list'], {
    encoding: 'utf8', env: { ...process.env, PASEOBILITY_CATALOG_HOME: f.home },
  });
  assert.equal(override.status, 0);
  assert.equal(override.stdout, '');
});

test('help and no arguments do not scan or create files; invalid CLI options fail', t => {
  const f = fixture(t);
  f.write('.paseobility/catalog/sources.json', 'invalid');
  const before = fs.readdirSync(f.home, { recursive: true }).sort();
  for (const args of [[], ['--help']]) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8', env: { ...process.env, PASEOBILITY_CATALOG_HOME: f.home },
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.equal(result.stderr, '');
  }
  assert.deepEqual(fs.readdirSync(f.home, { recursive: true }).sort(), before);
  for (const args of [['search', 'alpha'], ['path'], ['list', '--wat'], ['budget', '--names'],
    ['list', '--json', '--names'], ['--home'], ['path', 'alpha', '--json']])
    assert.equal(f.run(...args).status, 1, args.join(' '));
});

test('every run scans live changes without a cache or usage log', t => {
  const f = fixture(t);
  const file = f.skill('agents', 'alpha', 'Before');
  assert.equal(f.json('list')[0].description, 'Before');
  fs.writeFileSync(file, '---\nname: alpha\ndescription: After\n---\n');
  assert.equal(f.json('list')[0].description, 'After');
  assert.equal(fs.existsSync(path.join(f.home, '.paseobility')), false);
  assert.equal(scan(f.home).records.length, 1);
});
