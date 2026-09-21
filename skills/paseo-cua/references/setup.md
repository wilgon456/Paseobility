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
- Windows: the daemon must run on an interactive user desktop, not Session 0.
- Linux: the daemon must share the graphical session and the AT-SPI session bus.

## Optional persistent connection

`cua-driver mcp-config --client opencode` only prints a config snippet; it does
not register anything. For a persistent multi-call connection, merge the printed
`mcp` entry into the client config while preserving existing entries, then start
a new session. One-off calls do not need it.

## Source

Pinned upstream: [`trycua/cua`](https://github.com/trycua/cua) @
[`9bbfa7dd3e27ca7f1861ede70aaca390174493f9`](https://github.com/trycua/cua/tree/9bbfa7dd3e27ca7f1861ede70aaca390174493f9),
skill [`libs/cua-driver/rust/Skills/cua-driver/`](https://github.com/trycua/cua/tree/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/rust/Skills/cua-driver),
Cua Driver version 0.28.2. Reviewed implementation:
[`src/cli.rs`](https://github.com/trycua/cua/blob/9bbfa7dd3e27ca7f1861ede70aaca390174493f9/libs/cua-driver/rust/crates/cua-driver/src/cli.rs)
(`run_mcp_config` prints a snippet; it writes no config).
Upstream source files are MIT licensed (Copyright (c) 2025 Cua AI, Inc.).
Docs: [cua.ai/docs/cua-driver](https://cua.ai/docs/cua-driver)
