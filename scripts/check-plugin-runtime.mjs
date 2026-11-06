#!/usr/bin/env node
// Exercise the published Paseo compiler/SDK. Does not start a daemon or browser.
// npm install --prefix /tmp/paseo-check @getpaseo/cli@VERSION @getpaseo/plugin@VERSION
// node scripts/check-plugin-runtime.mjs /tmp/paseo-check [isolated-daemon-home]
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const runtime = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Expected npm runtime prefix');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = path.join(runtime, 'node_modules');
const load = (name) => import(pathToFileURL(path.join(modules, name)).href);
// A newer controller can render a bundle compiled by an older remote daemon.
const clientRuntime = path.resolve(process.env.PASEO_PLUGIN_CLIENT_RUNTIME || runtime);
const clientModules = path.join(clientRuntime, 'node_modules');
const loadClient = (name) => import(pathToFileURL(path.join(clientModules, name)).href);
const requireRuntime = createRequire(path.join(clientRuntime, 'package.json'));
const version = JSON.parse(await readFile(path.join(modules, '@getpaseo/cli/package.json'))).version;
const appVersion = JSON.parse(await readFile(path.join(clientModules, '@getpaseo/cli/package.json'))).version;
const compiler = await load('@getpaseo/server/dist/server/server/plugins/compiler.js');
const { assertPluginCompatibility } = await load('@getpaseo/protocol/dist/plugin-requirements.js');
const directory = path.join(root, 'plugin');
const manifest = JSON.parse(await readFile(path.join(directory, 'paseo-plugin.json')));
assertPluginCompatibility({ ...manifest, version, runtime: 'daemon' });
// 0.13 exposes entry compilation; 0.14+ also exposes the directory wrapper.
const bundle = typeof compiler.compileDirectoryPlugin === 'function'
  ? await compiler.compileDirectoryPlugin(directory, version)
  : { manifest, ...await compiler.compilePlugin({
      client: path.join(directory, 'index.client.tsx'),
      server: path.join(directory, 'index.server.ts'),
    }) };
const { assertPluginCompatibility: assertAppCompatibility } = await loadClient('@getpaseo/protocol/dist/plugin-requirements.js');
assertAppCompatibility({ ...bundle.manifest, version: appVersion, runtime: 'app' });
const clientSdk = await loadClient('@getpaseo/plugin/dist/client/index.js');
const sharedSdk = await loadClient('@getpaseo/plugin/dist/index.js');
const { PluginTranslationRuntime } = await loadClient('@getpaseo/plugin/dist/client/translations.js');
const translation = new PluginTranslationRuntime({ getLocale: () => 'en', subscribe: () => () => {} });
const registrations = new Map();
const warnings = [];
let listener, unsubscribed = false, pillRemoved = false;
const timers = new Set();
const hostRequire = (id) => {
  if (id === '@getpaseo/plugin/client') return clientSdk;
  if (id === '@getpaseo/plugin') return sharedSdk;
  // Only rendering is stubbed; this checks entry registration, not visual layout.
  if (id === '@getpaseo/plugin/client/ui') return { SidebarRow: () => null, Icon: () => null };
  if (id === 'react-native') return { Platform: { OS: 'web', select: x => x.web }, StyleSheet: { create: x => x } };
  if (id === '@tanstack/react-query') return {};
  return requireRuntime(id);
};
const context = vm.createContext({
  console: { ...console, warn: (...args) => warnings.push(args.map(String).join(' ')) },
  setInterval: (fn) => { timers.add(fn); return fn; },
  clearInterval: (fn) => timers.delete(fn),
});
const entry = vm.runInContext(bundle.clientBundle, context)(hostRequire).default;
const register = (kind) => (value) => { registrations.set(kind, value); return { remove() {} }; };
const dispose = entry({
  i18n: { t: translation.t.bind(translation) },
  addScreen: register('screen'), addSidebarHeaderItem: register('sidebar'),
  addAttachmentSource: register('attachment'), addCommandCenterItem: register('command'),
  addComposerPill(value) { registrations.set('pill', value); return { remove() { pillRemoved = true; } }; },
  paseo: { agents: {
    subscribe(fn) { listener = fn; return () => { unsubscribed = true; }; },
    async list() { return { entries: [{ agent: { id: 'fixture', workspaceId: 'workspace' } }], pageInfo: { hasMore: false } }; },
  } },
});
try {
  await new Promise(resolve => setImmediate(resolve));
  for (const name of ['screen', 'sidebar', 'attachment', 'command', 'pill']) assert(registrations.has(name), name);
  assert.equal(translation.resolve(registrations.get('command').title), 'Open Paseobility');
  assert.equal(registrations.get('attachment').search.name, 'skills.search');
  listener({ kind: 'upsert', agent: { id: 'fixture', workspaceId: 'workspace', archivedAt: 'now' } });
  assert(pillRemoved);
  assert.deepEqual(warnings, []);
} finally { dispose(); translation.dispose(); }
assert(unsubscribed); assert.equal(timers.size, 0);
console.log(JSON.stringify({ version, appVersion, compiler: 'pass', appGuard: 'pass', registrations: [...registrations.keys()], cleanup: 'pass', visualLayout: 'not-tested' }));

if (process.argv[3]) {
  const { connectToDaemon } = await load('@getpaseo/cli/dist/utils/client.js');
  const { createPaseoApi } = await load('@getpaseo/client/dist/index.js');
  const client = await connectToDaemon({ target: { kind: 'instance', home: path.resolve(process.argv[3]) }, timeout: 15000 });
  const api = createPaseoApi(client);
  let stop;
  try {
    // The real API used by followAgentPills must still support subscription + list.
    stop = api.agents.subscribe(() => {});
    const agents = await api.agents.list({ filter: { includeArchived: false }, page: { limit: 200 } });
    assert(Array.isArray(agents.entries));
    const plugins = await client.listPlugins();
    assert.equal(plugins.find(p => p.id === 'paseobility')?.status, 'running');
    const status = await client.invokePluginRpc('paseobility', 'skills.status', {});
    assert.equal(status.skills.length, 12);
    const search = await client.invokePluginRpc('paseobility', 'skills.search', { query: 'browser' });
    assert.equal(search.items[0]?.id, 'paseo-browser');
    assert.match(search.items[0].text, /Read its SKILL.md/);
    console.log(JSON.stringify({ version, livePlugin: 'running', skillsStatus: 'pass', browserSearch: 'pass', agentApi: 'pass' }));
  } finally { stop?.(); await api.dispose(); await client.close(); }
}
