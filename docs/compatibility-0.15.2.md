# Paseo 0.15.2 compatibility and Ego browser diagnosis

Checked 2026-11-06 on macOS arm64. This checkout fixes a confirmed plugin
compatibility rejection and tightens browser recovery instructions. These are
separate issues: the browser trace does not establish a Paseo browser-routing
bug, and plugin compatibility does not enforce an agent's browser choice.

## Findings

### Confirmed plugin rejection

The [latest stable release](https://github.com/getpaseo/paseo/releases/tag/v0.15.2)
and npm `@getpaseo/cli` latest tag were both **0.15.2**. The shipped v2.12.11
manifest required `>=0.12.0 <0.14.0`. A clean 0.15.2 daemon rejected its install:

```text
Plugin "paseobility" requires Paseo >=0.12.0 <0.14.0. Your daemon is 0.15.2.
```

Paseo checks requirements separately on the daemon and connected app. Thus an
older compatible daemon can report `running` while a newer app rejects the
client contribution. This is the documented
[plugin requirements contract](https://paseo.sh/docs/plugins/reference.md#requirements),
and the regression test now uses Paseo's real guard for both runtimes.

The two affected Macs had desktop-managed 0.13.2 daemons and running
Paseobility v2.12.11 plugins. The controller app was 0.15.1. Those remote
plugins' 19 runtime source files matched this repository's pre-fix source.
The latest-version rejection is confirmed independently of the Chrome case;
no real client screenshot was used to claim a missing picker on those hosts.

### Confirmed browser switch after an Ego failure

A bounded inspection of recent local provider transcripts located this sequence
on one affected Mac at 2026-11-06 12:03–12:04 UTC (21:03–21:04 KST):

1. The agent was already using Ego, so missing installation was not the trigger.
2. Ego operations reported a lost context, a missing input selector, then a
   `Page.captureScreenshot` timeout.
3. The agent attributed the failure to an extension, without establishing that
   cause in the inspected evidence.
4. It announced a switch, called `finish()` on the failed task, and wrote a
   custom headless Chrome/raw-CDP script for the page interaction.

The previously documented Chrome fallback for absent Ego was **not** the
observed trigger. The weak boundary was recovery versus isolated verification:
announcing a change or calling a task “QA” must not authorize a different
browser. The prescribed `design-check` run must not be generalized into
permission to replace interactive Ego work with a custom Chrome runner.

Provider traces also contained successful Ego operations on both hosts. The
bounded search is not a complete audit of all sessions. Raw transcripts,
project contents, account details, and host connection material are not stored
in this repository.

### Invocation path

`plugin/index.server.ts` exposes status, update and skill-search RPC handlers.
`plugin/client/web.ts` adds a slash reference to the draft; the attachment
source returns an instruction to read the installed skill. The plugin does not
choose a browser executable, install an agent-wide browser hook, or intercept
all browser calls. Skill discovery, explicit invocation, and agent adherence
are different layers. A loaded older session can retain its earlier rules.

## Fixes in this checkout

- Plugin range: `>=0.12.0 <0.16.0`; SDK/protocol test dependencies: `0.15.2`.
  The upper bound remains explicit rather than claiming future compatibility.
- Browser instructions: Ego is the default; a timeout, selector failure, lost
  context or suspected extension interference requires recovery/handoff. An
  announced switch does not authorize Chrome or a custom headless/CDP runner.
  The `design-check` exception is limited to that prescribed check.
- `scripts/check-plugin-runtime.mjs` compiles the actual client/server entries
  using an installed published Paseo compiler, evaluates the client entry with
  that release's SDK, and checks surface registration and cleanup. The 0.13
  compiler's entry API and 0.14+ directory API are both supported.
- CI runs this check on 0.13.2, 0.14.0 and 0.15.2. The CLI surface snapshot now
  records 0.15.2: the same 145 command paths, with three added terminal flags.

The runtime checker stubs rendering primitives. It tests registration and
contracts, **not** rendered UI. Its optional daemon-home argument also checks
live RPCs and the actual agent-list/subscription API without creating an agent.

## Validation

| Layer | Result |
| --- | --- |
| Existing manifest on a fresh 0.15.2 daemon | Rejected as expected |
| Patched manifest install and live plugin status | `running` |
| Published compiler + SDK, 0.13.2 / 0.14.0 / 0.15.2 | Both entries compile; screen, sidebar, attachment source, Command Center and composer pill register; cleanup passes |
| Mixed 0.13.2 compiler / 0.15.2 controller SDK | App requirement check, contributions and cleanup pass |
| Latest SDK TypeScript check | Pass |
| Live 0.15.2 `skills.status` / `skills.search` | 12 skills; Ego CLI detected on test machine; browser skill returned |
| Live 0.15.2 agent subscription/list API | Pass |
| Live 0.15.2 cleanup snapshot | Complete, background workspaces covered |
| Live 0.15.2 multi status / workspace terminal | Identity/version matched; command exit 0; receipt saved; owned terminal closed |
| Plugin regression suite | 27 passed |
| Shared Python suite | 259 total, 12 platform skips, no failures |
| Multi adapter suite | 58 total, 1 platform skip, no failures |
| Cleanup snapshot suite | 14 passed |
| Current composer source | `message-input-root` and React Native web text input remain; source inspection only |

The live 0.15.2 daemon used a separate temporary `--home` and loopback port,
with relay disabled. Production daemons were not upgraded or restarted.
The two affected installations received backed-up manifest and browser-document
hotfixes, followed by plugin-only reload and status verification. Those fixes
are included in v2.12.12; reinstalling unpatched v2.12.11 can overwrite them.

## Reproduce the host-contract check

```bash
npm ci --prefix plugin
npm install --prefix /tmp/paseo-runtime --no-audit --no-fund \
  @getpaseo/cli@0.15.2 @getpaseo/plugin@0.15.2
node scripts/check-plugin-runtime.mjs /tmp/paseo-runtime
# Optional: an already running isolated daemon with this plugin installed:
node scripts/check-plugin-runtime.mjs /tmp/paseo-runtime /path/to/test-daemon-home
# Mixed versions: use a second npm prefix for the controller SDK.
PASEO_PLUGIN_CLIENT_RUNTIME=/path/to/newer-runtime \
  node scripts/check-plugin-runtime.mjs /path/to/older-runtime
```

## Remaining limits

No real desktop/mobile picker click-through on 0.15.2, Windows/Linux GUI,
provider-by-provider automatic browser-selection evaluation, or fresh agent
browser round trip was performed. The legacy private textarea adapter remains
a compatibility risk. The checks do not certify every bundled skill on 0.15.2.
The browser policy is an agent instruction, not a technical block on Chrome.
