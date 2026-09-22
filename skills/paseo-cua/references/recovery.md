# Cua Driver recovery

Load this only when a `paseo-cua` flow fails or the host looks unready. Keep the
retry budget at **one** retry per step, then stop and report.

## Bounded retry

1. Re-read the current state before retrying; do not repeat a call blindly.
2. Retry at most once. For a transient daemon-connection drop, a single fresh
   snapshot + retry is the limit.
3. If it fails again, stop and report the environment limitation.

## macOS identity and permissions

- `cua-driver permissions status` is read-only. `Accessibility: false` means
  stop and ask the human to grant it.
- `unknown` is **not** `false`: the driver could not confirm its own identity,
  not that the grant was refused. **Do not assert a cause** — a wrong identity
  is only one *possible* explanation, not a proven one.
- Preferred grant path: ask the human to authorize, then use the driver's own
  documented command, `cua-driver permissions grant`. It opens the correct
  identity so the Settings entries match the driver, not the terminal. Do not
  `open` the app with guessed arguments as a substitute.
- A daemon restart is **not** a default fix and is never the first step. Only if
  the human explicitly authorizes an identity relaunch, and only after you have
  checked that **no** active Cua session exists — not just your own tasks, but
  any user or task that may be using the driver — do a deliberate, attributed
  `cua-driver stop` followed by the driver's own start. If identity cannot be
  attributed, stop and report; do not restart blindly.
- **Never restart Paseo to apply this.** Restarting Paseo can kill running
  agents.
- Granted permissions are not readiness. Confirm with a real snapshot and one
  action on the exact target before treating the host as ready.

## Exact UI targets

- Select the exact window from the installed contract (`list_windows` /
  `launch_app` response) by its window id. Do not guess window ids, stacking
  order, or coordinates.
- Confirm field semantics with `cua-driver describe <tool>` rather than assuming
  a schema; the exposed set differs between driver versions.
- Act on the opaque element token from a fresh snapshot, one action at a time.

## `verify_state` semantics

- `verify_state` returning `unknown` is **not** a pass. Record it as unknown even
  when an independent accessibility read-back shows the expected value.
- Escalate to `delivery_mode: "foreground"` only after a verified background
  no-op and only within the user's authorization.

## Browser screenshots

For `screenshot_no_frame`, capture timeouts, or a `fullPage` image with repeated
edges, use
[`../../paseo-browser/references/screenshots.md`](../../paseo-browser/references/screenshots.md).
The Windows `screenshot_no_frame` failure is **not** solved here, and upstream
PR [#3197](https://github.com/getpaseo/paseo/pull/3197) is an open pull request,
**not** part of an official install. Do not claim either as fixed.

## Reporting

Report what was operated, the evidence layer (semantic, visual, accessibility,
or `verify_state`), and any refusal. Never log secrets.
