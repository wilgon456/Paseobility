# Cua Driver setup

Load this only when `paseo-cua` work is requested and the host is not ready.
The skill itself installs nothing; without the driver, report the prerequisite
and stop.

## Check the host

- `cua-driver --version` — confirm the binary is installed.
- `cua-driver doctor` — platform and entry-point readiness.
- `cua-driver permissions status` — report already-granted OS permissions.

If the binary is missing, report the prerequisite and a recovery instruction:
reinstall through the Paseobility installer (it auto-ensures the driver when
`paseo-cua` is selected) or install the driver manually. A later, explicit
install/setup request authorizes a normal reviewed installation; do not repeat
approval prompts once that request exists.

## Install (user-authorized)

These official entry points resolve the current release at run time, so they are
rolling examples rather than pinned artifacts:

- macOS / Linux:
  `/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"`
- Windows PowerShell:
  `irm https://cua.ai/driver/install.ps1 | iex`

The Paseobility package installer already auto-ensures this pinned driver when
`paseo-cua` (or the full package) is selected, at its normal host location. It
is skipped by default for a custom skills `--target-home` / `-TargetHome`;
`--allow-host-runtime` / `-AllowHostRuntime` allows the real host install anyway
(macOS still writes `/Applications/CuaDriver.app` and `~/.cua-driver`), and
`--skip-cua-driver` / `-SkipCuaDriver` copies skills only.

A future, explicit install request authorizes a normal reviewed installation.
Prefer the release channel over source builds. Reviewed behavior comes from the
pinned source at the commit below, not from a moving endpoint.

## Permissions

- macOS: Accessibility and Screen Recording are required and are granted by
  the human. `cua-driver permissions grant` opens the correct identity so the
  Settings entries match the driver, not the terminal. `permissions status`
  is read-only; if Accessibility is `false`, stop and ask the user to grant it.
  `unknown` is not `false`: it means the driver could not confirm its own
  identity/readiness, not that the grant was denied. Re-check after the driver
  app is running; do not assert a specific cause.
- Windows: the daemon must run on an interactive user desktop, not Session 0.
- Linux: the daemon must share the graphical session and the AT-SPI session bus.

## Reproducible macOS onboarding

The Paseobility installer only prepares the pinned binary. It does not start the
daemon and does not grant permissions. On a Mac:

1. Record the installed version: `cua-driver --version`. The Paseobility
   installer defaults to the pinned `0.28.2`, but a working existing driver is
   reused as-is — do not downgrade or replace it just to match the pin.
2. Start the driver app so it runs under its own app identity, not the terminal:
   `open -n -g -a CuaDriver --args serve`
3. Grant permissions as the human (cannot be scripted):
   `cua-driver permissions grant`, then confirm with
   `cua-driver permissions status`. `true` under the `driver-daemon` identity
   confirms the OS grants **only**; it is not proof the driver can act. Verify
   the real target with a snapshot and one action before treating it as ready.
4. Register MCP only if you want a persistent connection (see below). The
   printed snippet is guidance; merge it into your actual client config.
5. Start a new agent session, or reload integrations, so the client re-reads its
   config.

Notes:

- Stop or reopen this driver only when it is safe: no live sessions from this
  driver's own tasks and no unrelated use. Prefer `cua-driver stop`, then
  `open -n -g -a CuaDriver --args serve`. **Never restart Paseo to apply this.**
- Existing Paseo sessions may keep the provider they already loaded. A new
  session or an integration reload **may be needed** to pick up the change, but a
  refreshed long-lived provider is not guaranteed — this path was not tested.
  Confirm the tools appear in the actual fresh client instead of assuming it.

## Optional persistent connection

`cua-driver mcp-config --client <client>` only prints a config snippet; it does
**not** register anything. This skill does not auto-register MCP either. The
snippet's key is client-specific — the OpenCode form nests under an `mcp` key,
while Codex uses `mcp_servers` and Claude uses `mcpServers`. Use the schema the
command actually prints for the client you run; do not paste one client's key
into another. For a persistent multi-call connection, merge that entry into the
real client config while preserving existing entries, then start a new session.
One-off calls do not need it. Verify with the client's own list or status command
rather than assuming the edit took effect.

## Telemetry

The driver reports content-free product telemetry **enabled by default**; the
installer does not change this. Inspect or disable it yourself — this skill
never changes the setting:

```bash
cua-driver telemetry status      # current setting + install-id presence
cua-driver telemetry disable     # stop sending; keeps the local install id
```

Precedence is environment override, then persisted preference, then enabled by
default. Collection details were not independently audited here; the pinned
source is authoritative.

## Source

Pinned upstream: [`trycua/cua`](https://github.com/trycua/cua) @
[`9bbfa7dd3e27ca7f1861ede70aaca390174493f9`](https://github.com/trycua/cua/tree/9bbfa7dd3e27ca7f1861ede70aaca390174493f9),
skill [`libs/cua-driver/rust/Skills/cua-driver/`](https://github.com/trycua/cua/tree/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/rust/Skills/cua-driver),
Cua Driver version 0.28.2. Reviewed implementation:
[`src/cli.rs`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/rust/crates/cua-driver/src/cli.rs)
(`run_mcp_config` prints a snippet; it writes no config).
Upstream source files are MIT licensed (Copyright (c) 2025 Cua AI, Inc.).
Docs: [cua.ai/docs/cua-driver](https://cua.ai/docs/cua-driver)
