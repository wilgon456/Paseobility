# Dependency validation — 2026-10-13

Scope: Paseobility v2.9.1 source and this Apple Silicon macOS host. No release,
remote update, Paseo daemon restart or native GUI end-to-end pass is claimed.

| Component | Source pin / installed result | Evidence |
| --- | --- | --- |
| CloakBrowser | 0.6.2 | npm registry integrity/gitHead; installed package version |
| playwright-core | 1.64.0 | npm registry; installed package version |
| Free Chromium on macOS | 145.0.7632.109 | browser.version() from actual fixture launch |
| Cua Driver | 0.34.1 | installed bundle + CLI; doctor build git_sha 0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc |
| Vercel interface guidelines | 4ecfb9fb8d1d3b7009674869b3aaee2f904042e1 | byte-for-byte raw upstream snapshot |
| Paseo | 0.11.2 | current CLI, no update/restart needed |

## Browser runtime

The existing Paseobility-owned runtime was backed up before the npm update.
Both dependencies use exact versions, and its lockfile carries the npm integrity.
Node 22.23.2 satisfies the new CloakBrowser engine range
`^20.19.0 || >=22.12.0`. The shared keyless cache remains scoped to the runtime;
no global install, user Chrome profile, license login or key collection was used.

On the local repository fixture, fill #a=7 and #b=5, click Compute, and a fresh
#result read returned 12. Screenshots at 375, 768 and 1440 pixels were generated.
An invalid localhost navigation raised an error, and the browser closed in
finally (isConnected() was false afterward).

This does not establish external anti-bot behavior, headed operation,
Windows/Linux runtime support, persistent profiles or the licensed Chromium 154
channel. The free macOS browser remains Chromium 145 despite the latest wrapper.

## Cua host update and reviewed contract

Before updating, the running old daemon reported zero live sessions.
The old app bundle was backed up. The reviewed installers at the immutable
0.34.1 release commit were downloaded as files and run with explicit version
and no-PATH-change settings. The installer verified the release SHA-256 and
macOS code signature. Archive Sigstore verification was not performed because
cosign is unavailable; this is separate from the successful bundle codesign check.
The replacement satisfied the prior designated signing requirement, so no
Accessibility or Screen Recording reset was needed. Saved settings were retained.
The previously running Cua service was relaunched under its own app identity;
Paseo was not restarted.

Post-update evidence:

- `cua-driver --version`: 0.34.1.
- `cua-driver doctor --json`: ok=true, build version and release git SHA agree.
- `cua-driver permissions status --json`: accessibility=true,
  screen_recording=true, attribution=driver-daemon. Direct capture remained
  not_checked; permission presence does not prove GUI actions/capture.
- `list-tools`, `describe click`, `describe get_window_state` and
  `mcp-config --client opencode` exited 0. No MCP configuration was changed.
- The installed click schema accepts element_token and capture_id, and rejects
  undeclared element_index/snapshot_id arguments. The get_window_state schema
  exposes display_only and include_accessibility_tree. Display-only previews
  cannot ground input actions.

Fresh-install helpers now pin the reviewed 0.34.1 commit but still reuse any
existing working driver. The explicit host upgrade above does not change that
installer policy. Windows -NoAutoStart/-NoPathUpdate and private staging were
source-reviewed; no fresh Windows runtime execution was performed in this run.

## Package verification

- Shared Python suites: 49 passed on macOS, including installer/reuse, broken
  candidate preservation, fixture failures, migration and bounded diagnostics.
- Temporary-home full install: source files for updated skills matched both
  agent and Claude targets; the real-host Cua install was skipped.
- Updated skills passed quick_validate; Bash/Node syntax and git diff checks
  were run for the applicable changes.
- Dated README history retains the previous dependency versions. Current
  recipes, install-helper pins and the refreshed guidelines use the new versions.

The separate audit's cleanup protection and vendored-test/CI findings were outside
this initial dependency refresh. Their subsequent fixes are recorded in
[the improvement validation](skill-improvements-2026-10-13.md). Native GUI/MCP end-to-end, Windows/Linux host
upgrades and the licensed browser channel remain outside this result.

Official sources:

- [CloakBrowser 0.6.2 changelog](https://github.com/CloakHQ/cloakbrowser/blob/4a1b8f9c89adb43d7b1f853055ac41e3e59876ab/CHANGELOG.md)
- [Cua Driver 0.34.1 release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.34.1)
- [Pinned Cua installers](https://github.com/trycua/cua/tree/0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc/libs/cua-driver/scripts)
- [Vercel snapshot](https://github.com/vercel-labs/web-interface-guidelines/blob/4ecfb9fb8d1d3b7009674869b3aaee2f904042e1/command.md)
