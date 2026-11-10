#!/usr/bin/env node
'use strict';

// Scanned skills are data. Never load their JavaScript, run their commands, or
// write an index into an agent home. Node 20+, stdlib only.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');

const DEFAULT_IDS = ['agents', 'claude', 'codex', 'hermes'];
const TOOLS = ['skill_view', 'skill_manage', 'skills_list', 'session_search', 'delegate_task', 'cronjob'];
const USAGE = `Usage: node skill-catalog.js <command> [options]
  list [--names | --json]   List skills; the agent chooses, without keyword search
  path <name[@source]>     Original SKILL.md path and compatibility warnings
  conflicts [--json]       Stale/split copies, unreadable skills, broken references
  budget [--json]          Per-source frontmatter characters and ten largest skills
  --home <path>            Override home (or PASEOBILITY_CATALOG_HOME)
  --help                  Show this help; no arguments also show help

Sources: <home>/.{agents,claude,codex,hermes}/skills (missing roots are skipped).
Optional <home>/.paseobility/catalog/sources.json: {"sources":[{"id":"vault",
"path":"~/skill-vault"}],"priority":["vault","agents","hermes","claude","codex"]}
Relative source paths resolve under home. Invalid configuration uses defaults.
Default priority: agents, extra sources in file order, hermes, claude, codex.
Scans at most four directory levels below each root, without installing anything.
`;

// Remove ANSI sequences as well as C0/C1 controls and bidirectional controls.
function clean(value) {
  return String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '');
}
function oneLine(value) { return clean(String(value).replace(/\s+/g, ' ')).trim(); }
function safeName(value) {
  return !!value && !/[\\/\x00-\x1f\x7f-\x9f]/.test(value) && !value.includes('..');
}
function scalar(value) {
  const text = value.trim();
  if (text.startsWith('"')) {
    const quoted = /^("(?:\\.|[^"\\])*")\s*(?:#.*)?$/.exec(text);
    if (quoted) {
      try { return JSON.parse(quoted[1]); } catch { return quoted[1].slice(1, -1); }
    }
  }
  if (text.startsWith("'")) {
    const quoted = /^'((?:''|[^'])*)'\s*(?:#.*)?$/.exec(text);
    if (quoted) return quoted[1].replace(/''/g, "'");
  }
  return text.replace(/\s+#.*$/, '').trim();
}

function frontmatter(text) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { error: 'missing frontmatter', body: text, chars: 0 };
  const lines = match[1].split(/\r?\n/), data = {};
  for (let i = 0; i < lines.length; i++) {
    const field = /^(name|description):[ \t]*(.*)$/.exec(lines[i]);
    if (!field) continue;
    const [, key] = field;
    let value = field[2];
    const marker = /^([>|])([+-]?)(?:\s+#.*)?$/.exec(value.trim());
    if (marker) {
      const block = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1].trim()))
        block.push(lines[++i]);
      const indents = block.filter(line => line.trim()).map(line => /^\s*/.exec(line)[0].length);
      const indent = indents.length ? Math.min(...indents) : 0;
      const content = block.map(line => line.slice(indent));
      let result = content.join('\n');
      if (marker[1] === '>') {
        // YAML folding joins ordinary adjacent lines, retaining paragraph and
        // more-indented line breaks. Chomping is applied separately below.
        result = content.map((line, n) => {
          if (n === content.length - 1) return line;
          const next = content[n + 1];
          const separator = line && next && !/^\s/.test(line) && !/^\s/.test(next) ? ' ' :
            !line && next && n > 0 && !/^\s/.test(next) ? '' : '\n';
          return line + separator;
        }).join('');
      }
      if (marker[2] !== '+') result = result.replace(/\n+$/, '');
      data[key] = result + (marker[2] === '-' || !block.length ? '' : '\n');
    } else {
      // YAML quoted scalars can wrap across indented lines; unlike block
      // scalars their ordinary newlines fold into spaces.
      if (/^["']/.test(value) && !/^["'].*["']\s*(?:#.*)?$/.test(value)) {
        while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) value += ' ' + lines[++i].trim();
      }
      data[key] = scalar(value);
    }
  }
  return { ...data, body: text.slice(match[0].length), chars: match[0].length,
    error: !data.description?.trim() ? 'missing description' : null };
}

function sourcesFor(home, warn) {
  const defaults = DEFAULT_IDS.map(id => ({ id, path: path.join(home, `.${id}`, 'skills') }));
  const filename = path.join(home, '.paseobility', 'catalog', 'sources.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') warn('Invalid sources.json; using default sources and priority.');
    return { sources: defaults, priority: ['agents', 'hermes', 'claude', 'codex'] };
  }
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error();
    const extras = config.sources === undefined ? [] : config.sources;
    if (!Array.isArray(extras)) throw Error();
    const ids = new Set(DEFAULT_IDS);
    const sources = [...defaults];
    for (const extra of extras) {
      if (!extra || typeof extra.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(extra.id) || ids.has(extra.id) ||
          typeof extra.path !== 'string' || !extra.path.trim() || /[\x00-\x1f]/.test(extra.path)) throw Error();
      ids.add(extra.id);
      const expanded = extra.path === '~' ? home : /^~[\\/]/.test(extra.path) ? path.join(home, extra.path.slice(2)) : extra.path;
      sources.push({ id: extra.id, path: path.resolve(home, expanded) });
    }
    const fallback = ['agents', ...extras.map(s => s.id), 'hermes', 'claude', 'codex'];
    const requested = config.priority === undefined ? fallback : config.priority;
    if (!Array.isArray(requested) || new Set(requested).size !== requested.length ||
        requested.some(id => !ids.has(id))) throw Error();
    return { sources, priority: [...requested, ...fallback.filter(id => !requested.includes(id))] };
  } catch {
    warn('Invalid sources.json; using default sources and priority.');
    return { sources: defaults, priority: ['agents', 'hermes', 'claude', 'codex'] };
  }
}

function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function scan(home, warn = () => {}) {
  const { sources, priority } = sourcesFor(home, warn);
  const records = [], problems = [], counts = new Map();
  for (const source of sources) {
    counts.set(source.id, []);
    const seen = new Set();
    function walk(dir, depth) {
      let real, children;
      try {
        real = fs.realpathSync(dir);
        if (seen.has(real)) return;
        seen.add(real);
        children = fs.readdirSync(dir, { withFileTypes: true });
      } catch (error) {
        if (depth || error.code !== 'ENOENT') problems.push({ type: 'unreadable', source: source.id, path: dir, message: error.code || 'read failed' });
        return;
      }
      const file = path.join(dir, 'SKILL.md');
      if (children.some(child => child.name === 'SKILL.md')) {
        let bytes, parsed;
        try {
          if (!fs.statSync(file).isFile()) throw Object.assign(Error('not a regular file'), { code: 'NOT_FILE' });
          bytes = fs.readFileSync(file);
          parsed = frontmatter(bytes.toString('utf8'));
        }
        catch (error) {
          problems.push({ type: 'unreadable', source: source.id, path: file, message: error.code || 'read failed' });
          return;
        }
        const name = parsed.name?.trim() || path.basename(dir);
        counts.get(source.id).push({ name, path: file, characters: parsed.chars });
        if (parsed.error || !safeName(name) || name.includes('@')) {
          problems.push({ type: 'invalid', source: source.id, path: file, name, message: parsed.error || 'unsafe skill name' });
          return;
        }
        records.push({ name, source: source.id, path: path.resolve(file), description: parsed.description.trim(),
          body: parsed.body, hash: createHash('sha256').update(bytes).digest('hex') });
        return; // A skill owns its subtree; its bundled skills are not entries.
      }
      if (depth === 4) return;
      for (const child of children.sort((a, b) => compare(a.name, b.name))) {
        if (child.name.startsWith('.') || ['node_modules', 'vendor'].includes(child.name)) continue;
        if (child.isDirectory() || child.isSymbolicLink()) {
          const next = path.join(dir, child.name);
          if (child.isSymbolicLink()) {
            try { if (!fs.statSync(next).isDirectory()) continue; }
            catch (error) {
              problems.push({ type: 'unreadable', source: source.id, path: next, message: error.code || 'broken symlink' });
              continue;
            }
          }
          walk(next, depth + 1);
        }
      }
    }
    walk(source.path, 0);
  }
  records.sort((a, b) => priority.indexOf(a.source) - priority.indexOf(b.source) || compare(a.path, b.path));
  const groups = new Map(), entries = [];
  for (const record of records) {
    if (!groups.has(record.name)) groups.set(record.name, []);
    groups.get(record.name).push(record);
  }
  for (const [name, copies] of groups) {
    const representatives = [];
    for (const copy of copies) {
      const same = representatives.find(r => r.hash === copy.hash || r.description === copy.description);
      if (same) {
        same.others.push(copy);
        if (same.hash !== copy.hash) problems.push({ type: 'stale', name, source: copy.source, path: copy.path, selected: same.path, message: 'different content, same description' });
      } else {
        const entry = { ...copy, name: representatives.length ? `${name}@${copy.source}` : name, others: [] };
        representatives.push(entry);
        entries.push(entry);
        if (representatives.length > 1) problems.push({ type: 'split', name: entry.name, source: copy.source, path: copy.path, selected: copies[0].path, message: 'different content and description' });
      }
    }
  }
  return { sources, counts, records, groups, problems, entries: entries.sort((a, b) => compare(a.name, b.name)) };
}

function related(a, b) {
  if (a === b) return false;
  if (a.startsWith(b) || b.startsWith(a) || a.endsWith(b) || b.endsWith(a)) return true;
  let n = 0;
  while (n < Math.min(a.length, b.length) && a[n] === b[n]) n++;
  // Catch inflections with a suffix (for example, a verb and its agent noun).
  return n >= 6 && n / Math.min(a.length, b.length) >= 0.7;
}

function warnings(record, catalog) {
  const notes = [];
  for (const other of catalog.groups.get(record.name) || [])
    if (other.hash !== record.hash) notes.push(`other copy has different content: ${other.source}: ${other.path}`);
  const dir = path.dirname(record.path);
  for (const folder of ['references', 'scripts']) {
    try { if (!fs.statSync(path.join(dir, folder)).isDirectory()) notes.push(`${folder} exists as a file instead of a folder`); }
    catch (error) { if (error.code !== 'ENOENT') notes.push(`cannot inspect ${folder}: ${error.code}`); }
  }
  const refs = new Set();
  const pattern = /(?:^|[\s(`"'\[])(?:\.\/)?((?:references|scripts|agents|templates|assets)\/[^\s`"'<>\[\](){}]+)/gm;
  for (const match of record.body.matchAll(pattern)) {
    // Markdown fragments and URL queries do not belong to a local filename.
    const ref = match[1].split(/[?#]/)[0].replace(/[.,;:!?]+$/, '');
    refs.add(ref);
  }
  for (const ref of refs) {
    try { fs.accessSync(path.resolve(dir, ref)); }
    catch { notes.push(`missing relative file: ${ref}`); }
  }
  const tools = TOOLS.filter(tool => new RegExp(`\\b${tool}\\b`).test(record.body));
  if (tools.length) notes.push(`requires Hermes-only tools: ${tools.join(', ')}; do not use unless equivalent tools are available`);
  const similar = [...catalog.groups.keys()].filter(name => related(record.name, name));
  if (similar.length) notes.push(`similar names (prefix or suffix): ${similar.sort(compare).join(', ')}`);
  return notes;
}

function publicEntry(entry) {
  return { name: entry.name, source: entry.source, path: entry.path, description: entry.description,
    otherLocations: entry.others.map(other => ({ source: other.source, path: other.path })) };
}
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length];
}
function main(argv = process.argv.slice(2), env = process.env) {
  const out = value => process.stdout.write(value + '\n');
  const json = value => out(JSON.stringify(value, (_, item) => typeof item === 'string' ? clean(item) : item, 2));
  const err = value => process.stderr.write(oneLine(value) + '\n');
  if (!argv.length || argv.includes('--help')) { process.stdout.write(USAGE); return 0; }
  let home = env.PASEOBILITY_CATALOG_HOME || os.homedir(), names = false, asJson = false;
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--home') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) { err('--home requires a path'); return 1; }
      home = argv[++i];
    } else if (argv[i] === '--json') asJson = true;
    else if (argv[i] === '--names') names = true;
    else args.push(argv[i]);
  }
  const [command, name] = args;
  if (!['list', 'path', 'conflicts', 'budget'].includes(command) || args.length !== (command === 'path' ? 2 : 1) ||
      (names && (command !== 'list' || asJson)) || (asJson && command === 'path')) {
    err('Invalid arguments. Run --help for usage.'); return 1;
  }
  if (command === 'path' && !safeName(name)) { err('Unsafe skill name; use a name from list.'); return 1; }
  const catalog = scan(path.resolve(home), err);
  if (command === 'list') {
    if (asJson) json(catalog.entries.map(publicEntry));
    else if (names) out(catalog.entries.map(e => oneLine(e.name)).join(' '));
    else for (const entry of catalog.entries) {
      const chars = Array.from(oneLine(entry.description));
      out(`${oneLine(entry.name)} — ${chars.length > 110 ? chars.slice(0, 109).join('') + '…' : chars.join('')}`);
    }
  } else if (command === 'path') {
    const entry = catalog.entries.find(e => e.name === name);
    const record = entry ? catalog.records.find(r => r.path === entry.path && r.source === entry.source) :
      catalog.records.find(r => `${r.name}@${r.source}` === name);
    if (!record) {
      const closest = catalog.entries.map(e => e.name).sort((a, b) => distance(name, a) - distance(name, b) || compare(a, b)).slice(0, 3);
      err(`Unknown skill: ${name}. Closest names: ${closest.join(', ') || '(none)'}`); return 1;
    }
    out(clean(record.path));
    for (const note of warnings(record, catalog)) out(`note: ${oneLine(note)}`);
  } else if (command === 'conflicts') {
    const problems = [...catalog.problems];
    for (const record of catalog.records) for (const message of warnings(record, catalog)) {
      if (/^(missing relative file|references exists|scripts exists|cannot inspect)/.test(message))
        problems.push({ type: 'reference', name: record.name, source: record.source, path: record.path, message });
    }
    if (asJson) json(problems);
    else for (const problem of problems) out(oneLine(`${problem.type}: ${problem.name || '(unknown)'} [${problem.source}] ${problem.path}: ${problem.message}`));
  } else {
    const budget = catalog.sources.map(source => {
      const skills = catalog.counts.get(source.id);
      return { source: source.id, skills: skills.length, characters: skills.reduce((n, s) => n + s.characters, 0),
        largest: [...skills].sort((a, b) => b.characters - a.characters || compare(a.path, b.path)).slice(0, 10) };
    });
    if (asJson) json(budget);
    else for (const source of budget) {
      out(`${source.source}: ${source.skills} skills, ${source.characters} frontmatter characters`);
      for (const item of source.largest) out(`  ${oneLine(item.name)}: ${item.characters}`);
    }
  }
  return 0;
}
if (require.main === module) process.exitCode = main();
module.exports = { frontmatter, scan, warnings, main };
