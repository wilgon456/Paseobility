# Browser screenshot recovery

Load when a Cua browser-backend screenshot fails, times out, or returns a
visually duplicated image. A successful state read is semantic proof only: it
does not prove the page painted. Treat a screenshot as visual proof only after
inspecting the returned image. Native window capture is not covered here.

## Symptoms

In the measured macOS case, `screenshot_no_frame` and capture timeout occurred
while the host window was not on screen. These errors can have other causes;
check the host state rather than assuming it. Resizing alone did not repair that
case.

## Recovery

Do not blindly retry the same call.

1. Check that the OS session is unlocked and that the target window is visible
   and not minimized or hidden.
2. If it is not, restore or show the normal window using whatever UI control is
   actually available, or ask the human to do it. Do not guess window IDs, tool
   names, coordinates, or an automation path.
3. After the state change, take a fresh state read or snapshot with the
   installed tool, then retry the screenshot exactly once at the default
   viewport, and inspect the image before reporting.
4. If it still fails, stop and report the environment limitation instead of
   looping.

Do not install or upgrade tools or restart the Paseo daemon for this.

## fullPage duplication

At a fractional device pixel ratio, `fullPage: true` returned an image with
repeated right/bottom edges even though a default-viewport capture of the same
page was valid. Treat a stitched full-page image as unverified:

- Prefer the default viewport, and change it only for a real responsive check.
- Capture the regions you need and scroll the page normally between captures.
- Do not claim a full-page screenshot is visually correct unless you actually
  inspected one that is.

## Evidence scope

A valid capture immediately after the host window was restored, and a second
fresh background tab that also captured, were measured on one Apple Silicon Mac.
That supports restoring/showing the host window as a recovery step. It does not
prove background capture always works, and it is not evidence for other macOS
hardware, other OS versions, Windows, or Linux, where this recovery remains
unverified.

The Windows `screenshot_no_frame` failure is not solved here, and upstream PR
[#3197](https://github.com/getpaseo/paseo/pull/3197) is open, not part of an
official install. Do not claim either as fixed.
