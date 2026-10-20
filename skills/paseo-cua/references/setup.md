# Cua Driver setup

Load when the driver is missing or the host is not ready.

## Check the host

- `cua-driver --version` — binary installed.
- `cua-driver doctor` — platform and entry-point readiness.
- `cua-driver permissions status` — OS permissions already granted.

If the binary is missing, rerun the Paseobility installer with `paseo-cua`
selected (it ensures the driver) or use the official installer below. Run it
when the user asks for setup or agrees; one yes is enough.

## Install

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

Prefer the release channel over source builds. Reviewed behavior comes from the
pinned source at the commit below, not from a moving endpoint.

## Permissions

- macOS: Accessibility and Screen Recording are required and are granted by
  the human. `cua-driver permissions grant` opens the driver's own identity in
  Settings (not the terminal's); ask the user to approve. `unknown` is not
  `false` — re-check after the driver app is running; do not assert a cause.
- Windows: the daemon must run on an interactive user desktop, not Session 0.
- Linux: the daemon must share the graphical session and the AT-SPI session bus.

## Reproducible macOS onboarding

The Paseobility installer only prepares the pinned binary. It does not start the
daemon and does not grant permissions. On a Mac:

1. Record the installed version: `cua-driver --version`. The Paseobility
   installer now pins `0.34.1` (verified upstream stable release as of 2026-10-13) for a fresh
   install, but a working existing driver is reused as-is — do not downgrade or
   replace it just to match the pin. The pin is a source/schema-reviewed
   contract; `0.28.2` remains the last version exercised end-to-end in the
   [platform validation record](https://github.com/wilgon456/Paseobility/blob/main/docs/cua-platform-validation.md).
2. Start the driver app so it runs under its own app identity, not the terminal:
   `open -n -g -a CuaDriver --args serve`
3. The human grants permissions (cannot be scripted):
   `cua-driver permissions grant`, then `cua-driver permissions status`. `true`
   confirms the OS grants only; the first real action confirms the driver works.
4. For a persistent connection, merge the MCP snippet (see below).
5. Start a new agent session, or reload integrations, so the client re-reads its
   config.

Notes:

- Restart the driver (`cua-driver stop`, then
  `open -n -g -a CuaDriver --args serve`) only when no other session is using
  it. **Never restart Paseo to apply this.**
- Existing Paseo sessions may keep the provider they already loaded; a new
  session or integration reload may be needed. Check the tools appear in the
  fresh client.

## Optional persistent connection

`cua-driver mcp-config --client <client>` only prints a snippet; it registers
nothing. Keys are client-specific — OpenCode nests under `mcp`, Codex uses
`mcp_servers`, Claude uses `mcpServers` — so use what the command prints for
your client. When a multi-call flow needs it, merge the entry into the real
client config (keep existing entries), start a new session, and check with the
client's own list/status command. One-off calls do not need it.

## Telemetry

The driver reports content-free product telemetry **enabled by default**; the
installer does not change this. Inspect it, or disable it when the user asks:

```bash
cua-driver telemetry status      # current setting + install-id presence
cua-driver telemetry disable     # stop sending; keeps the local install id
```

Precedence is environment override, then persisted preference, then enabled by
default. Collection details were not independently audited here; the pinned
source is authoritative.

## Source

Pinned upstream: [`trycua/cua`](https://github.com/trycua/cua) @
[`0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc`](https://github.com/trycua/cua/tree/0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc)
(the `cua-driver-rs-v0.34.1` release tag),
skill [`libs/cua-driver/rust/Skills/cua-driver/`](https://github.com/trycua/cua/tree/0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc/libs/cua-driver/rust/Skills/cua-driver),
Cua Driver version 0.34.1. The pinned installers resolve/download a release and
stop stale daemons; they never start one. Reviewed implementation:
[`src/cli.rs`](https://github.com/trycua/cua/blob/0c69d9a2c8abbb5051a2df4a23f0fa166d5385dc/libs/cua-driver/rust/crates/cua-driver/src/cli.rs)
(`run_mcp_config` prints a snippet; it writes no config).
Upstream source files are MIT licensed (Copyright (c) 2025 Cua AI, Inc.).
Docs: [cua.ai/docs/cua-driver](https://cua.ai/docs/cua-driver)
