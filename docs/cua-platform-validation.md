# Cua platform validation status

`/paseo-cua` is **preview / limited validation**. It is not broad, stable, and
fully verified Mac and Windows support. This page records the exact verified
boundary, what remains unverified, and the short procedure to validate a new
target before any support claim is updated. It separates **directly verified**
evidence from **user-reported** results.

## Verified boundary

One target has directly verified evidence, recorded here on 2026-09-21. Separate
user-reported Intel macOS and Windows results are recorded below.

| Field | Verified value |
| --- | --- |
| Host | one Apple Silicon macOS machine, macOS 26.6.2 |
| Cua Driver | 0.28.2 (pinned by the Paseobility installer) |
| Binary / self-check | installer prepared the binary; `cua-driver doctor` reported every probe ok |
| MCP integration | registered with the OpenCode client and connected; handshake ok and `tools/list` returned 56 tools |
| macOS permissions | Accessibility and Screen Recording reported `true` under the driver-daemon identity (`com.trycua.driver`) |
| Native GUI smoke | dedicated background Calculator instance; background accessibility actions performed `1 + 1 = 2` with no focus steal and no foreground escalation; the driver's own window screenshot (plus a zoom crop) visually showed result `2` |

What was actually demonstrated there: the pinned binary installs and self-checks,
the MCP server is discoverable by a real client, the OS grants can be held under
the driver's own app identity, and at least one native app can be driven and
captured. That is a preview boundary, not a support matrix.

## Explicitly not verified

- **Exposure inside an already-running Paseo session.** The MCP server was
  registered and connected, but the long-running Paseo provider was
  intentionally not restarted, so tool exposure inside a live, pre-existing
  session was not confirmed. A new session or an integration reload may be
  needed to pick it up, but that specific path was not exercised here.
- **The driver's `verify_state` on the Calculator result.** It returned
  `unknown`, meaning **Cua's own observation of that target was incomplete**.
  This is a Cua observation gap on that target, not a statement that macOS never
  exposes the value — an independent native accessibility read-back did expose
  `2`. Treat `unknown` as "not confirmed", never as success and never as proof
  about the platform.
- **A dedicated ScreenCaptureKit capture probe.** It remains `not_checked`. The
  screenshot above is real image proof for the capture path that ran; it does
  not validate every capture backend.
- **Other macOS hardware and OS versions, native Windows end-to-end behavior,
  and Linux.** User-reported results exist for an Intel macOS host (functional
  pass) and for a Windows host (install recovery and readiness only), both below,
  but neither was independently reproduced in this review. Other macOS versions,
  native Windows end-to-end GUI behavior, and Linux have no evidence (see the
  matrix below).

### Permission-status semantics

`unknown` / `permissions_pending` is **not** the same as denied. On this host an
earlier status reported `unknown` / `permissions_pending` even though the user
had granted the permissions. A `cua-driver stop` followed by a LaunchServices
relaunch cleared that state, after which status reported the grants `true` under
the `driver-daemon` identity. The earlier daemon attribution was **not
independently established**, so do not treat the earlier `unknown` as proof the
grants were absent, and do not attribute it to a specific cause.

## 2026-09-22 recheck: unlocked Calculator and browser screenshot recovery

Same host and baseline as above: macOS 26.6.2 (Apple Silicon), Paseo
0.9.0-beta.2, Cua Driver 0.28.2.

- **Unlocked Calculator result.** With the OS session unlocked, accessibility
  input `7 + 5 =` on a background Calculator instance produced `12` in the
  window tree markdown **and** in an inspected screenshot. The driver's
  `verify_state` (`AXStaticText`, `value_equals 12`) still returned `unknown`;
  that predicate is **not** confirmed and must not be reported as passed.
- **Permission status is not readiness.** Granted Accessibility and Screen
  Recording still do not by themselves prove the driver can act on a target;
  confirm it with a snapshot and one action.
- **Browser capture recovered by restoring the host window.** With the Paseo
  host window not on screen, `browser_screenshot` returned
  `screenshot_no_frame` reproducibly while the session was unlocked; resizing
  alone did not repair it. Bringing the exact existing Paseo window to the front
  restored immediate valid PNG captures (a second fresh background tab captured
  too). No tab reload, app restart, or daemon restart was involved. This
  supports restoring/showing the host window as a recovery step; it does not
  prove universal background capture, and ordinary default-viewport screenshots
  succeeded. See
  [`skills/paseo-browser/references/screenshots.md`](../skills/paseo-browser/references/screenshots.md).
- **`fullPage` duplication unresolved.** At a fractional device pixel ratio,
  `fullPage: true` returned an image with repeated right/bottom edges while a
  default-viewport capture of the same page was valid. This remains an
  unresolved native product defect; do not claim visually correct full-page
  stitching. It matches the open upstream issue
  [getpaseo/paseo#3196](https://github.com/getpaseo/paseo/issues/3196)
  ("full-page browser screenshots repeat the visible viewport"); that issue was
  filed against an older 0.3.1 / macOS arm64 build, so it is a matching known
  symptom, not proof of the exact Intel root cause or version.
- **Windows not re-tested on this host.** The native Windows runtime still has
  only the user-reported readiness result below; there is no end-to-end Windows
  evidence.

These results are measured on this one Apple Silicon macOS host. They are not
evidence for other macOS hardware, other OS versions, Windows, or Linux.

## 2026-09-22 user-reported Intel macOS result

A separate run on an **Intel Mac mini (`Macmini8,1`, 16 GiB)** was reported by a
user; it was **not** executed or reproduced in this review (supplied evidence).
Report received 2026-09-22.

| Field | Reported value |
| --- | --- |
| Host | `Macmini8,1`, Intel Core i7-8700B 3.20 GHz, 6 cores, x86_64, 16 GiB |
| OS | macOS 15.8, build 24H23 |
| Paseo | app, bundled CLI, and user CLI all 0.8.0 |
| Installed Paseobility | v2.8.0, public `main` commit `cf7af69809` |
| Cua Driver | installed 0.28.2, `x86_64-macos`; `/Applications/CuaDriver.app` and `~/.local/bin/cua-driver` |
| Provider/client | initial: Grok CLI 1.0.40 (`eb1a2256660d` stable) `grok-4.6`; subsequent: Codex CLI 0.155.1 `gpt-5.6-sol` |
| Test window | 2026-09-22 11:45–12:42 KST; environment/memory lookup 13:03; final status 13:06–13:07 |
| Install | official installer with `--migrate-skills --with-claude --no-context` succeeded without `--skip-cua-driver`; 28 files matched in each install root; obsolete-skill migration not applicable (none present before) |
| New session | all 7 skills recognized |
| MCP integration | persistent Cua MCP connected; 56 tools reported, with the CLI `list-tools` count reconfirmed at 13:07 |
| Readiness | `cua-driver doctor` 7 probes ok; Accessibility and Screen Recording `true` under `com.trycua.driver` |
| Native GUI smoke | 12:37 Calculator `7 + 5 = 12`, accessibility read-back plus an inspected `198x350` PNG |
| `verify_state` | `unknown` (`observation_unavailable`), stable `false`; not a pass |
| Browser capture | 12:41 temporary LAN page: input `7 + 5`, click Compute, observed `12` via DOM/snapshot; viewport PNG `1168x730` passed; 800 px scroll hit the bottom marker |
| `fullPage` | `1263x1197`, 2x2 repeated tiles with the right edge clipped — failed (known issue `#3196` below) |
| Regression tests | 41 tests across four suites: Node cleanup 11 + Node share 15 + Python scanner 13 + shell 2 (separate from the prior 48-test total that includes migration 7) |
| Cleanup | reported done |

Reported limits and clarifications:

- This is **supplied evidence, not independently reproduced in this review**.
- `direct_capture_status` read `not_checked` in the later read-only lookup; that
  does not negate the earlier PNG success.
- `verify_state` stayed `unknown` (stable `false`) on the Calculator target and is
  **not** a pass.
- The `41` result spans four suites (Node cleanup 11, Node share 15, Python
  scanner 13, shell 2) and is separate from the E2E run; do **not** conflate it
  with the prior 48-test total that includes migration `7`.
- Browser: the OS was already unlocked and Paseo was **not** hidden; restoring the
  existing tab still failed and a **new** tab succeeded. A stale-WebView-paint
  cause is an inference, not a confirmed root cause, and this must **not** be
  conflated with the Apple Silicon host-window recovery. A loopback URL failed
  with `chrome-error://chromewebdata/` while the LAN URL worked; the cause is
  unknown, so no universal network claim follows.
- The initial Cua daemon launched from a shell/symlink identity reported
  `unknown` / `permissions_pending`. The report records only a Cua LaunchServices
  restart (after verifying no active Cua session) plus human permission grants
  fixing the identity; this is a reported observation, not a root-cause
  reproduction.
- Memory: timestamped snapshots (KST). The final E2E ran later, so these are not
  peak or incremental measurements.

  | Metric | 11:51 | 12:22 | 12:23 | 13:03 |
  | --- | --- | --- | --- | --- |
  | Paseo RSS (MiB) | 635.8 | 753.8 | 715.2 | 968.6 |
  | Cua RSS (MiB) | not running / not installed | 44.4 | 44.5 | 68.2 |
  | `memory_pressure -Q` free (%) | 64 | 55 | 55 | 61 |
  | swap used (MiB, of 2048 allocated) | 1130.75 | 1081.50 | 1049.50 | 985.50 |

  Chronology caveat: the final native/browser E2E ran 12:37–12:41, **after** the
  12:22/12:23 samples. There is no measured peak and no causal increment; RSS may
  double-count shared pages; the `memory_pressure` free percentage is a
  command-reported metric, not raw physical free RAM or a pressure color; and no
  8 GB capacity claim follows.

The browser `fullPage` failure matches the open upstream issue
[getpaseo/paseo#3196](https://github.com/getpaseo/paseo/issues/3196); the note in
the recheck section explains why it is a matching symptom and not proof of this
host's exact cause or version.

## 2026-09-22 user-reported Intel 8 GiB MacBook Pro result

A separate run on an **Intel MacBook Pro (`MacBookPro15,2`, 8 GiB)** was reported
by a user; it was **not** executed or reproduced in this review (supplied
evidence). Report received 2026-09-22. Reported basic flows passed; limitations
remain. This is the only 8 GiB Intel data point recorded here: it confirms one
working 8 GiB configuration, not blanket 8 GiB support and not other Cua
versions.

| Field | Reported value |
| --- | --- |
| Host | `MacBookPro15,2`, Intel Core i5-8279U 2.40 GHz, 4 cores, x86_64, 8 GiB |
| OS | macOS 15.7.9, build 24G830 |
| Paseo (E2E) | app and CLI 0.7.2 |
| Paseo (later read-only snapshot) | app / CLI / daemon 0.9.0-beta.2; daemon started 12:56:14 KST, actor/cause unknown |
| Cua Driver | reused existing 0.17.0 (app/CLI), **not** the pinned 0.28.2; no auto-upgrade |
| Installed Paseobility | v2.8.0, public `main` commit `cf7af69809` |
| Provider/client | initial: Paseo 0.7.2 with Grok `grok-4.6` (Grok client version unknown); subsequent: Codex CLI 0.155.1 `gpt-5.6-sol` |
| Test window | 2026-09-22 11:40:56–12:48:49 KST; read-only snapshot 13:01:55–13:05:43 |
| Install | official installer `--migrate-skills --no-context --with-claude`; both skill roots had 7 dirs matching the installed diff and 28 source files were later recounted (no new current-file hash check asserted); 9 prior skills backed up per root; 5 obsolete migrated; unrelated skills preserved |
| New session | 7/7 skills recognized |
| MCP integration | stdio MCP `initialize` / `tools/list` returned 54 tools |
| Readiness | AX and Screen Recording `true` after unlock and human grants |
| Native GUI smoke | 12:47:39 Calculator `7 + 5 = 12` via a separate Calculator AX expression/result and an inspected `396x700` PNG (`screenshot_frame_valid: true`) |
| `verify_state` | matched `label_contains 12` on AXMenuItem `12` (false positive excluded); the stricter `AXStaticText + 12` returned `unknown` (`observation_unavailable`) — no pass |
| Browser | local HTML inserted into the tab DOM: input `7 + 5`, click Compute, Result `12`; an additional public HTTPS page also verified `12`; viewport PNG inspected and scroll hit the bottom marker |
| `fullPage` | repeated the viewport three times — failed |
| Regression tests | none recorded; the reported `12 pass / 1 fail / 1 unknown` are report rows, not a test-runner result, and no Mac mini `41` inference is drawn |
| Cleanup | calculator/server/tab/agent cleanup reported; other agents preserved |

Reported limits and clarifications:

- Supplied evidence, **not independently reproduced in this review**.
- The E2E ran on **Paseo 0.7.2**; the later read-only snapshot showed
  0.9.0-beta.2 with a daemon start whose actor/cause is unknown. Do not call this
  a 0.9.0-beta.2 E2E, and do not claim new-session discovery for the updated
  version. Successful **reuse** of a working `0.17.0` driver is a separate policy
  result and is not proof that a new `0.28.2` install works on this host.
- The `54`-tool count differs from the Mac mini `56` and Windows `57`; the
  Cua/Paseo versions and OS differ, so the counts alone do not demonstrate
  missing tools or a regression.
- Error context: with the session initially locked and permissions not yet
  granted, the reported error/field was `px_capture_unavailable` with
  `screenshot_frame_valid: false` and a black browser frame, recovered after
  unlock and grants. An AX-click daemon-connection drop had unknown cause;
  `press_key` completed and later fresh Calculator AX clicks succeeded. A
  `127.0.0.1` HTTP attempt was refused and a LAN attempt returned an empty
  response / socket 57; the reporter observed the browser host was another
  machine. This does not generalize to "localhost is unsupported"; the
  DOM-injection and HTTPS-fallback scopes are clear, and Mac-localhost HTTP
  access was not proven.
- The `fullPage` three-times repetition relates to the still-open upstream PR
  [getpaseo/paseo#3197](https://github.com/getpaseo/paseo/pull/3197); it remains
  open as of 2026-09-22 and is not a released fix.
- A separate old checkout of `2.5.2` (SHA `8226e3b`) is not the installed `2.8.0`
  source `cf7af69809`.
- Memory: the user labelled samples before/during/after/current but gave no exact
  individual times, and the final current capture is **after** the Paseo version
  change.

  | Metric | before | during | after | current |
  | --- | --- | --- | --- | --- |
  | `memory_pressure -Q` free (%) | 58 | 54 (retry 52) | 56 | 55 |
  | swap used (MB) | 2053 | 1829 (retry ~1567) | 1829 | 2083 / 3072 allocated |
  | Cua RSS | no daemon | 15–21 MiB | stopped | 22.7 MiB |
  | Paseo daemon RSS | unmeasured | 156–160 MiB | later ~184 MiB | 161.8 MiB |

  Current Paseo: 7-process sum 439.7 MiB — not an E2E-time aggregate; only daemon
  RSS was recorded during the earlier run. Current physical memory: 7693 MB used, 497 unused, compressor
  1168 MB. No peak, benchmark, incremental-causality, or durability/concurrency
  claim follows; RSS may double-count shared pages, and the `memory_pressure`
  free percentage is a command-reported metric, not raw physical RAM or a
  pressure color. This confirms a functional 8 GiB configuration on this one
  config only — not blanket 8 GiB support and not other Cua versions.

## 2026-09-22 user-reported Windows result (readiness only)

A separate run on a **Lenovo 21SX002EKD laptop** (Intel Core Ultra 7 255H,
x64/AMD64; 32 GB nominal, 30.92 GiB visible physical) was reported by a user; it
was **not** executed or reproduced in this review. Report received 2026-09-22.
Only the install and readiness layers were exercised — **end-to-end native GUI
evidence is missing** — so this is a partial readiness result, **not** a Windows
pass.

| Field | Reported value |
| --- | --- |
| Host | Lenovo 21SX002EKD, Intel Core Ultra 7 255H, x64/AMD64; 32 GB nominal (30.92 GiB physical) |
| OS | Windows 11 Home 25H2, build 26200.9457 |
| Paseo | app / CLI / daemon 0.9.0-beta.2, Desktop-managed |
| Installed Paseobility | v2.8.0, public `main` commit `cf7af69809` |
| Cua Driver | installed 0.28.2 (recovered manually; see below) |
| Agent clients | install: CommandCode / OpenCode DeepSeek V4.1 Flash; review: Claude provider; snapshot session: Codex CLI 0.154.0 (the exact install/review client versions were not recorded) |
| Timing | install 09:19:26–09:32:55 KST; readiness checks 09:32:55–09:38:38 KST; read-only snapshot 13:07:53 KST |
| Skill files | 28 source files matched by SHA-256 in both the Paseo-style and Claude roots; 7 skills installed; 8 existing skill directories backed up per root; 4 retired names moved; `paseo-skill-save` already absent |
| Skill catalog | only 5 names listed (`paseo-agent-cleanup`, `paseo-browser`, `paseo-project`, `paseo-share`, `paseo-spyware-check`); `paseo-cua` and `paseo-orchestration` are not listed, and a fresh explicit invocation was **not confirmed** |
| Installer result | official installer exited non-zero at the Cua runtime stage; recovered manually (below) — **not** a seamless automatic-install pass |
| Readiness | `cua-driver doctor` reported an interactive user desktop, UIAutomation, and a window inventory of 17; Explorer and the inspector run on Session 1 |
| CLI listing | a CLI tool listing returned 57 tools; this is **not** an MCP handshake, and a persistent MCP connection was **not** tested |
| Browser | only an `example.com` tab open / snapshot read / close passed; input click, PNG capture, scroll, and `fullPage` were **not run** |
| Native app E2E | not run — no app selection, input, read-back, screenshot, or `verify_state` |
| Regression suites | none run (do **not** borrow the macOS `41` or the historical `48` counts) |
| Memory (current snapshot) | Paseo: 10 processes, working set 2906.2 MiB / private 2647.8 MiB; Cua: 0 running processes; physical available 6368 MiB; commit 37334/49068 MiB (76.09%) |
| Cleanup | reported done |

Reported limits and missing fields:

- The exact install and review client versions were not recorded; only the
  snapshot session (Codex CLI 0.154.0) is pinned.
- Both repository YAML files set `allow_implicit_invocation: false` (verified in
  the source root), so the catalog not listing `paseo-cua` /
  `paseo-orchestration` is **not by itself** an install failure. A fresh explicit
  invocation still has to be tested; do not change the trigger configuration
  automatically.
- The memory row is a single current snapshot. The Cua process count was zero, so
  there is **no active Cua footprint measurement** — that is not a zero-cost
  result. Before/during/after footprint was not measured. Working-set sums may
  double-count shared pages and are a different metric from private bytes/RSS. No
  16 GB or 8 GB performance claim follows.
- No automated regression suite was run, so this result must not be combined with
  the macOS suite total.

### Installer conflict and manual recovery (unresolved)

- The official installer exited non-zero at the Cua runtime stage because an
  existing **non-junction** `.local/bin` refused replacement. Manual recovery
  created three hardlinks (`cua-driver.exe`, `cua-driver-uia.exe`,
  `cua-cursor-theme.exe`) to the `0.28.2` release and left other files intact;
  then `cua-driver --version`, the bundled helper `-Check` (exit 0), an `fsutil`
  linkage check, and `doctor` all passed as reported. This is a manually repaired
  install, **not** a reproducible seamless automatic install.
- Source inspection: the local wrapper
  [`scripts/paseobility-cua-driver.ps1`](../scripts/paseobility-cua-driver.ps1)
  calls `New-Item -ItemType Directory -Force -Path $BinDir` **before** invoking
  the pinned upstream installer, and upstream `EnsureJunction` refuses an
  existing non-junction path (lines 521–525 of the pinned
  [install.ps1](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/scripts/install.ps1)).
  That wrapper pre-creation is an additional code-level conflict risk even for a
  fresh target, but a native fresh install was not reproduced here. The wrapper
  interaction remains **unresolved**; do not claim a fix, and do not recommend
  deleting a shared `bin` directory.

## Dated matrix

| Target | Status | Basis / limits |
| --- | --- | --- |
| Apple Silicon macOS 26.6.2 — single host | Preview, partial | 2026-09-21, Cua Driver 0.28.2: driver install + self-check, MCP registered/connected (56 tools, OpenCode), Accessibility + Screen Recording `true` under the driver-daemon identity, Calculator background AX input and screenshot verified. Live Paseo-session exposure, the driver's `verify_state` on that target, and a dedicated capture probe remain unconfirmed. |
| Intel macOS — 16 GiB Mac mini | User-reported functional pass | Supplied report received 2026-09-22, **not independently reproduced in this review**: `Macmini8,1` (Intel Core i7-8700B, 16 GiB), macOS 15.8 build 24H23, Paseo 0.8.0, Cua Driver 0.28.2 x86_64, Paseobility v2.8.0. Install succeeded without `--skip-cua-driver`; all 7 skills recognized, persistent MCP connected (56 tools), `doctor` 7 probes ok, Accessibility + Screen Recording `true`, Calculator `7 + 5 = 12` (AX read-back + inspected PNG), LAN-browser viewport/scroll capture passed. `verify_state` `unknown`; `fullPage` failed (2x2 repeated tiles, `#3196`). Regression 41 = cleanup 11 + share 15 + scanner 13 + shell 2, separate from the prior 48 (migration 7). No 8 GB claim from the Mac mini result alone. |
| Intel macOS — 8 GiB MacBook Pro | Reported basic flows passed; limitations remain | Supplied report received 2026-09-22, **not independently reproduced in this review**: `MacBookPro15,2` (Intel Core i5-8279U, 8 GiB), macOS 15.7.9 build 24G830, Paseobility v2.8.0. E2E ran on Paseo 0.7.2 with a **reused existing Cua Driver 0.17.0** (not the pinned 0.28.2; no auto-upgrade); 7/7 skills recognized, stdio MCP returned 54 tools, AX/Screen Recording `true`, Calculator `7 + 5 = 12` (AX read-back + inspected PNG), local-HTML/public-HTTPS browser viewport/scroll capture passed. `verify_state` matched only a false-positive label and stayed `unknown`; `fullPage` repeated the viewport three times; no automated suite is recorded. This one 8 GiB configuration worked; it is not blanket 8 GiB support. |
| Other macOS versions | Unverified | One directly verified host + OS and two user-reported Intel results only; no other macOS version was exercised. |
| Native Windows runtime | User-reported partial readiness; E2E unverified | User report received 2026-09-22, **not independently reproduced in this review**: Windows 11 Home 25H2 build 26200.9457, Intel Core Ultra 7 255H x64, 32 GB; Paseobility v2.8.0. The official installer exited non-zero at the Cua runtime stage and was recovered manually to Cua Driver 0.28.2. `doctor` readiness passed (interactive desktop, UIAutomation, window inventory 17); the only functional checks were a CLI tool listing (57 tools, not an MCP handshake) and a browser open/snapshot/close. Native app input/read-back/screenshot/`verify_state`, a persistent MCP connection, and all regression suites were not run. Not a Windows pass. |
| Linux | Unverified | No evidence. |

The Apple Silicon entry was directly exercised in this review. The Intel macOS
(Mac mini and MacBook) and Windows entries are supplied test reports with the
limits recorded above; they are not blanket platform support guarantees.

A past Windows-success entry in the compatibility report is a prior-version
record for other skills and is not evidence for the current Cua Driver runtime.

## How to validate a new target

Update a support statement only after matching, dated evidence exists for that
exact target. For each target, record:

1. OS name, OS version, and CPU architecture.
2. Paseo version and the provider/client name and version used for discovery —
   record what is observed; do not invent versions.
3. Cua Driver version (`cua-driver --version`).
4. Clean install **and** reuse: a fresh install works, and a pre-existing working
   driver is reused and not auto-upgraded.
5. Platform readiness from the installed contract/doctor on that OS — macOS:
   Accessibility + Screen Recording `true` under the driver-daemon identity
   (`cua-driver permissions status`); Windows: the daemon runs on an interactive
   user desktop, not Session 0; Linux: the daemon shares the graphical session
   and the AT-SPI session bus.
6. MCP discovery **in the actual fresh client** (`tools/list`).
7. Native GUI input plus read-back on a concrete app, and a screenshot capture.

Only then update the matrix and any public support claim. Do not infer one
target's success from another's, and do not record a CI result as a real-host
result unless it genuinely ran on that OS and architecture.

## Telemetry

The Cua Driver ships product telemetry **enabled by default** (the installer
does not change this). On the validated host, `cua-driver doctor` reported
`telemetry: enabled via default (install-id present)` and
`cua-driver telemetry status` showed the same setting with a pseudonymous
installation id.

Inspect or disable it yourself:

```bash
cua-driver telemetry status      # current setting + install-id presence
cua-driver telemetry disable     # stop sending; keeps the local install id
```

Precedence is environment override, then the persisted preference, then enabled
by default. Paseobility does not change this setting and does not disable it for
you.

Per the pinned upstream source, events are described as content-free and bounded
(fixed event names with bounded properties). That description was **not**
independently audited here and is not a privacy guarantee. The pinned source and
the driver's own commands are authoritative:

- Pinned upstream: [`trycua/cua` @ `9bbfa7dd3e27ca7f1861ede70aaca390174493f9`](https://github.com/trycua/cua/tree/9bbfa7dd3e27ca7f1861ede70aaca390174493f9),
  telemetry module
  [`crates/cua-driver/src/telemetry.rs`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/rust/crates/cua-driver/src/telemetry.rs).
- Driver docs: [cua.ai/docs/cua-driver](https://cua.ai/docs/cua-driver).

## Related

- Reproducible macOS onboarding: [`skills/paseo-cua/references/setup.md`](../skills/paseo-cua/references/setup.md).
- Browser screenshot failure and `fullPage` recovery: [`skills/paseo-browser/references/screenshots.md`](../skills/paseo-browser/references/screenshots.md).
- Prior-version skill compatibility (does **not** cover `paseo-cua`): [`compatibility-0.9.0-beta.2.md`](./compatibility-0.9.0-beta.2.md).
