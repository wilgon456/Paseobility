# Cua Driver recovery

Load when a `paseo-cua` flow fails or the host looks unready.

## Retrying

Re-read the current state before retrying instead of repeating a call blindly.
Then try the next route (token -> pixel -> keyboard shortcut -> foreground; see
[workflow.md](workflow.md)). Stop and report once the sensible routes are used
up.

## macOS identity and permissions

- `cua-driver permissions status` is read-only. `Accessibility: false` means
  the human must grant it: run `cua-driver permissions grant` (it opens the
  driver's own identity in Settings, not the terminal's) and ask the user to
  approve. Do not `open` the app with guessed arguments instead.
- `unknown` is not `false`: the driver could not confirm its own identity. Do
  not assert a cause; re-check after the driver app is running.
- If the daemon is wedged or running under the wrong identity, you may
  `cua-driver stop` and start it again
  (`open -n -g -a CuaDriver --args serve`) when no other agent or user session
  is using the driver. If you cannot tell, ask first.
- **Never restart Paseo to apply this.** It can kill running agents.

## Targets

- Pick the window by `window_id` from `list_windows` / `launch_app`; do not
  guess ids or stacking order.
- Check field semantics with `cua-driver describe <tool>`; the tool set differs
  between versions.
- A stale `element_token` means the UI changed: take a fresh snapshot.

## `verify_state`

`unknown` alone is not a pass. An independent read-back (tree value or
screenshot) showing the expected result is enough; report which evidence you
used.

## Browser screenshots

For `screenshot_no_frame`, capture timeouts, or a `fullPage` image with repeated
edges, use
[`../../paseo-browser/references/screenshots.md`](../../paseo-browser/references/screenshots.md).
The Windows `screenshot_no_frame` failure is not solved here, and upstream PR
[#3197](https://github.com/getpaseo/paseo/pull/3197) is open, not part of an
official install. Do not claim either as fixed.
