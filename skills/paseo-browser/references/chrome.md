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

## Lifecycle commands

On macOS, use the bundled `scripts/chrome-tabs.py` (Python 3 stdlib + AppleScript)
for tab creation and cleanup. It adds a tab to the exact existing window ID,
never launches Chrome, and journals ownership outside the repository. It does
not need remote-debugging flags, profile copying or JavaScript-from-Apple-Events.
macOS may require permission for the invoking process to control Chrome; report
a denial rather than opening a different browser.

```bash
python3 <skill-dir>/scripts/chrome-tabs.py list
# Choose an existing normal window ID from that response.
python3 <skill-dir>/scripts/chrome-tabs.py open \
  --task '<unique-agent-task-id>' --window '<existing-window-id>' \
  --url 'https://example.com/'
```

Keep the same task ID across calls and retries for this task; different agents
must use different task IDs. The response contains `tabId` and `windowId`.

## Bind and reuse the existing tab

1. **Bind this existing tab** using the installed Chrome integration's documented
   API, e.g. `cua.getTab(tabId)` when available. With the newer browser API, select
   the Chrome browser, find the matching current record in `browser.user.openTabs()`
   and pass that exact record to `browser.user.claimTab()`. Follow the installed
   integration's instructions; these are different API generations.
2. Reuse that binding for navigation, snapshots, clicks, forms and screenshots.
   For another URL, navigate the same tab or call `open` again with the same task
   ID. Do not call `createBrowserTab`, `tabs.new`, `windows.create`, `launch`,
   `open -na`, or make another context/window for each page or screenshot.
3. Verify the requested page result, then explicitly close the task tab, also
   after failure. Do not rely on the integration's automatic end-of-turn cleanup:
   a claimed external tab may merely be released and left open.

```bash
python3 <skill-dir>/scripts/chrome-tabs.py close --task '<unique-agent-task-id>'
```

Success reports `verifiedAbsent: true`.

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
- The journal never identifies tabs to close from a title, URL similarity,
  process age or a before/after difference alone.
- A restarted Chrome invalidates old IDs; do not force cleanup against a new
  browser incarnation. Chrome restart, missing/ambiguous creation marker,
  missing window or unknown permission state fails closed. A new task ID is
  appropriate after a verified browser restart, not as a way to bypass an
  uncertain creation result.
- Explicit `close` is required after work through multiple agent tool calls.
  Process death/provider failure cannot execute an in-process `finally`.
  Recovery requires resuming the recorded task; no background watchdog is
  installed.

## Popups and resumption

If the task needs a genuine popup, record the popup's ID/opener using the
integration and close that task-created popup as well. The helper owns only its
one tab; it cannot infer ownership of arbitrary popups or another agent's tabs,
and it does not discover or close site-created popups.
Keep a task tab open only when the user requested it; report its ID and reason.
On resumption after an interrupted turn, inspect the journal and current tab
before continuing or closing; a user may have taken over an unfinished form.

## Scripted use

For a scripted flow, import `TaskTab` from the helper and run the work inside
`with task.session(window_id, url):`; its `finally` closes the tab on ordinary
exceptions. CLI calls across agent turns still require explicit `close`.
SIGKILL/provider crashes cannot run `finally`; the journal permits recovery on
resumption, not unattended automatic cleanup.

## Platform and alternatives

The bundled native helper supports macOS only. On Windows/Linux, use an
installed adapter only if it can create a tab in a specified existing Chrome
window and return a stable ID. Verify this contract first. If that capability or
the Chrome connection is unavailable, report the limitation; do not silently
create a new window/browser. Ask which available alternative the user wants only
when needed to proceed.

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
