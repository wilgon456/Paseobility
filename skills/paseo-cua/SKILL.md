---
name: paseo-cua
description: >-
  Drive a native desktop GUI application with the installed trycua Cua Driver
  (`cua-driver` CLI or MCP). Use only when the user explicitly asks to operate,
  automate, or inspect a native app window through Cua Driver. Do not use for
  ordinary web page tasks (use paseo-browser) or for general coding and shell
  work.
---

# Paseo Cua Driver

Scope is trycua Cua Driver only: native app and window control on macOS,
Windows, and Linux. Ordinary web page tasks belong to `paseo-browser`;
filesystem, code, and shell outcomes do not need this skill.

## Preconditions

Check before acting:

- `cua-driver --version` — binary present. If missing, report the prerequisite
  and stop; this skill installs nothing.
- `cua-driver doctor` and `cua-driver permissions status` — platform and
  permission readiness. On macOS, Accessibility and Screen Recording are
  granted by the human; never fake or bypass them.

See `references/setup.md` when the driver is absent or the host is not ready.
See `references/recovery.md` when a flow fails, permissions look unready, or
`verify_state` returns `unknown` (which is not a pass).

## Discover the contract first

The installed binary is authoritative. Do not assume a fixed schema:

- `cua-driver list-tools`, `cua-driver describe <tool>` — exact tool names and
  arguments for this version.
- `cua-driver --help` — management subcommands.
- `cua-driver mcp-config --client opencode` — prints an MCP config snippet to
  merge into the client config yourself. It does not register the server, so a
  persistent connection is not available until you add that entry.

## Core loop: inspect -> snapshot -> act -> verify

1. Resolve the exact target window (`list_windows`) or launch it (`launch_app`).
2. `get_window_state` for a fresh accessibility tree plus screenshot. Act on
   the opaque `element_token`, or `snapshot_id` with `element_index`.
3. Perform one snapshot-bound action (`click`, `type_text`, `press_key`,
   `set_value`, `invoke_menu`, `set_window_frame`, `scroll`).
4. Re-read state and confirm the postcondition (`verify_state`). A tool reply
   or exit status alone is not proof.
5. Escalate to `delivery_mode: "foreground"` only after a verified background
   no-op and only within the user's authorization. Background is the default.

A single action is `cua-driver <tool> '<json>'`. Workflows that share cursor,
recording, browser, or named-session state need one persistent `cua-driver mcp`
connection, which requires merging the printed config first; repeating a session
label does not adopt a prior process.

For browser-window content, bind the native window first, then use the typed
browser tools from the installed contract. See `references/workflow.md` for the
condensed loop and escalation ladder.

Never invent tool names or coordinates. Follow the driver's own refusal and
verification signals. Never log secrets; report redacted metadata only.
