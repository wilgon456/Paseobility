# Ego browser and native desktop workflow

`paseo-browser` operates web pages through the installed Ego runtime guide;
`paseo-cua` handles exact native app windows when required. One task retains its
Ego space ID/Page label and authorized artifact paths across the boundary.
Cua does not attach another browser controller or bypass Ego user takeover,
permission prompts, or device choosers. Native output is verified independently
before resuming the same Ego Page.

- [Browser observations, artifacts, and recovery](../skills/paseo-browser/references/interaction.md)
- [Native companion workflow](../skills/paseo-cua/references/ego-companion.md)
- [Ego ownership and completion](../skills/paseo-browser/references/ego.md)

## Verification on 2026-10-24

The opt-in live runner completed twice on macOS with Ego guide v2.1.0. Each run
used one task space and one reusable primary Page across seven fresh Node
invocations. It verified Korean form input, iframe input, an agent-owned popup
and its closure, downloaded bytes, upload-result text, recovery after a deliberate
script exception, and three subsequent navigations. A finish receipt closed p1
and its space; independent inventory confirmed no task space remained.

Across the second run, read-only Cua window inventories showed no new remaining
native windows. Both existing full-size Ego window IDs remained; an off-screen
22px helper window disappeared, so this is not an assertion that all WindowServer
IDs stayed identical. No unrelated native window was closed by the test.

Cua Driver 0.36.0 reported Accessibility and Screen Recording granted and
successfully identified Ego windows. No separate native app edit, OS/browser
permission prompt, real account/login, human handoff, canvas editing, or
OS-process-kill recovery was exercised. Those remain separate verification layers.

## Repeatable diagnostics

```bash
python3 skills/paseo-browser/scripts/ego-smoke.py --live --out /absolute/new/report-dir
```

Windows uses `python` or `py -3`; real Windows/Linux Ego GUI behavior is not
claimed by macOS results. The runner saves the complete runtime guide, UTF-8
per-round scripts, task name/ID, logs, synthetic upload/download artifacts and a
structured report. Existing output directories are refused. It never downloads
or upgrades Ego, reads login profiles, or changes the browser's default settings.

Unexpected errors/timeouts stop without automatic retry or finish. Read the
saved state and inspect the same space before recovery; the stopped fixture
server may require navigation to an available page. A failed run is not a reason
to open a replacement space. The sole automatically recovered exception is the
runner's deliberate local interruption, after earlier operations were verified.

Offline CI tests exercise script quoting/Unicode paths, fresh round files,
existing-output protection, incomplete-guide/timeout stops, and failure handling.
They run alongside the existing Chrome contract tests and never open a browser.
