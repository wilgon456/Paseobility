# Dependency validation — 2026-10-20

Scope: Paseobility v2.10.0 source and this Apple Silicon macOS 26.6.2 host.
No release, Paseo daemon restart, Windows/Linux host run or native GUI
end-to-end pass is claimed. The procedure follows
[the 2026-10-13 record](dependency-validation-2026-10-13.md).

| Component | Source pin / installed result | Evidence |
| --- | --- | --- |
| Cua Driver | 0.36.0 | installed bundle + CLI; doctor build git_sha 6d6c734c127025fb39ad5d585a10382808b39dc1 |
| CloakBrowser | 0.6.3 | upgraded and smoke-tested earlier the same day (see Browser runtime) |
| playwright-core | 1.64.1 | same browser run |
| Free Chromium on macOS | 145.0.7632.109 | browser.version() from the same browser run |

## Cua version choice

Candidates after 0.34.1: 0.35.2, 0.35.4, 0.36.0 (2026-10-16) and 0.37.0
(released 2026-10-20 03:41 UTC). All carry GitHub's "Pre-release" label, which
upstream uses only to keep the monorepo "Latest" pointer stable, as with 0.34.1.

0.36.0 was chosen over 0.37.0:

- 0.37.0 adds a macOS direct-capture consent gate (#5352). That gate broke every
  hosted macOS E2E capture until #5402. On 0.37.0's release day a further
  capture-consent fix (#5564, custom `$HOME` makes every window screenshot
  refuse with `direct_capture_consent_required`) was open and unmerged. A
  release-gate flake fix (#5558) and the 0.37.1 release PR (#5559) were also open.
- 0.37.0 also adds a stricter keyboard-focus refusal (#5372, which needed the
  #5402 follow-up), agent-approved macOS prompts (#5467), a skill pack installed
  during agent setup (#5491) and an installer that stops every
  `com.trycua.driver` process and unregisters other app copies. None of this
  is needed here, and it has had no time to settle.
- No GitHub issue was filed against either release on 2026-10-20. The decision
  rests on the open fix PRs above, not on a filed regression.
- The compare API confirms that the 0.36.0 tag already contains the bare-binary
  change (#5333). It does not contain #5352 or #5372.

## Installer review (0.34.1 → 0.36.0)

Files at the immutable 0.36.0 tag commit were downloaded into a fresh
`mktemp -d` directory and diffed against the reviewed 0.34.1 copies.

- `install.sh` and `_install-common.sh`: byte-identical (same git blob).
- `_install-rust.sh`: the baked default version changes (0.33.4 → 0.35.4). A
  `print_path_hint` replaces the bare PATH warning. The hint prints only; with
  `--no-modify-path`, nothing is appended to a shell rc. The release-asset copy
  differs from the commit copy only in the baked version (0.36.0), which an
  explicit `CUA_DRIVER_RS_VERSION` overrides.
- Windows `install.ps1`: only the baked default version changes.
  `_install-common.psm1` is byte-identical. The Windows release still ships
  `cua-driver.exe`, `cua-driver-uia.exe` and `cua-cursor-theme.exe`.
- Neither installer installs the skill pack, writes MCP config, starts a daemon
  or registers autostart. The macOS installer resets Cua TCC rows only when the
  replacement is proven not to satisfy the previous designated requirement.

Reviewed digests (SHA-256): `install.sh`
a103177e0df86d04d752bfa20c73f99a3e501906f1814c3127da84788539d9ba,
`_install-rust.sh` b17d5594b1c1790e8b387bf1d58f2915d217fe01f138b6b8117b63d229d33cbc,
`_install-common.sh` 5bc3aa010eb8667a099b582a9ada9a8f93001745b842cc7cf3cc6c472520cf29.

## Bare-binary rule and bin publishing

0.36.0 warns at daemon startup and refuses background pixel clicks, drags and
window-addressed keys (`windowserver_connection_invalid`) when the daemon runs
outside `CuaDriver.app`. Upstream decides "bundled" from the **canonicalized**
executable path (`bundle.rs`). The installer's
`~/.local/bin/cua-driver -> /Applications/CuaDriver.app/Contents/MacOS/cua-driver`
symlink therefore counts as bundled. On this host, `which cua-driver` resolves
to that symlink, and it runs. Doctor reports the argv exe and the resolved
in-bundle path. `health_report` `windowserver_connection` passed.

No publishing fix was needed. The shell helper now warns, without failing or
rewriting anything, when the driver it reuses or installs on macOS resolves
outside the bundle (for example a copied binary). The PowerShell helper notes
that the rule is macOS-only; Windows publication is unchanged.

## Cua host update

1. Before the update, the running 0.34.1 daemon reported zero live sessions
   (`sessions list`: count 0) both before the backup and again just before the
   swap.
2. Backup:
   `~/.local/share/paseobility/backups/cua-driver-0.34.1-20261020-141537/`.
   It holds a zipped signed bundle, a `~/.cua-driver` archive, the old symlink
   target, the designated requirement and binary digests. It is zipped, not a
   live `.app`, so LaunchServices does not register a second copy. A test
   extraction passed `codesign --verify --deep --strict`, and its binary hash
   matched the old doctor `exe_sha256`.
3. Pre-flight: the 0.36.0 darwin-arm64 archive matched the release
   SHA256SUMS. Its app passed strict codesign and Gatekeeper (Notarized
   Developer ID, Cua AI, Inc., YCK386LBJ7). It also satisfied the installed
   app's designated requirement (`codesign -R`, exit 0), so no TCC reset could
   follow.
4. The pinned files were run with
   `CUA_DRIVER_RS_VERSION=0.36.0 CUA_DRIVER_RS_NO_MODIFY_PATH=1 bash install.sh --no-modify-path --bin-dir ~/.local/bin`.
   The installer verified the universal archive against SHA256SUMS
   (2a83cf9c3a2fa7ae27f3fe62e426aeca5acf76511bb14dd64d10ccb2de6aecae) and
   re-verified signing compatibility. It reported "existing Accessibility and
   Screen Recording grants were preserved". Archive Sigstore verification was
   not performed because cosign is unavailable.
5. `~/.zshrc` was byte-identical afterwards, and no upstream skill pack or MCP
   entry was added. The service was relaunched under its own app identity with
   `open -n -g -a CuaDriver --args serve`. Paseo was not restarted.

Post-update evidence:

- `cua-driver --version`: 0.36.0, both through the PATH symlink and through the
  app binary.
- `cua-driver doctor --json`: ok=true. The build version is 0.36.0, git_sha
  6d6c734c127025fb39ad5d585a10382808b39dc1 and exe_sha256
  54bb23df35ae9a52b6fa7b71e607364d0711bbbf750b9edb006e87b9af586fdd.
- `cua-driver permissions status --json`: accessibility=true,
  screen_recording=true, attribution=driver-daemon, executable inside the
  bundle. Direct capture remained not_checked.
- `health_report`: overall ok. Binary, bundle identity, both TCC checks,
  `ax_capability` and `windowserver_connection` passed. Direct ScreenCaptureKit
  readiness was skipped, as the tool is read-only.
- `list-tools`: 60 tools, matching upstream's generated 0.36.0 macOS spec
  exactly. Compared with 0.34.1, `run_steps` and `run_script` were added and
  nothing was removed.
- `describe click`: `element_token` and `capture_id` are accepted with
  `additionalProperties:false`. A call carrying `element_index` was refused
  with `invalid_arguments`.
- `describe get_window_state`: the default tree is compact Markdown, with row
  `[N]` addressed as `<snapshot_id>:N`. It adds `since`, `tree_format`,
  `full_output` and `verbose`. `display_only` and
  `include_accessibility_tree` remain.
- `describe run_steps` / `run_script` and `mcp-config --client opencode` exited
  0. No MCP configuration was changed.
- Read-only GUI: `list_windows` returned 10 windows (Finder had none open).
  `get_window_state` on an on-screen window returned a 1366x747 screenshot. All
  four windows tried returned an empty tree with `ax_window_unresolved`, and the
  console session was locked at the time (`CGSSessionScreenIsLocked=Yes`, about
  13.8 h idle). An AX-tree read on an unlocked desktop was not verified. No
  click or typing was sent.

Host note: the 2026-10-13 backup
`~/.local/share/paseobility/backups/cua-driver-0.28.2-20261013/CuaDriver.app`
is still a live bundle registered with LaunchServices. `open -a CuaDriver`
started `/Applications/CuaDriver.app` this time, but that registration could
make macOS pick the old copy. It was left untouched.

## Repository changes

- Both helpers pin 0.36.0 at 6d6c734c127025fb39ad5d585a10382808b39dc1. The
  shell helper adds the macOS bundle warning and a
  `PASEOBILITY_CUA_HOST_OS` test hook.
- `paseo-cua` SKILL/workflow/setup/recovery describe `<snapshot_id>:N` tokens,
  narrow reads, `since` diffs and `run_steps`/`run_script` batching. They also
  cover the bare-binary refusal and the empty trees seen on a locked screen.
- Current README/README.ko/AGENTS pin statements were updated. Dated history
  sections keep 0.34.1.

## Browser runtime

CloakBrowser 0.6.3 with playwright-core 1.64.1 was upgraded and smoke-tested
earlier on 2026-10-20, separately from this Cua pass:

- The fixture sum read back 12.
- A state-changing `evaluate` worked.
- A persistent profile reused its cookie across launches.
- The free macOS browser reported Chromium 145.0.7632.109.

That run is not repeated here.

## Package verification

- `python3 scripts/validate-skills.py`: OK.
- `python3 -m pytest -q tests`: 69 passed, 1 skipped (the PowerShell scanner
  helper; no pwsh on this Mac). New Cua tests cover several cases:
  - sh/ps1 pin parity
  - no warning for an absolute symlink into `CuaDriver.app`
  - no warning for a relative symlink into `CuaDriverLocal.app`
  - a warning, with no rewrite or reinstall, for a reused bare binary
  - a warning after a fresh bare-binary install
  - no warning on non-macOS hosts
- `tests/test_cua_driver_runtime.ps1` fixture expectation updated to 0.36.0.
  It was not executed (no PowerShell here).

Not verified: native GUI end-to-end actions, an AX tree on an unlocked desktop,
Sigstore archive signatures, Windows/Linux runtime installs and the 0.37.x line.

Official sources:

- [Cua Driver 0.36.0 release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.36.0)
- [Pinned Cua installers](https://github.com/trycua/cua/tree/6d6c734c127025fb39ad5d585a10382808b39dc1/libs/cua-driver/scripts)
- [Bundle detection](https://github.com/trycua/cua/blob/6d6c734c127025fb39ad5d585a10382808b39dc1/libs/cua-driver/rust/crates/cua-driver/src/bundle.rs)
- [Cua Driver 0.37.0 release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.37.0),
  [#5402](https://github.com/trycua/cua/pull/5402),
  [#5564](https://github.com/trycua/cua/pull/5564),
  [#5559](https://github.com/trycua/cua/pull/5559)
