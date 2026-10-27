# CloakBrowser backend (explicit alternative)

Use only when the task requests isolation/stealth/headless automation or a
specific verification workflow requires it. The ordinary Ego Lite / existing Chrome
workflow is described in [../SKILL.md](../SKILL.md). `launch()` creates
a separate browser; it cannot implement personal Chrome tab reuse.

## Source and pinned version

- Package: **`cloakbrowser@0.6.3`** (npm, supports **ESM and CommonJS**). `dist.integrity`
  `sha512-mkogz/HHYPsd01rhRyLfU5raXeGbZVv2m5bmVr+6qAqlN8zK6gA5NOaNcaGhj2wCPeJc/xT/Rxglu9MCF8ZqQw==`,
  shasum `fe46fc35997bb73e5e597dcbe183bb6d402a29b9`.
- Source: <https://github.com/CloakHQ/CloakBrowser>, release tag `v0.6.3`,
  immutable commit `fbf005bc199920b592df17ac4d489324e29d56d8` (== npm `gitHead`).
- Playwright peer: `playwright-core@1.64.1` (peer range `>=1.53.0`; pinned for
  reproducibility).
- **Node.js ^20.19.0 or >=22.12.0** (the package engine range). Recipes use
  dynamic `import()`; CommonJS is also supported. Verified on Node 22.23.2.
- Wrapper license: **MIT**. Binary license: CloakHQ's `BINARY-LICENSE.md`.

## Latest wrapper ≠ latest browser binary, and current binary terms

The npm tag `0.6.3` is the **wrapper** version; it does **not** imply the
newest browser binary.

- **Keyless free binary** — what a launch with no license key downloads, pinned
  per platform by the wrapper (`PLATFORM_CHROMIUM_VERSIONS`). On Apple Silicon
  macOS that is **Chromium 145.0.7632.109**; on Linux x64/arm64 and Windows x64
  it is **Chromium 146.0.7680.177.x**.
- **Latest keyed binary** — Chromium 154 on Linux, Windows and macOS with the full patch set. This is **free with a GitHub-issued key for one
  concurrent session** (<https://cloakbrowser.dev/free>) or a paid key for more
  sessions/scaling. A paid subscription is **not** mandatory to use a current
  build.
- Binary terms: v146-and-earlier free binaries are usable for personal and
  commercial use (no redistribution); v148+ terms are governed by the active
  CloakHQ offer and subscription tiers, which can change (`BINARY-LICENSE.md`).
  This is separate from the MIT wrapper license. **Do not redistribute binaries.**

This skill never runs `cloakbrowser login`, never solicits or stores a license
key, and never prints key material. If a task needs the latest keyed binary, the
user supplies the key out of band (`CLOAKBROWSER_LICENSE_KEY`); otherwise use the
keyless free binary and report exactly which binary ran.

## Upgrade notes for 0.6.3

Update `cloakbrowser` and `playwright-core` together. 0.6.3 reworks humanized
typing/mouse/scroll (five humanize settings are now ignored in JS) and fixes
humanized clicks inside scrollers and navigating `selectOption`; playwright-core
1.64.1 is a patch release. Neither changes the free binary pins. Keep the
runtime's exact pins and lockfile.

In 0.6.x, humanized locators use strict matching and raise errors instead of
silently falling back. Use a more specific locator for multiple matches.
Persistent contexts now save one fingerprint seed per profile; keep that file
with the profile directory. Binary downloads stage atomically for concurrent
first launches. No persistent profile or licensed browser is needed by the
ordinary incognito fixture recipes below.

## Paseobility-owned runtime (no global install)

Installed here (exact pins, own lockfile) — **not** a global npm install and
`HOME` is never repurposed:

```text
$HOME/.local/share/paseobility/browser/cloakbrowser/
  package.json        # cloakbrowser 0.6.3 + playwright-core 1.64.1 (exact)
  package-lock.json   # lockfile
  node_modules/
  cache/              # CLOAKBROWSER_CACHE_DIR: verified stealth-Chromium binary
```

Reproduce on another machine:

```bash
RUNTIME="${PASEOBILITY_CLOAK_RUNTIME:-$HOME/.local/share/paseobility/browser/cloakbrowser}"
mkdir -p "$RUNTIME" && cd "$RUNTIME"
npm init -y >/dev/null
npm install --save-exact --no-audit --no-fund cloakbrowser@0.6.3 playwright-core@1.64.1
```

Load from the runtime path with dynamic `import()` (respects a custom
`PASEOBILITY_CLOAK_RUNTIME`; no global/npx dependency):

```js
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const R = process.env.RUNTIME
  || process.env.PASEOBILITY_CLOAK_RUNTIME
  || path.join(os.homedir(), '.local/share/paseobility/browser/cloakbrowser');
const cloak = await import(pathToFileURL(path.join(R, 'node_modules/cloakbrowser/dist/index.js')).href);
// cloak.launch, cloak.buildLaunchOptions, cloak.ensureBinary, cloak.binaryInfo
```

## Installer / copying policy

Skill copying stays **docs-only** for this backend. The convenience installers
(including a temp `--target-home`) do **not** install Node packages, download the
browser binary, or touch `~/.local/share/paseobility`. Set up the runtime
explicitly with the recipe above; the skill reports a missing runtime instead of
pretending install succeeded.

## Binary cache and auto-update

- Cache dir: `CLOAKBROWSER_CACHE_DIR`. Recipes here default it to `$RUNTIME/cache`
  so nothing lands in the global `~/.cloakbrowser`. A pre-populated cache avoids
  a re-download; a cold cache downloads and verifies.
- Automatic updates: `CLOAKBROWSER_AUTO_UPDATE=false` for reproducible pinned
  runs; update explicitly when intended.
- Binary downloads are authenticated: the wrapper verifies a detached **Ed25519
  signature** over `SHA256SUMS`, then the archive SHA-256, before extraction. A
  verification failure aborts loudly and never falls back to a different binary.
- macOS: the binary is ad-hoc signed. If Gatekeeper actually blocks the first
  launch, follow CloakHQ's upstream guidance (right-click the app → Open → Open),
  or run once upstream's own documented `xattr -cr <that exact Chromium.app>`.
  Do not blanket-quarantine-clear; use the exact path the wrapper reports.

## Platform support (wrapper)

| Platform | Keyless free | Latest (keyed) |
| --- | --- | --- |
| Linux x64 / arm64 | Chromium 146 | Chromium 154 |
| macOS arm64 / x64 | Chromium 145 | Chromium 154 |
| Windows x64 | Chromium 146 | Chromium 154 |

## Diagnostics

Respect the configured runtime and cache:

```bash
RUNTIME="${PASEOBILITY_CLOAK_RUNTIME:-$HOME/.local/share/paseobility/browser/cloakbrowser}"
export PASEOBILITY_CLOAK_RUNTIME="$RUNTIME"
export RUNTIME
export CLOAKBROWSER_CACHE_DIR="${CLOAKBROWSER_CACHE_DIR:-$RUNTIME/cache}"
node --input-type=module - <<'NODE'
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const R = process.env.RUNTIME;
const m = await import(pathToFileURL(path.join(R, 'node_modules/cloakbrowser/dist/index.js')).href);
console.log(m.binaryInfo());
NODE
```

`binaryInfo()` reports the binary that will actually launch, its platform tag,
install state, and cache dir. `ensureBinary()` pre-downloads.

## Recipes

Set up once per shell (main core loop in SKILL.md repeats this):

```bash
export PASEOBILITY_CLOAK_RUNTIME="${PASEOBILITY_CLOAK_RUNTIME:-$HOME/.local/share/paseobility/browser/cloakbrowser}"
export RUNTIME="$PASEOBILITY_CLOAK_RUNTIME"
export CLOAKBROWSER_CACHE_DIR="${CLOAKBROWSER_CACHE_DIR:-$RUNTIME/cache}"
export CLOAKBROWSER_AUTO_UPDATE=false
```

All recipes close the browser in `finally` and use an explicit
`newContext()`/`newPage()`.

### Read a page and print semantic state

```bash
URL="${URL:?set URL to the page to read}"
node --input-type=module - "$URL" <<'NODE'
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const R = process.env.RUNTIME;
if (!process.argv[2]) { console.error('usage: <url> required'); process.exit(2); }
const { launch } = await import(pathToFileURL(path.join(R, 'node_modules/cloakbrowser/dist/index.js')).href);
let browser;
try {
  browser = await launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(15000);
  await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log(await page.locator('body').ariaSnapshot());
} catch (e) {
  console.error('BROWSER_ERROR', e.message); process.exitCode = 4;
} finally {
  if (browser) await browser.close();
}
NODE
```

### Fill two fields, compute a sum, verify in a fresh read

Local-fixture flow exercised in validation (A=7, B=5 -> 12).

```bash
URL="${URL:?set URL to the fixture page}"
TASK_DIR="${TASK_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/paseo-cloak-XXXXXX")}"
mkdir -p "$TASK_DIR"
node --input-type=module - "$URL" "$TASK_DIR" <<'NODE'
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const R = process.env.RUNTIME;
const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) { console.error('usage: node script.mjs <url> <taskDir>'); process.exit(2); }
const { launch } = await import(pathToFileURL(path.join(R, 'node_modules/cloakbrowser/dist/index.js')).href);
let browser;
try {
  browser = await launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(15000);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByLabel('A', { exact: true }).fill('7');
  await page.getByLabel('B', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Compute', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('result').textContent === '12', null, { timeout: 5000 });
  console.log('result', await page.getByRole('status').textContent()); // fresh 12
  console.log(await page.locator('main').ariaSnapshot());          // fresh semantics
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: path.join(outDir, 'desktop.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: path.join(outDir, 'mobile.png') });
} catch (e) {
  console.error('BROWSER_ERROR', e.message); process.exitCode = 4;
} finally {
  if (browser) await browser.close();
}
NODE
```

### Wait for the postcondition, then re-read

A click waits for the control to be actionable; it does not wait for every
asynchronous consequence. For a navigation, wait for its known destination:

```js
await page.getByRole('link', { name: 'Details', exact: true }).click();
await page.waitForURL('**/details', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log(await page.locator('main').ariaSnapshot());
```

For a DOM update, use a bounded predicate on the expected visible result, like
the adder recipe above. `evaluate` may change page state when that is the
quickest way to do the task; never print credential values. If the project already uses Playwright Test, its auto-retrying
`expect(locator).toHaveText(...)` is appropriate; these standalone recipes do
not add that dependency just for assertions. Prefer a bounded expected-state
signal over fixed waits or `networkidle`; if no observable postcondition is
available, report the result as unverified. See [Playwright best practices](https://playwright.dev/docs/best-practices)
and [the Page API](https://playwright.dev/docs/api/class-page#page-wait-for-function).

### Console / network diagnostics (scoped)

```js
page.on('console', m => { if (m.type() === 'error') console.log('console error', m.text()); });
page.on('requestfailed', r => console.log('requestfailed', r.url()));
page.on('response', r => { if (r.status() >= 400) console.log('http', r.status(), r.url()); });
```

Scope capture to the step under test; response bodies and URLs can contain
secrets. Do not dump full bodies into the transcript.

### Trace and PDF (still inside the try/finally)

```js
const context = await browser.newContext();
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
// ... bounded steps ...
await context.tracing.stop({ path: path.join(outDir, 'trace.zip') });
await page.pdf({ path: path.join(outDir, 'page.pdf') });   // Chromium only, headless
```

### Agent profiles

A reusable, agent-owned login profile under
`$PASEOBILITY_BROWSER_PROFILES/<name>` (default
`~/.local/share/paseobility/browser/profiles/<name>`). It keeps cookies and the
CloakBrowser fingerprint seed between tasks, so a site signed in once stays
signed in.

First interactive login — open one headed session when user interaction is
needed, then close it. Reuse that session; do not start another while waiting.
If login can be completed without user interaction, use headless mode instead.

```bash
node --input-type=module - "$PROFILE" "https://github.com/login" <<'NODE'
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const R = process.env.RUNTIME;
const [profile, url] = process.argv.slice(2);
const { launchPersistentContext } = await import(
  pathToFileURL(path.join(R, 'node_modules/cloakbrowser/dist/index.js')).href
);
const ctx = await launchPersistentContext({ userDataDir: profile, headless: false });
try {
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log('Sign in in the opened window, then close it.');
  // macOS keeps Chromium alive after the last window, so also watch the tabs.
  await new Promise(resolve => {
    ctx.on('close', resolve);
    const check = () => { if (ctx.pages().length === 0) resolve(); };
    ctx.on('page', p => p.on('close', check));
    ctx.pages().forEach(p => p.on('close', check));
  });
} finally {
  await ctx.close().catch(() => {});
}
NODE
```

Later runs reuse it headless and log write actions:

```js
import fs from 'node:fs';
const ctx = await launchPersistentContext({ userDataDir: profile, headless: true });
const logAction = (site, action) => fs.appendFileSync(
  path.join(profile, 'actions.log'), `${new Date().toISOString()} ${site} ${action}\n`);
try {
  const page = ctx.pages()[0] ?? await ctx.newPage();
  // ... task steps ...
  logAction('github.com', 'opened PR #12 review and approved');
} finally {
  await ctx.close();
}
```

One process per profile at a time; Chromium locks the directory. If a site
logged the profile out, rerun the headed login.

## Error handling

- Missing runtime/binary: the process exits non-zero with a clear message;
  report it; do not silently substitute another browser for the requested one.
- Failed navigation/action/screenshot: caught, reported, `process.exitCode = 4`,
  and the browser is still closed in `finally` (no leaked child process).
- A mismatched/failed binary download aborts on signature/checksum failure.
- A missing/empty task input (`URL`, `TASK_DIR`) fails the usage check **before**
  launch.

## Scope and policy

- Headless by default; headed only when the user requests a visible session or
  interactive login requires it. Reuse one context/page across task steps.
  Incognito for one-off pages,
  agent profiles for signed-in work. Never import the user's personal Chrome
  cookies or storage.
- No new MCP server, no alias skill, no new default runtime effects in the
  installers, no global npm installs, no PaaS/cloud/proxy infrastructure.
- Distinguish the wrapper CLI (`npx cloakbrowser login|info|update`, which manages
  keys/cache) from actual page automation (the Playwright API above).
