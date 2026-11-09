# Ego Lite

The separate `ego-browser` skill bootstraps the runtime guide with
`ego-browser skill`. Read the complete output ending in
`[ego-browser:skill] end of guide`; consult `help()` for signatures. This
reference supplements that installed contract, not a replacement SDK manual.
Paseobility does not install, upgrade, or copy Ego profiles or credentials.

## Discovery before browser selection

Run discovery on the target computer. Browser tools listed in the current
session and an `ego-browser` skill directory are not runtime availability
checks; absence of either does not authorize Chrome.

- macOS: check `command -v ego-browser`, then the executable
  `~/.local/bin/ego-browser`. Check both `/Applications/ego lite.app` and
  `~/Applications/ego lite.app`. A daemon may have inherited an older PATH;
  invoke the verified CLI by its absolute path instead of restarting Paseo.
- Windows: check `Get-Command ego-browser -ErrorAction SilentlyContinue` (or
  `where ego-browser` in cmd), and the standard app location
  `C:\Program Files\Citro Labs\ego lite\Application\ego.exe`. Onboarding PATH
  changes only reach new processes. Read the installed `ego-browser` skill's
  Windows installation reference for recovery; do not infer absence from the
  current terminal's PATH or invent a CLI shim path.
- Other/custom installations: consult the installed Ego installation guide.
  If availability cannot be established, report it as unknown.

An app with no working CLI is a setup gap. A CLI with a failing `skill` command
is a runtime/guide gap. If the bootstrap skill is missing but the CLI works,
read the complete `ego-browser skill` output directly. Verify its end marker
before acting. Never launch the app executable with guessed CLI flags.

On Windows, never launch `ego.exe` as a separate process for headless checks,
tests or measurement. Every such launch opens the system Default apps settings
window within about a second, even with `--headless`,
`--no-default-browser-check` and a reused profile (Ego 0.6.2.8), so a loop or a
repeated check raises one window per run. Headless tooling uses Chrome or a
Playwright Chromium there; Ego work goes through the `ego-browser` CLI and the
running app.

When diagnosing differences between computers, compare each host's active
provider skill directories (including legacy copies), installed `SKILL.md`
selection rules, and CLI path. An updated source checkout does not update
installed copies or instructions already loaded by a running agent. After an
authorized backed-up skill update, use a new agent session or reload
integrations; preserve active agents and do not restart the daemon.

## One goal across multiple rounds

Bash/Zsh first round (use a unique stable name for this agent's goal):

```bash
ego-browser nodejs <<'EOF'
const task = await taskSpace("<agent-id>-<goal-id>");
const page = task.page("p1");
console.log({ spaceId: task.spaceId, page: page.label });
await page.goto("https://example.com/");
console.log(await page.snapshot());
EOF
```

In subsequent calls, use `taskSpace(observedSpaceId)` and `task.page("p1")`.
JavaScript variables do not persist across calls; task spaces and labels do.
Keep IDs in the task's working notes. Do not persist raw CDP target IDs across
rounds or use a new TaskSpace to recover from an uncertain or failed call.
Do not assume `task.page(label)` creates a tab or detects its absence.

Use the snapshot's refs/locators for page operations. After actions, wait for
the expected URL/selector/page state and print one resulting snapshot. Batch
only actions whose targets and prerequisites are already known. `page.evaluate`
runs in the page; file I/O stays in Node using absolute paths. The Node runner
does not inherit the shell cwd or arbitrary shell environment variables.

When the requested goal is verified, the final round ends with:

```js
const receipt = await task.finish({ keep: [] });
console.log(receipt);
// No subsequent calls on this task or any of its Page labels.
```

Inspect the receipt for closed/retained Pages. If independent cleanup evidence
is required, `listTaskSpaces()` is a separate observation; its entries use `id`,
not `spaceId`. Do not close a remaining space merely because it is visible:
user-created/unmanaged tabs are protected. Only deliberately necessary extra
Pages are created with `newPage()`; popups use the documented receipt/event
flow and ownership tracking. `openedBy: "unknown"` is treated as user-owned.

## Errors, user control, and shell portability

- An error is not successful completion. Do not call `finish()` when stopping
  for an error or user control. Retain the same task ID and resume only when
  authorized control is available. Do not create another space as a workaround.
- Use `handOff()` when the user must act, then end the round. Follow the guide's
  `takeOverTaskSpace` versus `claimTaskSpace` rules after user confirmation.
  A finished space with kept Pages is user-owned, not resumable agent state.
- A timeout may have late effects. Inspect the existing state and documented
  `executionStopped` / `mayHaveLateEffects` result before retrying mutations.
- Windows PowerShell 5.1: write a fresh UTF-8 `.mjs` file per round with a file
  tool and use the guide's ASCII `-e "await import('file:///C:/.../round.mjs')"`
  entry point. Do not pipe `Get-Content` or pass multiline/non-ASCII JavaScript
  through `-e`. Never replay an earlier file containing completed mutations.
- Ego is its own browser. Existing Chrome login state is not assumed shared;
  do not export cookies or switch profiles to imitate a Chrome session.
- A runtime update notice is not permission to upgrade. Report it, and reread
  the runtime guide after an authorized upgrade.

## Verified scope

Local Ego guide v2.1.0 was exercised on macOS on 2026-10-24: a single space and
`p1`, semantic fill/click with a page-state wait, navigation and reconnection
across fresh Node calls, recovery after an injected script interruption, and
completion receipt plus independent space inventory. This is local browser
integration evidence, not Windows/Linux runtime, authenticated site, arbitrary
popup, or process-crash cleanup proof. The existing Chrome helper has its own
contract tests and stays independent of Ego.
