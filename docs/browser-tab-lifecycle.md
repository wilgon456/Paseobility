# Existing Chrome tab lifecycle — 2026-10-23

## Problem and scope

The requested behavior is one task tab in an existing Chrome window, reused
throughout the task and closed afterwards. The old skill instead defaulted to
CloakBrowser `launch()` with a new context; its process sweep excluded personal
Chrome. Neither path implemented or verified the requested lifecycle. The
Mac mini trace also showed direct `cua_repl.createBrowserTab` calls, followed
by a provider capacity error with six tabs remaining. The user had already
closed some of the original five-plus windows before inspection, so the exact
historic native-window creation sequence could not be reconstructed.

## Implementation

- `skills/paseo-browser/scripts/chrome-tabs.py`: native macOS existing-window
  tab creation, explicit Chrome PID/launch-time identity, one journal per task,
  kernel lock, creation-intent marker, same-tab navigation and verified close.
- `SKILL.md`: existing Chrome is the default. Page interaction binds the
  returned existing tab through the installed Chrome integration; it does not
  create another integration session tab. Separate browser backends are named
  requested alternatives, or explicitly required verification workflows.
- Lifecycle failures retain state for recovery. Missing Chrome/window, restart,
  ambiguous creation and permissions fail closed. No Chrome/Paseo restart,
  profile copy, remote-debugging flag or background watcher is installed.
- Added an opt-in live lifecycle test and 13 contract tests; CI runs the contract
  suite, never the live GUI test. Updated both READMEs and install guidance.

## Verified layers

- Source and installed contract suites: 13 passed. Covers 20 repeated cycles,
  lost creation reply, independent task ownership, navigation/work exceptions,
  close verification failure, wrong-window placement, restart/ID reuse and
  competing lifecycle calls.
- Temporary-home installation copied and ran the helper suite successfully.
- Initial Mac mini prototype: seven cycles passed, then app discovery failed
  during cleanup. Changed from a bundle-wide application-count assumption to
  PID/launch-time addressing. The one owned test tab was identified and closed.
- Corrected prototype: 10 actual Chrome cycles passed (five normal, five injected
  work failures), restoring the baseline window and tab IDs each time.
- Final installed Mac mini skill: 11 live cases passed — five normal, five work
  failures, and one controller process exiting immediately after tab creation.
  A fresh CLI process recovered the same tab; zero duplicate tabs. Every case
  restored the two existing windows and eight baseline tabs. These counts are
  the post-user-cleanup baseline, not the original reported window count.
- Local no-Chrome test: operation failed without launching Chrome.
- Skill frontmatter/catalog and `git diff --check` passed.

## Initial debug installation (before v2.11.0)

Updated local `~/.agents/skills/paseo-browser`, plus Mac mini's existing
`~/.agents/skills/paseo-browser` and `~/.claude/skills/paseo-browser`. All 11
skill files matched the source SHA-256 manifest after tests. Remote package
SHA-256: `9304e16c79d185dbe6eb589800bda47301d3b892981e953831695c6e21bb132f`.
Mac mini backups are under both skill roots' `skills-backups/`, in
`Paseobility-2.10.0-20261023T062634Z-65288`.

The earlier workaround files created at Mac mini `~/.codex/AGENTS.md` and
`~/.claude/CLAUDE.md` were removed only after exact digest verification, restoring
their prior absence. Backups: `~/.local/share/paseobility/backups/chrome-tab-policy-lyjimqlr/`.

## Limits

The native lifecycle adapter is macOS-only. Live tests prove tab/window
lifecycle, not full click/fill/login integration or every site's popups.
A killed provider cannot execute cleanup; its task journal is recovered on
resumption. Additional task-created popups require explicit ownership tracking
through the page integration. Existing agents may retain previously loaded
skill text; start a fresh session or explicitly reload the skill. No running
agent or daemon was restarted during debugging. The initial debug installation
above preceded the v2.11.0 release and fleet rollout.
