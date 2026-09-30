# CloakBrowser backend (default)

`paseo-browser` drives pages with **CloakBrowser** — a stealth Chromium binary
wrapped by the `cloakbrowser` package's Playwright API. Load this for setup,
diagnostics, and full recipes. Paseo `browser_*` ([paseo.md](paseo.md)) and the
Microsoft Playwright CLI ([playwright.md](playwright.md)) are optional
compatibility backends; they are not substituted when CloakBrowser fails.

## Source and pinned version

- Package: **`cloakbrowser@0.5.11`** (npm, **ESM** — `exports` only exposes
  `import`). `dist.integrity`
  `sha512-fyNjE+w6oGAOuUe4JeHRfzbGZMe3lLCvdpJ1dLRHFT/RkD5FWvP7MHvwVgmnCY8lVUcKWuVxHfJgfGafg3IgQg==`,
  shasum `9596362acf49040c8e8053b0d1d0f0e8d42252bb`.
- Source: <https://github.com/CloakHQ/CloakBrowser>, release tag `v0.5.11`,
  immutable commit `9bc5e374d7fc3a4099360bbd93e570b1e7ec8618` (== npm `gitHead`).
- Playwright peer: `playwright-core@1.63.0` (peer range `>=1.53.0`; pinned for
  reproducibility).
- **Node.js >= 20** (the package engine minimum). Recipes load the ESM package
  with dynamic `import()`, which is supported on Node 20's module API. Verified
  on Node 22.23.2.
- Wrapper license: **MIT**. Binary license: CloakHQ's `BINARY-LICENSE.md`.

## Latest wrapper ≠ latest browser binary, and current binary terms

The npm tag `0.5.11` is the **wrapper** version; it does **not** imply the
newest browser binary.

- **Keyless free binary** — what a launch with no license key downloads, pinned
  per platform by the wrapper (`PLATFORM_CHROMIUM_VERSIONS`). On Apple Silicon
  macOS that is **Chromium 145.0.7632.109**; on Linux x64/arm64 and Windows x64
  it is **Chromium 146.0.7680.177.x**.
- **Latest keyed binary** — a newer Chromium (152-class on Linux/Windows, 151 on
  macOS) with the full patch set. This is **free with a GitHub-issued key for one
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

## Paseobility-owned runtime (no global install)

Installed here (exact pins, own lockfile) — **not** a global npm install and
`HOME` is never repurposed:

```text
$HOME/.local/share/paseobility/browser/cloakbrowser/
  package.json        # cloakbrowser 0.5.11 + playwright-core 1.63.0 (exact)
  package-lock.json   # lockfile
  node_modules/
  cache/              # CLOAKBROWSER_CACHE_DIR: verified stealth-Chromium binary
```

Reproduce on another machine:

```bash
RUNTIME="${PASEOBILITY_CLOAK_RUNTIME:-$HOME/.local/share/paseobility/browser/cloakbrowser}"
mkdir -p "$RUNTIME" && cd "$RUNTIME"
npm init -y >/dev/null
npm install --save-exact --no-audit --no-fund cloakbrowser@0.5.11 playwright-core@1.63.0
```

Load from the runtime path with dynamic `import()` (respects a custom
`PASEOBILITY_CLOAK_RUNTIME`; no global/npx dependency):

```js
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const R = process.env.RUNTIME
  || process.env.PASEOBILITY_CLOAK_RUNTIME
  || path.join(process.env.HOME, '.local/share/paseobility/browser/cloakbrowser');
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
| Linux x64 / arm64 | Chromium 146 | Chromium 152 |
| macOS arm64 / x64 | Chromium 145 | Chromium 151 |
| Windows x64 | Chromium 146 | Chromium 152 |

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
  await page.fill('#a', '7');
  await page.fill('#b', '5');
  await page.click('#compute');
  await page.waitForFunction(() => document.getElementById('result').textContent === '12', null, { timeout: 5000 });
  console.log('result', await page.textContent('#result'));        // 12
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

### Persistent profile (explicitly requested only)

```js
const { launchPersistentContext } = await import(pathToFileURL(path.join(R, 'node_modules/cloakbrowser/dist/index.js')).href);
const ctx = await launchPersistentContext({ userDataDir: path.join(TASK_DIR, 'profile'), headless: true });
```

Task-owned directory only; never the user's real profile.

## Error handling

- Missing runtime/binary: the process exits non-zero with a clear message; report
  it and stop — **no fallback backend**.
- Failed navigation/action/screenshot: caught, reported, `process.exitCode = 4`,
  and the browser is still closed in `finally` (no leaked child process).
- A mismatched/failed binary download aborts on signature/checksum failure.
- A missing/empty task input (`URL`, `TASK_DIR`) fails the usage check **before**
  launch.

## Scope and policy

- Explicit invocation for a stated browser task; default headless; isolated
  sessions; never share login/cookies/refs with Paseo or the user's Chrome.
- No new MCP server, no alias skill, no new default runtime effects in the
  installers, no global npm installs, no PaaS/cloud/proxy infrastructure.
- Distinguish the wrapper CLI (`npx cloakbrowser login|info|update`, which manages
  keys/cache) from actual page automation (the Playwright API above).
