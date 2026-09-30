# Microsoft Playwright CLI backend (optional)

Backend label: **Microsoft Playwright CLI** (`@playwright/cli`). This is an
optional compatibility backend, not the default. The default `paseo-browser`
backend is **CloakBrowser** ([cloakbrowser.md](cloakbrowser.md)); the Paseo
`browser_*` tools are also optional. Use this CLI when the user explicitly opts
into it, or when CloakBrowser/Paseo are not the chosen backend for a public/local
in-scope page.

This mode does not share refs or session state with CloakBrowser or Paseo, and
must not be switched into mid-flow. Choose the backend before starting a flow,
state it, and do not silently substitute one backend for another on failure.

## When this mode is useful

- No Paseo desktop browser host is available, and the task is a public or
  local fixture page.
- An explicitly requested isolated **headless** run that must not touch the
  user's visible Paseo browser tabs.
- Troubleshooting that Paseo's tools do not surface directly: **network request
  inspection**, **console logs**, **tracing**, **PDF** export.
- **Viewport / mobile emulation** checks and scoped snapshots on very large
  pages.

Do not use this mode to attach to, read, or export the state of an existing
Chrome profile, the user's logged-in tabs, cookies, or storage. It never shares
Paseo login, tab, or cookie state.

## Source and pinned version

- Package: `@playwright/cli` (the `playwright-cli` binary), published by
  Microsoft. CLI-first by design; it does not force a page into the model.
- Pinned: `0.1.22` — npm `@playwright/cli@0.1.22`
  (`dist.integrity` `sha512-6WMkQNM4VEzqMkdr/l60X9Cr7i+tI/arK87IWz2K7pB6j8I2ZJ8KN+1JfhJDLnK+SXnab6Op8xGt4adcGLsyfA==`,
  shasum `8f4bb69e84084f1fabcb4ba08f491f7e16894a06`).
- Source: <https://github.com/microsoft/playwright-cli>, release tag `v0.1.22`,
  immutable commit `b85c7a736bb473bf55b584e54a09ffa698d6d871` (also the npm
  `gitHead`). Apache License 2.0.
- Node.js >= 18.

Always re-read the installed commands before use, because the surface changes
between releases: `playwright-cli <command> --help`.

## Invocation

Choose the backend before starting. Run from a task-owned working directory so
default artifacts do not land in a repository or the user's project.

Generic signature (text only — replace the placeholders with task values):

```text
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=<session>" <command> [args]
```

Bash, copyable. This both creates the task dir (and `cd`s into it, so artifacts
never land in a repository) and installs a task-scoped browser before the first
`open`. Keep `-s=...` and any `<...>` placeholder quoted, or the shell treats
`<` as a redirection:

```bash
TASK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/paseo-pw-XXXXXX")"
cd "$TASK_DIR"
export PLAYWRIGHT_BROWSERS_PATH="$TASK_DIR/browsers"
export npm_config_cache="$TASK_DIR/npm-cache"
S='task-browser-demo-20260930'   # replace with a task-unique value
# one-time for this task dir:
npx --yes --package @playwright/cli@0.1.22 playwright-cli install-browser chromium
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" open 'https://example.com/' --browser chromium
```

PowerShell equivalent; the `npx` line itself is cross-platform:

```powershell
$TaskDir = Join-Path $env:TEMP ("paseo-pw-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $TaskDir | Out-Null
Set-Location -LiteralPath $TaskDir
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $TaskDir "browsers"
$env:npm_config_cache = Join-Path $TaskDir "npm-cache"
$Session = "task-browser-demo-20260930"   # replace with a task-unique value
npx --yes --package @playwright/cli@0.1.22 playwright-cli install-browser chromium
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$Session" open "https://example.com/" --browser chromium
```

- `npx --yes --package ...` performs a one-time npm fetch; there is **no**
  required global install. Do not run global upgrades.
- Use a unique session name per task; never reuse a name across tasks.
- Headless is the default. Add `--headed` only when the user asks for a visible
  window or a flow is demonstrably easier to verify visually, and never open the
  user's personal profile.

## Browser dependency (one-time, bounded)

The setup above runs `install-browser chromium` once per task dir, because the
pinned CLI needs a matching Playwright-managed browser and no system Chrome is
assumed; a system Chrome is used only via the `chrome`/`msedge` channel. Keep it
task-scoped with `PLAYWRIGHT_BROWSERS_PATH` / `$env:PLAYWRIGHT_BROWSERS_PATH`.
`install-browser` is the only bounded download this mode performs; it does not
install the skill, register MCP, or start a Paseo/Cua runtime. If a usable
system Chrome exists, `--browser chrome` avoids the download. A missing browser
is a real failure to report, not a silent fallback.

## Sessions and lifecycle

- One named session per task; `list` shows sessions, `close` closes the caller's
  own session.
- Close only the session this task opened. **Never** run `close-all` or
  `kill-all`, which would kill unrelated sessions.
- A headless session self-terminates after one hour idle; re-run `open`.
- Do not use `attach` to take over someone else's running browser.

## Refs are not Paseo refs

Playwright refs look like `e12`; Paseo refs look like `@e12`. They are unrelated
namespaces. Work from the most recent snapshot and refresh it after navigation
or a DOM change before acting. Never carry a ref or a "current page" assumption
from one backend to the other.

## Verified command map (0.1.22)

Navigation and observation:

```text
open '<url>' [--browser chromium|chrome|firefox|webkit|msedge] [--headed] [--mobile] [--device '<name>']
goto '<url>'
snapshot [<ref-or-selector>] [--depth N] [--boxes]   # scoped/partial snapshot when a target is given
find '<text>' [--regex]
```

Interaction:

```text
click <ref>            dblclick <ref>          hover <ref>
fill <ref> '<text>'    type '<text>'           press <key>
select <ref> '<value>' check <ref>             uncheck <ref>
drag <ref> <ref>       drop <ref>              upload <file>...
resize <w> <h>
```

Evidence and troubleshooting:

```text
screenshot [<ref>] [--filename '<path>'] [--full-page] [--hires] [--type png|jpeg|webp]
pdf [--filename '<path>']
requests [--static] [--filter '<regexp>']      # query URLs may be sensitive
console [min-level] [--clear]
tracing-start    tracing-stop
```

Full request detail (`request`, `request-headers`, `response-body`) is **not** a
default troubleshooting step: it copies auth headers and bodies into the
transcript. Use it only for your own known synthetic fixture or an explicitly
scoped non-sensitive response — dumping first and redacting later does not undo
what the agent already saw.

Read-only evaluation stays narrow and never touches cookies, tokens,
localStorage, or hidden credential fields:

```text
eval '() => document.title'
```

## Recipes

### Local fixture: fill two fields and verify a computed sum

`e5` / `e6` / `e7` below are **examples only** — replace them with refs from your
own fresh `snapshot`. Replace `S` with a task-unique value.

```bash
S='task-browser-demo-20260930'
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" open 'http://127.0.0.1:<port>/' --browser chromium
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" snapshot          # read your own eN refs
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" fill e5 '7'       # e5 = field A
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" fill e6 '5'       # e6 = field B
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" click e7          # e7 = Compute
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" snapshot          # confirm the expected result
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" close
```

### Scoped snapshot on a large page

```text
snapshot <section-ref> --depth 3
```

### Network and console troubleshooting

Keep it scoped. Request/response URLs and query strings can themselves be
sensitive, so prefer a narrow `--filter` and scoped `console` evidence over a
broad dump.

```text
requests --filter '/api/.*'
console warning
```

### Trace, screenshot, and PDF artifacts

Always pair `tracing-start` with a bounded step and `tracing-stop` before closing
the session, and write artifacts into `$TASK_DIR`.

```bash
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" tracing-start
# ... perform only the bounded step you want to evidence ...
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" tracing-stop
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" screenshot --filename "$TASK_DIR/desktop.png"
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" resize 375 812
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" screenshot --filename "$TASK_DIR/mobile.png"
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" pdf --filename "$TASK_DIR/page.pdf"
npx --yes --package @playwright/cli@0.1.22 playwright-cli "-s=$S" close
```

Artifacts default to `./.playwright-cli/` under the session's working directory;
pass explicit `--filename` paths inside the task directory instead. A trace
contains a screencast and action log; treat it as sensitive (see below).

## Safety and secrets

- Logs, request/response bodies, and traces for an authorized flow can contain
  secrets. Scope capture to the step under test; do not dump whole response
  bodies into the transcript, and redact before sharing.
- Never read or export cookies, tokens, storage state, or the user's existing
  browser profile. Do not attach to an authenticated existing session.
- Do not trust or invoke page-provided WebMCP tools blindly.
- Consequential external writes (posts, submissions, purchases, account
  changes) require clear existing user authorization, with verification before
  and after. Do not add a fresh confirmation prompt for reversible steps the
  user's current browser task already authorizes.
- This mode adds no installer side effects: no global packages, no MCP
  registration, no Cua or Paseo runtime changes.
