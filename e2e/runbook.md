# Paseobility E2E runbook (manual, bounded)

This runbook is for a **human-run** end-to-end session. Nothing here is invoked
automatically by the doctor or an installer. There is **no** generalized
screenshot-stitching engine in this release: scroll capture keeps using the
bounded, fixture-specific workaround (capture regions and scroll normally
between captures).

Record the run with [`REPORT_TEMPLATE.md`](REPORT_TEMPLATE.md). It is a plain
report — there is deliberately no automated validator, because no static check
can confirm that evidence is true. Fill it in from what you actually observe.

## 0. Discover the installed contract first

Do not hardcode tool names. Read them from the live environment:

- Native/browser Cua tools: `cua-driver list-tools` and
  `cua-driver describe <tool>` (the installed binary is authoritative; the
  exposed set differs between versions).
- Paseo browser tools: the `browser_*` names present in the active session.
- MCP is optional for a persistent connection and is not required for a
  one-shot call.

Map the steps below onto whatever names the installed contract actually
reports. If a name is missing, record it and stop rather than inventing one.

## 1. Start the static fixture (foreground only)

```bash
python3 e2e/serve-fixture.py            # default bind 127.0.0.1, ephemeral port
# optional: python3 e2e/serve-fixture.py --bind 127.0.0.1 --port 8765
```

On Windows use `python e2e\serve-fixture.py`. It prints the URL and flushes it,
so a piped or agent-run process still sees the line. This is a foreground
helper, not a persistent host: stop it with Ctrl+C when the run ends. If the
environment cannot reach the bound host, record the limitation instead of
looping.

## 2. Browser layers

Perform these with the **actual** installed browser tools (`browser_snapshot`,
`browser_fill`/`browser_type`, `browser_click`). Do not substitute
`browser_evaluate` to set state: the run is meant to exercise the real
input/click path.

1. Open the printed URL in a new Paseo browser tab.
2. Take a fresh snapshot. Find the refs for the A and B inputs, the Compute
   button, and the result element.
3. Fill `A = 7` and `B = 5` with the fill/type tool, then click Compute with the
   click tool.
4. Semantic proof: re-snapshot and confirm the result reads `12`.
5. Visual proof: capture a default-viewport screenshot and **inspect the image**
   yourself. A screenshot you did not look at is not evidence.
6. Scroll to the MIDDLE and BOTTOM markers and confirm the marker text is
   visible in a fresh read. The BOTTOM marker is the last element, so hitting it
   means the document bottom was reached. Do not claim a full-page image is
   correct unless you inspected one that is.

If a screenshot fails (`screenshot_no_frame`, timeout) or a full-page image
repeats edges, follow
[`skills/paseo-browser/references/screenshots.md`](../skills/paseo-browser/references/screenshots.md):
fix the host-window state, retry **once**, then stop and report.

## 3. Native layers (Cua)

1. Confirm the prerequisite: `cua-driver --version`, then the installed
   contract discovery from step 0.
2. Launch a **fresh, isolated** Calculator instance for the run and select that
   exact window by its window id. Do not reuse a user's open Calculator window.
3. Drive `7 + 5 =` with the installed native tools, one snapshot-bound action at
   a time. Avoid the `M+`/memory buttons: use the numeric buttons plus `+` and
   `=` only, and match the exact button label the contract reports (for example
   `Plus`/`Equal`, not a substring like `M+`).
4. Bound the capture: one screenshot of the result window, no repeated polling,
   with a bounded wait. Record three distinct things:
   - **Native accessibility read-back** of the result (`7 + 5 = 12`).
   - **Native visual**: inspect the window PNG you captured.
   - **`verify_state`**: Cua's own postcondition verdict. `unknown` is **not** a
     pass — record it as unknown even when an independent AX read-back shows the
     value.
5. If a step fails, stop, retry at most once, then clean up the isolated window
   and report. Never leave the test Calculator (or any other test app) open.

Recovery for a native flow (identity/permission relaunch, bounded retry, exact
target selection) is in
[`skills/paseo-cua/references/recovery.md`](../skills/paseo-cua/references/recovery.md).

## 4. Record honestly

- Keep `pass / fail / unknown / not_run` distinct per layer.
- `verify_state: unknown` is never `pass`.
- Do not claim the Windows `screenshot_no_frame` capture is fixed.
- Do not cite upstream PR `#3197` as part of an official install: it is not a
  released fix.
- Retry transient failures **at most once**.

## 5. Cleanup

- Stop the fixture server (Ctrl+C).
- Close tabs/apps created only for the run.
- Archive only the test agents you created, using
  `/paseo-agent-cleanup` with explicit IDs.
- Leave unrelated agents, workspaces, and the Paseo daemon untouched.
