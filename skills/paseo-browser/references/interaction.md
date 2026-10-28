# Ego observation, artifacts, and recovery

Use after the installed `ego-browser skill` guide. The guide remains authoritative
for API signatures; use `help("page.click")` or the relevant documented helper
when options are uncertain. Select the cheapest adequate observation.

| Surface or goal | Work and verification |
| --- | --- |
| Form, table, ordinary page | Snapshot-derived refs/semantic locators; fill/click; wait for the expected page state; one resulting snapshot |
| Iframe | Full-page or iframe-subtree snapshot; actions use that snapshot's refs; a subtree read does not scope later actions automatically |
| Canvas or rich editor | Screenshot and documented Ego pointer/keyboard APIs; observe the rendered result after a small edit before scaling up |
| Popup | Arm the popup wait before the triggering action; record the returned label and ownership; verify destination; close only the owned popup while the task continues |
| Download | Arm the download event, trigger it, save with `saveAs(absolutePath)` in the same round; read the resulting file to verify the requested artifact |
| Upload | Use the observed file input and explicit task-authorized absolute files; verify the site's resulting upload state, not just the input assignment |
| Native document/app | Follow `paseo-cua`'s Ego companion workflow, retain the Ego space ID, then return to the same Page with a fresh observation |

## Efficient rounds

- Read once to ground the next actions. Batch actions only while their targets
  and prerequisites remain known. Reobserve after navigation, rerender, popup,
  native interaction, or an unexpected result.
- Use `waitForURL`, `waitForSelector`, or bounded `waitForFunction` for the
  expected result. Fixed sleeps and repeated screenshots do not establish state.
- A click receipt reports dispatch and immediate dialogs/popups, not a completed
  purchase, save, login, upload, or other application result. Verify that result.
- Do not blindly repeat a submit/send/pay action after a timeout. Inspect its
  current result first; ambiguity must be reported rather than retried.
- Prefer `page.evaluate` for bounded bulk extraction of visible/page data.
  Browser-side code cannot access Node variables; pass one serializable input.
  Do not extract credentials, replace user control, or use CDP to evade a stop.

## Recover according to the observed failure

| Condition | Next step |
| --- | --- |
| Stale ref / element changed | New snapshot in the same space and Page; resolve the target again |
| Ambiguous selector | Narrow with observed semantics; never choose the first arbitrary match |
| Navigation timeout | Inspect the same Page's current URL/state before considering navigation again |
| Mutation timeout or late effects | Check documented `executionStopped` / `mayHaveLateEffects` and application result; no blind replay |
| CLI parse/quoting error | Fresh UTF-8 round file and ASCII file-URL import; retain space ID and completed-step record |
| Provider/process interruption | Resume the recorded ID or stable owned name; inspect state before continuing; no replacement TaskSpace |
| User control / inactive or user-owned space | Stop; use the documented handoff/claim workflow only with the required user authorization |
| Completion reply lost | Read task-space inventory and saved evidence first; do not issue `finish` twice or recreate the task to check it |

## Browser and desktop coordinate boundaries

Ego screenshot/pointer coordinates use CSS pixels. Cua targets a specific native
PID/window and uses the coordinate space described by its current screenshot and
schema. Never copy coordinates, refs, target IDs, or snapshot tokens between
these systems. A browser permission/device chooser requires the user; switching
to desktop automation does not authorize clicking through it.

## Reproducible live verification

The following command creates one disposable loopback test task in the real
installed Ego browser. Run only for authorized browser testing, after reading the
current Ego runtime guide; it is never invoked by installation or offline CI:

```bash
python3 <skill-dir>/scripts/ego-smoke.py --live --out <new-absolute-report-directory>
```

Windows: use `python` or `py -3`. A fresh output directory is required. The
runner writes a separate UTF-8 `.mjs` per round and invokes an ASCII file-URL
entry point; it never pipes scripts through PowerShell encoding conversions.
It records the intended name before creation and the space ID immediately after
creation. Report artifacts contain only the synthetic fixture and task metadata.

Coverage: semantic form actions and Korean text; iframe input; owned popup
lifecycle; download byte verification; upload page result; deliberate controller
error followed by same-space recovery; three repeated navigations; finish receipt
and independent space inventory. Existing spaces are preserved. Unexpected errors
stop without automatic finish/retry; inspect `state.json` and the failed round log.
The loopback server stops, but the recorded browser space may need authorized
recovery. Never rerun the whole test under a new name to hide an unresolved task.

Live macOS evidence does not imply Windows/Linux GUI support, real website login,
user handoff, permission prompts, canvas editing, or OS-process-crash recovery.
Offline tests cover transport and stop boundaries only.

## Sites you return to

When a task repeats on the same site, keep short notes in the project's
existing notes (or `.paseobility/` when the project has none): stable selectors
or labels that worked, the steps that need the person (sign-in, payment,
CAPTCHA, a code sent to their phone), and the page state that proves the task
succeeded. Read them before the next run and correct them when the site has
changed. Never write passwords, cookies, tokens, personal data or one-time codes
into these notes.
