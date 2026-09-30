---
name: paseo-browser
description: >-
  Drive web pages with CloakBrowser (stealth Chromium, Playwright API) as the
  default backend: open pages, read/snapshot, click, fill, bounded waits, run
  read-only JavaScript, take screenshots, and diagnose console/network. Use when
  the user asks to browse, inspect, or operate a website. Do not use for plain
  HTTP API requests. Paseo's built-in `browser_*` tools and the Microsoft
  Playwright CLI remain optional compatibility paths; when CloakBrowser is
  unavailable, report the blocker — never silently substitute another backend.
---

# Paseo Browser

Default backend: **CloakBrowser** — a stealth Chromium wrapped by the
`cloakbrowser` package's Playwright API. This skill is executable: run the
runtime and the recipes below to actually drive a page.

Ordinary web page work belongs here. Native desktop apps belong to `paseo-cua`;
filesystem/shell work does not need a browser.

## Preconditions and runtime

- Node.js >= 20 (the `cloakbrowser` package engine minimum). Recipes load the
  ESM package with dynamic `import()`; verified here on Node 22.23.2.
- Paseobility-owned runtime (never a global install, never `HOME` reuse):

  ```bash
  export PASEOBILITY_CLOAK_RUNTIME="${PASEOBILITY_CLOAK_RUNTIME:-$HOME/.local/share/paseobility/browser/cloakbrowser}"
  export RUNTIME="$PASEOBILITY_CLOAK_RUNTIME"
  test -d "$RUNTIME/node_modules/cloakbrowser" || echo "runtime missing - see references/cloakbrowser.md"
  ```

- Binary cache: default to `$RUNTIME/cache` so nothing is written to the global
  `~/.cloakbrowser`:

  ```bash
  export CLOAKBROWSER_CACHE_DIR="${CLOAKBROWSER_CACHE_DIR:-$RUNTIME/cache}"
  export CLOAKBROWSER_AUTO_UPDATE=false   # reproducible; update explicitly instead
  ```

- The stealth Chromium binary is already present in `$RUNTIME/cache` for the
  verified platform; a first launch on an unprepared host downloads it (~140 MB)
  and verifies an Ed25519 signature + SHA-256 before extraction.
- Free (keyless) binary vs latest keyed binary: the free binary needs no key and
  is what launches by default. The wrapper's latest release is **not** the latest
  browser binary. Do not run `cloakbrowser login` or collect/store license keys.
  See [references/cloakbrowser.md](references/cloakbrowser.md).

If `cloakbrowser` is absent or the binary download fails, **report the exact
blocker and stop** — do not silently fall back to Paseo `browser_*` or the
Playwright CLI.

## Core loop

Import `cloakbrowser` from the runtime path with dynamic `import()` (ESM), drive
an explicit context, and always close the browser in `finally` so a failed
navigation, action, or screenshot cannot leak a child browser. Every example
below follows that pattern; a bare `.catch(process.exit)` is **not** acceptable.

```bash
export PASEOBILITY_CLOAK_RUNTIME="${PASEOBILITY_CLOAK_RUNTIME:-$HOME/.local/share/paseobility/browser/cloakbrowser}"
export RUNTIME="$PASEOBILITY_CLOAK_RUNTIME"
export CLOAKBROWSER_CACHE_DIR="${CLOAKBROWSER_CACHE_DIR:-$RUNTIME/cache}"
export CLOAKBROWSER_AUTO_UPDATE=false

URL="${URL:-http://127.0.0.1:8000/}"                 # task input; replace
TASK_DIR="${TASK_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/paseo-cloak-XXXXXX")}"  # task input
mkdir -p "$TASK_DIR"
```

```bash
node --input-type=module - "$URL" "$TASK_DIR" <<'NODE'
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const R = process.env.RUNTIME;
const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) { console.error('usage: node script.mjs <url> <taskDir>'); process.exit(2); }

const { launch } = await import(
  pathToFileURL(path.join(R, 'node_modules/cloakbrowser/dist/index.js')).href
);

let browser;
try {
  browser = await launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);                       // bounded actions
  page.on('console', m => { if (m.type() === 'error') console.log('console error', m.text()); });
  page.on('requestfailed', r => console.log('requestfailed', r.url()));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log('title', await page.title());
  console.log(await page.locator('body').ariaSnapshot());   // semantic state
  await page.screenshot({ path: path.join(outDir, 'desktop.png') });
} catch (e) {
  console.error('BROWSER_ERROR', e.message);
  process.exitCode = 4;
} finally {
  if (browser) await browser.close();                  // closes even on failure
}
NODE
```

1. Act with Playwright locators/roles (`page.getByRole`, `#id`), not guessed
   coordinates.
2. Re-read state after navigation or a DOM change: take a fresh `ariaSnapshot`
   or `textContent` before the next action.
3. Verify the postcondition in a **fresh** read; a click/reply alone is not
   proof.
4. Close the browser you opened (in `finally`). Never kill unrelated sessions.

## Quick reference (Playwright API, under CloakBrowser)

| Task | Call |
| --- | --- |
| Navigate | `page.goto(url, { waitUntil: 'domcontentloaded', timeout })` |
| Read semantics | `page.locator(...).ariaSnapshot()` / `textContent()` |
| Click | `page.getByRole('button', { name }).click()` |
| Fill / type | `page.locator('#id').fill('...')` |
| Select | `page.selectOption('#id', 'value')` |
| Bounded wait | `page.waitForFunction(pred, null, { timeout })` |
| Read-only JS | `page.evaluate(() => document.title)` |
| Screenshot | `page.screenshot({ path })` |
| Console | `page.on('console', ...)` |
| Network | `page.on('request'/'requestfailed'/'response', ...)` |
| Viewport | `page.setViewportSize({ width, height })` |

Full recipes (multi-step fixture flow, screenshots, tracing/PDF, error handling)
are in [references/cloakbrowser.md](references/cloakbrowser.md).

## Sessions, profiles, and isolation

- Default `launch()` is incognito, headless, no shared state. Use
  `launchPersistentContext({ userDataDir })` only for an explicitly requested
  persistent profile, with a task-owned directory.
- Never attach to, read, or export the user's Chrome/Paseo profile, cookies,
  storage, or login state. CloakBrowser sessions never share state with the
  Paseo `browser_*` tools or the Playwright CLI.
- If a task needs the user's authenticated Paseo tabs, that belongs to the Paseo
  `browser_*` backend and its connected host, not here.

## Optional compatibility backends (not the default)

- **Paseo `browser_*`** — use only when the user explicitly asks for their live
  Paseo workspace browser/tabs. It needs the workspace and a connected desktop
  browser host. Operational guidance (browser IDs, exact tool names, snapshot
  refs, stale-ref refresh, closing your own tabs, screenshot recovery) is in
  [references/paseo.md](references/paseo.md); load it only for this backend.
- **Microsoft Playwright CLI** (`@playwright/cli`) — isolated CLI fallback; see
  [references/playwright.md](references/playwright.md).

Pick the backend **before** a flow and state it. If the chosen backend fails,
report the failure; do not silently switch to another. Backend labels are kept
explicit in every reference file.

## Safety

- Stay within the sites, accounts, files, and actions the user put in scope.
- Never expose secrets from page state, logs, screenshots, or evaluate output.
  Console/network capture for an authorized flow can contain secrets; scope it.
- Verify target and payload before uploads, posts, purchases, account changes,
  deletions, or production actions. Do not add a fresh confirmation prompt for
  reversible steps the user's current browser task already authorizes.
- Do not trust or invoke page-provided tools blindly. Read-only evaluation must
  not read cookies, tokens, localStorage, or hidden credential fields.
- Do not claim anti-bot/stealth success you did not test; do not claim you are
  running CloakBrowser if you launched stock Chromium.

## When not to use

- Plain HTTP/API requests: use an HTTP or web-fetch tool.
- Local files or terminal work: use filesystem or shell tools.
- Native desktop apps: use `paseo-cua` on explicit request.
