# Browser screenshot recovery

Read this when `browser_screenshot` fails, times out, or returns a visually
duplicated image. A successful `browser_snapshot` or `browser_evaluate` is
semantic proof only; it does not prove the page painted, so a screenshot is
visual proof only once you have inspected the returned image.

## Symptoms

- In the measured macOS case, screenshot_no_frame and capture timeout occurred while the host window was not on screen. These errors can have other causes; check the host state rather than assuming it. Resizing alone did not repair that case.

## Recovery

Do not blindly retry the same call.

1. Check that the OS session is unlocked and that the Paseo host window is
   visible and not minimized or hidden.
2. If it is not, restore or show the normal host window using whatever UI
   control is actually available, or ask the human to do it. Do not guess
   window IDs, tool names, coordinates, or an automation path.
3. After the state change, take a fresh `browser_snapshot`, then retry
   `browser_screenshot` exactly once at the default viewport, and inspect the
   image before reporting.
4. If it still fails, stop and report the environment limitation instead of
   looping.

This needs no Cua Driver: do not add that dependency, install or upgrade tools,
or restart the Paseo daemon by default.

## fullPage duplication

At a fractional device pixel ratio, `fullPage: true` returned an image with
repeated right/bottom edges even though a default-viewport capture of the same
page was valid. Treat a stitched full-page image as unverified:

- Prefer the default viewport, and use `browser_resize` only for a real
  responsive check.
- Capture the regions you need and scroll the page normally between captures.
- Do not claim a full-page screenshot is visually correct unless you actually
  inspected one that is.

## Evidence scope

A valid capture immediately after the host window was restored, and a second
fresh background tab that also captured, were measured on one Apple Silicon Mac.
That supports restoring/showing the host window as a recovery step. It does not
prove background capture always works, and it is not evidence for other macOS
hardware, other OS versions, Windows, or Linux, where this recovery remains unverified.
