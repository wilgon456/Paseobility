# Existing Chrome tabs

The macOS adapter manages lifecycle only. Page interaction stays with the
installed browser integration, bound to the returned existing tab. It does not
inject Chrome extension code, enable remote debugging or replace a user profile.

## Why explicit creation is needed

A browser integration's `new tab` operation can route into its own session or
window. “Visible: false” hides a session; it is not a promise to use the user's
existing window. This adapter instead creates `Chrome.Tab` inside the exact
selected window's tab collection. It refuses missing windows and refuses to
launch Chrome.

The previous skill default used `launch()` and a new context, which cannot
provide personal-Chrome tab reuse. Its process sweep deliberately excluded
personal Chrome, so that sweep could not verify these task tabs were closed.
A Mac mini investigation also found six tabs created through direct `cua_repl`
left after a provider error. That establishes a cleanup gap; it does not by
itself prove which call created each of the reported five-plus native windows.

## Journal and failure behavior

Default state directory: `~/.local/state/paseobility/browser-tabs`. A SHA-256 of
the caller's task ID names the journal and advisory lock. No credentials or
page contents are stored. The journal records the Chrome incarnation, chosen
window, baseline tab IDs, unique blank marker, owned tab ID and lifecycle state.

- A kernel lock serializes lifecycle calls for one task and releases on process
  death. Use unique task IDs across agents.
- Intent is saved atomically before tab creation. If creation succeeds but its
  reply is lost, retry finds the unique marker instead of adding a second tab.
- Tab ownership is saved before navigation. Navigation errors trigger cleanup.
- `close` checks the Chrome incarnation, closes the exact owned ID and re-lists
  to prove absence. Repeated close is harmless. Failure retains the journal.
- Chrome restart, missing/ambiguous creation marker, missing window or unknown
  permission state fails closed. A new task ID is appropriate after a verified
  browser restart, not as a way to bypass an uncertain creation result.
- Explicit `close` is required after work through multiple agent tool calls.
  Process death/provider failure cannot execute an in-process `finally`.
  Recovery requires resuming the recorded task; no background watchdog is
  installed. The helper does not discover or close site-created popups.

## Verify repeat use

Unit/contract tests have no browser side effects:

```bash
python3 -B -m unittest discover -s <skill-dir>/scripts -p 'test_*.py' -v
```

The following is **opt-in**, creates transient test tabs in the named live
window, and never runs during installation. Use only when the user has asked
for browser debugging/validation. It tests successful and failed work, repeated
navigation in the same tab, unchanged window IDs, and restoration of baseline
tab IDs. It also kills a test controller immediately after creating its tab,
then checks that a fresh CLI process recovers that same tab without duplication.
It stops if concurrent user activity changes that baseline; it never
closes those new unrelated tabs to make the test pass.

```bash
python3 <skill-dir>/scripts/chrome-tabs.py list
python3 <skill-dir>/scripts/chrome-tabs-live.py --window '<existing-id>' --runs 5
```

This is Chrome lifecycle evidence, not end-to-end proof of an integration's
click/fill APIs or a guarantee against unhandled OS/provider termination.

The adapter addresses Chrome by PID after verifying its launch timestamp;
[Apple's JXA reference (WWDC 2014, session 306)](https://devstreaming-cdn.apple.com/videos/wwdc/2014/306xxjtg7uz13v0/306/306_javascript_for_automation.pdf)
documents `Application(processID)`. This avoids rebinding a task to a second
Chrome process registered during concurrent headless verification.
