# Dependency validation — 2026-11-06

Scope: Cua runtime pins, the optional browser backends, and the controller plus
the two selected remote Macs. This complements the [Paseo 0.15.2 compatibility
record](compatibility-0.15.2.md); it does not update or restart Paseo.

## Decisions

| Component | Previous | Selected | Verified boundary |
| --- | --- | --- | --- |
| Cua Driver | 0.36.0 | 0.39.0 | Published macOS bundle, CLI/schema, live daemon, permissions and read-only window capture; Windows installer source review only |
| Playwright Core (Cloak peer) | 1.64.1 | 1.65.0 | Isolated and installed local runtime; input/click/readback, state mutation, persistent-cookie reopen |
| Microsoft Playwright CLI | 0.1.22 | 0.1.23 | Exact npm package, CLI help and isolated headless Ego fixture with input/click/readback/snapshot/close |
| CloakBrowser | 0.6.3 | 0.6.3 retained | 0.7.0 requires a license key, incompatible with the documented keyless workflow |
| Ego Lite on selected remotes | 0.6.2.8 | unchanged | Installed bundle version read back; no Ego update claimed |

The latest numbered Cua release at inspection was
[0.39.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.39.0),
published 2026-11-06 12:33:37 UTC, commit
`81f3e1bbc0d113c1a33a71b4150fb6ece6a5e9cd`. Upstream marks numbered
releases as GitHub pre-releases to preserve the monorepo-wide Latest pointer;
this is distinct from the nightly channel. No nightly was selected.

## Cua installer and schema review

Compared all five pinned shell/PowerShell installer files against 0.36.0:

- `install.sh` and `_install-common.psm1` are unchanged.
- Shell helpers now identify this user's macOS release processes by bundle
  identity, stop them, and unregister other Cua copies without deleting files.
  They also unregister a temporary extracted app on cleanup. They do not
  register MCP, install the upstream skill pack, or start the daemon.
- PowerShell adds a junction fallback for non-ASCII PowerShell 5.1 environments
  and fails closed when cosign cannot start. Paseobility still stages privately,
  publishes only the three known executables, and passes `-NoAutoStart` and
  `-NoPathUpdate`. No actual Windows installation was performed in this pass.
- The source scripts' baked release is 0.38.0. Explicit
  `CUA_DRIVER_RS_VERSION=0.39.0` overrides it; both helpers use the same version
  and immutable source commit. Existing working runtimes are still reused;
  skill installation does not implicitly upgrade them.

SHA-256 of the commit-pinned installer files:

```text
a103177e0df86d04d752bfa20c73f99a3e501906f1814c3127da84788539d9ba  install.sh
0be0bd269056a7c0c5b15e77ff6c64c880267d091957c97efc19103380e4aeb7  _install-rust.sh
0d5d4b023bfe9111db810b0fde2be23188b703a94093b438edc79b0af8f4b987  _install-common.sh
bcdc846f03b4476ba62fbda8962c0dface0329c407171ddc57008bff897bb890  install.ps1
99f34a84ceab04d4b488b1db4d71536c7a7ac7e645ac2ec295b4fd85244085b6  _install-common.psm1
```

The macOS universal archive matched the published SHA-256
`dc16208934f470a46ba7ec00df0f857878874d6ad45a41284e3cec7023942242`.
Strict/deep codesign and Gatekeeper passed (Notarized Developer ID, Cua AI,
Inc., team `YCK386LBJ7`). The candidate satisfied the old app's designated
requirement. Sigstore verification was not performed (cosign unavailable).

The released binary's 62 tools exactly match the generated macOS tool spec at
that commit. `describe click` and `describe get_window_state` were checked.
Snapshot tokens remain `<snapshot_id>:N`; JPEG snapshots do not mint a
`capture_id`, so capture-bound pixel actions need a fresh PNG snapshot.

The direct-capture consent issue with a repurposed `HOME`
([upstream #5564](https://github.com/trycua/cua/pull/5564)) is still open and
not fixed in 0.39.0. Keep the real account home and report
`direct_capture_consent_required`; never bypass the OS approval. The new
`serve --no-automation-prompts` flag is documented as opt-in, not enabled by
installation or this update.

## Installed and live state

| Host role | Installed CLI | Live runtime | Result |
| --- | --- | --- | --- |
| Current Apple Silicon Mac | 0.39.0 | 0.39.0, expected git SHA | doctor/health ok; Accessibility and Screen Recording true |
| Selected remote MAC_COM | 0.39.0 | 0.39.0, expected git SHA | doctor/health ok; Accessibility and Screen Recording true |
| Selected remote MAC_MINI | 0.36.0 | preserved | Existing Cua MCP client and several serve processes: runtime update deferred |

Both completed updates checked zero sessions again immediately before mutation,
archived the signed old app and configuration, verified a test extraction, and
preserved shell configuration. Backups stay under each user's
`~/.local/share/paseobility/backups/cua-driver-0.36.0-20261106-*/`.
Skill updates were backed up separately and applied to `.agents` and `.claude`
on all three Macs. Runtime versions and document versions are intentionally
reported separately.

**A real stale-daemon case was reproduced on MAC_COM.** The old daemon was
launched through `~/.local/bin/cua-driver serve --socket ...`; upstream's
bundle-path process matcher did not stop it. The new CLI reported 0.39.0 while
live `health_report.build.version` and `git_sha` still reported 0.36.0. Even
`build.exe_sha256` described the newly replaced on-disk file, so that hash alone
was misleading. After another zero-session check, a graceful Cua `stop` and
exact-path app launch made live version/SHA match 0.39.0. No Paseo restart was
performed. Recovery guidance now checks live version/SHA, not just CLI/doctor.

On the current Mac, `list_windows` returned 14 windows. A Finder window read
returned a valid 920×436 PNG; its AX tree correctly reported `screen_locked`.
No native click or typing was sent. Permission status's direct-capture field
was `not_checked`; that is not a permission-readiness pass. The actual PNG is
separate capture evidence. A full unlocked native GUI E2E remains unverified;
0.28.2 remains the historical full-action result.

## Optional browser dependencies

[CloakBrowser 0.7.0 source](https://github.com/CloakHQ/CloakBrowser/tree/1cc093aef0e50b3f5c27fc16b26314add843203a)
and npm package were inspected without running login or claiming a key.
`ensureBinary()` resolves a license or starts signup; a free key no longer
provides the old keyless flow. Therefore 0.6.3 remains intentional, with the
reason recorded next to its pin. No credentials or license settings changed.

CloakBrowser 0.6.3 + Playwright Core 1.65.0 passed a localhost fixture
(`5 + 7 = 12`), JS state readback, and a persistent cookie across two launches.
The test used the existing cached free macOS Chromium 145.0.7632.109 with
updates disabled, in a task-owned profile. The local owned runtime was updated
with exact pins and a lockfile backup; no global npm package was changed.

[Playwright CLI 0.1.23](https://github.com/microsoft/playwright-cli/tree/0a808078d96496cf2a8fa725143c870354f63cda)
was installed in a temporary prefix and its tag matched npm `gitHead`.
Its own package declares Node >=18, but the bundled Playwright dependencies
are `1.65.0-alpha-2026-10-30` and actually reject Node 18.4.0. Node 22.23.2
passed the named-session fixture using an explicit headless Ego executable
and temporary profile. CLI guidance now states the effective Node >=20 floor
and the upstream alpha dependency. This does not validate a downloaded
Playwright Chromium build or Windows CLI behavior. The test session was closed.

## Repository checks

- Shared Python suite: 259 tests, 247 passed and 12 platform/optional skips.
- Focused Cua helper suite: 25 passed, including pin parity and no accidental
  upgrades of existing/broken installations.
- Skill catalog/frontmatter validation and `git diff --check`: passed.
- No PowerShell runtime available locally; Windows fixture expectation updated
  to 0.39.0, but native Windows execution is not claimed.
- No GitHub release or production Paseo update is part of this dependency pass.

## Subsequent authorized multi-host rollout (same day)

The user then explicitly requested propagation to the other computers,
including driver dependencies. This supersedes the initial MAC_MINI deferral
and Windows runtime limitation above; the historical initial observations are
retained.

| Host | Installed and live Cua | Owned Playwright Core | Plugin |
| --- | --- | --- | --- |
| MAC_HOME | 0.39.0 | 1.65.0 | running |
| MAC_COM | 0.39.0 | 1.65.0 | running |
| MAC_MINI | 0.39.0 | 1.65.0 | running |
| VAX_COM (Windows x64) | 0.39.0 | 1.65.0 | running |

- MAC_MINI had zero live Cua work sessions at the repeated pre-swap check.
  Its default `serve` processes were updated without directly stopping an
  agent or MCP client. The previously observed MCP client PID was defunct
  afterwards, so that old connection is not claimed preserved; clients need
  a fresh connection. Live `health_report` version and commit matched the pin.
- VAX_COM had no live daemon or active driver process at publication time.
  Its official Windows archive matched SHA-256
  `4e81e5b13538f3c0da418be2f3be50764e1907f7b934b6266ca8bcb4b475b541`.
  All three released executables (`cua-driver.exe`, `cua-driver-uia.exe`,
  `cua-cursor-theme.exe`) had valid Authenticode signatures. The old executable
  set and config were backed up, the verified files copied into the existing
  shared bin, and the new driver started without registering autostart or
  modifying PATH. Installed hashes matched the staged artifacts and the live
  health result was `ok`, version 0.39.0 and the expected git SHA. This was an
  explicit runtime update, not an implicit upgrade through the ensure helper.
- Each installed plugin checkout received the changed browser/Cua references
  and both 0.39.0 installer helpers. Installed `.agents` and `.claude` skill
  files were compared byte-for-byte with that source. Existing files were
  checked against the known old/new source before overwriting and backed up.
- VAX_COM's Paseo 0.15.0 had rejected the previous `<0.14.0` plugin requirement.
  Applying the tested `<0.16.0` compatibility bound and reloading only the
  plugin restored `running`. All four plugin instances were read back.
- The existing owned browser runtimes on both remote Macs and Windows were
  upgraded with exact pins and lockfile backups. All three passed the same
  input/click/readback and persistent-cookie fixture: macOS Chromium
  145.0.7632.109, Windows Chromium 146.0.7680.177. CloakBrowser remains 0.6.3.
  The optional Playwright CLI 0.1.23 recipe was propagated; no global CLI
  installation is implied.
- No Paseo daemon restart, agent stop, credential change, or public release
  occurred. Full native Windows GUI action E2E and an unlocked macOS native
  action test are still outside this verification.

The final Windows MCP check uncovered a separate diagnostic bug: the driver's
UTF-8 `tools/list` descriptions were decoded using Python's Korean Windows
`cp949` default. The reader swallowed the decoding failure, reporting
`tools/list did not return a JSON-RPC response` despite a healthy daemon.
The same connection succeeded when explicitly decoded as UTF-8. The doctor's
MCP subprocess now specifies `encoding="utf-8"`; the fix was propagated to the
installed package source on all hosts. A real subprocess regression fixture
with Korean/em-dash/arrow descriptions reproduced the failure under a cp949
default before the fix. Fresh initialize/tools-list checks verify the transport
and schema discovery only, not native GUI actions.

After deploying that fix, the actual fresh MCP checks passed on all four hosts:
62 tools on each Mac and 63 on Windows. The focused doctor suite passed all
26 tests, including the new regression which failed before the encoding fix.

A subsequent MAC_MINI repair traced the exited MCP client to a project-local
Unix-socket bridge that never recreated a dead child, rather than to Paseo or
the new driver. That ignored runtime was backed up and repaired to reconnect
between requests, reap dead children, and report uncertain actions without
replaying them. Five focused regression tests and actual child-exit recovery
on an isolated socket passed. The original socket then served consecutive
health/window-list/health calls. Only the custom bridge was restarted; the
Paseo and Cua daemons remained running.


## Release deployment follow-up: plugin ID replacement

After v2.12.12 passed all five CI jobs and was published, the built-in updater
failed on all four existing installations: `plugin add` rejects an already
configured ID. Its rollback made the same call. Skills had been backed up and
copied, while the original plugin registrations remained running. No successful
package receipt was written, so the UI correctly did not claim a verified install.

The v2.12.13 worker explicitly removes only the selected plugin before adding
the replacement. Directory source trees are retained by Paseo; managed Git
checkouts are copied and verified before removal because Paseo deletes them.
Changes to registration or source during preparation abort the switch. A failed
activation removes only the known candidate and restores the prior code from its
preserved path or backup. Uncertain responses retain the lock and require
inspection, including uncertainty during rollback.

The regression host now rejects duplicate IDs, removes managed checkouts, and
models both pre-registration and post-registration activation failure. It covers
concurrent registration/source edits, failed removal and lost add/remove/rollback
replies. The plugin suite has 41 cases. Actual directory and managed Git
replacement both completed on a separate Paseo 0.15.2 daemon with verified
receipts; the temporary daemon was stopped afterward. No browser or native GUI
action was used for this check.

Existing installations need the corrected worker bootstrapped before invoking
their updater, because that worker is read from the old installed source. The
selected hosts receive that single-file repair with a backup and digest check,
then use the official pinned release update path.
