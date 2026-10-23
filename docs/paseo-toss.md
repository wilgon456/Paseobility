# Paseo Toss

`paseo-toss` provides one discoverable skill for Apps in Toss mini-app work. It
adapts the eleven official Harness workflows: welcome, plan, new-miniapp, design,
ux-writing, inject, server, debug, setup-debugger, test-on-device and launch.

Source: [toss/apps-in-toss-harness](https://github.com/toss/apps-in-toss-harness),
agent-plugin 0.2.6 at `255b636812d8b3a9b048d0a700644b9cbd8532c4`.
The BSD-3-Clause license, source paths and SHA-256 checksums ship with the skill.
Upstream entrypoints are renamed `WORKFLOW.md` so they remain references rather
than creating eleven additional globally discoverable skills. Their bytes and
relative resource layout are otherwise preserved.

## Install

macOS/Linux:

```bash
./scripts/paseobility-init.sh --skill paseo-toss --no-context
```

Windows PowerShell:

```powershell
.\scripts\paseobility-install.ps1 -Skill paseo-toss
```

These install only this skill into `~/.agents/skills`, backing up an existing
same-name installation. Add `--with-claude` / `-WithClaude` when Claude's separate
skill directory is requested. Start a fresh agent session or reload integrations;
the daemon does not need a restart for skill discovery.

Example prompts:

```text
/paseo-toss 기획부터 토스 미니앱을 만들어줘
/paseo-toss debug 브라우저에서 로그인 버튼이 동작하지 않아
/paseo-toss launch 검수 전에 현재 프로젝트를 점검해줘
```

## Runtime boundaries

The official workflow requires Node 24+ for development. Installation itself does
not install npm dependencies, configure MCP, authorize Toss OAuth, open tunnels,
upload an app or submit a review. The bundled runtime reference documents the
official docs and console MCP endpoints and provider-specific setup.

Console operations need OAuth on that computer/provider. The upstream on-device
CDP attach procedure has a Claude Code-specific adapter; standard phone bundle
testing and browser mock debugging are separate paths. The wrapper makes this
boundary explicit rather than assuming Claude MCP settings work in Codex/Paseo.

## Validation on 2026-10-22

- Catalog and frontmatter validation, four bundle integrity regression tests,
  and seven existing installer/migration tests passed locally.
- A temporary-home single-skill install matched every source file.
- The installed bundle on MAC_HOME, MAC_COM, MAC_MINI and VAX_COM matched the
  same 72-file tree digest:
  `74be4ca5be3bc0b7aed7b33e62af7c9a1af6ff75eea047371b0e4557711f8b6d`.
- All 67 vendored resources matched the pinned upstream bytes. Only one
  `SKILL.md` is present inside the bundle, and all entrypoint workflow links
  resolve locally.
- This proves packaging and installation. No Toss account OAuth, real mini-app
  scaffold, bundle upload, phone run or review submission was performed by this
  installation validation.
