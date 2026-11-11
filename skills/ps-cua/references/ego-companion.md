# Native desktop work alongside Ego Lite

Ego owns web-page interaction and task-space lifecycle. Cua owns an explicitly
identified native app/window when the user's task actually requires desktop GUI.
Use CLI/API/file operations first when they reach the same native outcome.
Neither tool's IDs or control grants are transferable to the other.

## Carry the same task across surfaces

1. In Ego, verify the page result and save any download to an absolute task-owned
   path in the same round. Retain the space ID and Page label; do not finish a
   browser task that must be resumed after native work.
2. Record the small handoff: space ID, Page label, intended native app, absolute
   artifact path, and expected result. Do not copy cookies, tokens, page content,
   or credentials into a shared handoff log.
3. Discover the native app through filtered `list_windows` or an authorized
   `launch_app`; bind exact PID/window ID. Read current `get_window_state`, then
   use its tokens or coordinates. Follow installed `describe` schemas.
4. Verify the native result through a fresh tree/screenshot or the output file.
   If the task creates a new native document window, record its ownership.
   Existing windows and unsaved documents belong to the user.
5. Resume the same Ego space/Page. Take a new page observation; a file changed
   on disk does not prove the site accepted it. For an upload, assign only the
   authorized output and verify the resulting site state.
6. At success, finish Ego according to its receipt/keep policy. Close only native
   windows proven created for this task and no longer needed. Do not quit an app
   with unrelated windows, dismiss unsaved work, restart a daemon, or clear user
   storage to make cleanup look successful.

## Boundaries that prevent duplicate controllers

- Do not run Cua `browser_prepare`, `browser_navigate`, or typed browser actions
  against a Page already controlled by Ego. DOM, browser canvas, popups and
  downloads stay with Ego's documented APIs. Native title bars or app menus are
  separate only when the requested task requires them and control is available.
- Stop when Ego says user control, inactive, unassigned, or permission required.
  Cua must not click through a browser permission prompt, device chooser, login
  approval, or user takeover on Ego's behalf. Hand control to the human.
- A focus change stales assumptions. Observe again when returning to either
  surface; never reuse an Ego CSS coordinate as a Cua window-local coordinate or
  an accessibility token from a previous Cua snapshot.
- Prefer background delivery. If foreground input is needed, state that it will
  use the user's focus and honor interruption immediately. Never fight for focus.
- Native discovery is not a native action test. Report browser operation,
  artifact verification, native action/result, and cleanup as separate evidence.

## Example: downloaded document edited and uploaded

Ego download event → `saveAs` inside the same round → inspect file type/content →
authorized CLI or exact native document window edit → read back saved file →
resume the recorded Ego Page → fresh snapshot → assign that file → verify upload
result → finish Ego. A browser/OS chooser that requires the user is a handoff,
not an invitation to drive it with another tool.
