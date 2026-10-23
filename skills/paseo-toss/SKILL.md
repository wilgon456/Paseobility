---
name: paseo-toss
description: Build Apps in Toss mini-apps using Toss's Apps-in-Toss Harness workflows, from planning and scaffolding to browser debugging, phone testing and pre-launch review. Use for 앱인토스 or 토스 미니앱 development and /paseo-toss requests.
---

# Paseo Toss

Use the official Toss Harness through one Paseo-compatible skill. Read only the
workflow needed for the user's current task. This bundle contains the official
agent-plugin 0.2.6 resources at commit
`255b636812d8b3a9b048d0a700644b9cbd8532c4`, under its BSD-3-Clause license.

## Choose the workflow

Resolve this skill's own directory as `<skill-dir>`. The table paths are relative
to `upstream/shared/skills/`. Read the selected `WORKFLOW.md` and its referenced
files, keeping their sibling paths intact.

| Request or `/paseo-toss` mode | Workflow |
| --- | --- |
| No mode, environment check, getting started | [welcome](upstream/shared/skills/welcome/WORKFLOW.md) |
| `plan`, idea, PRD, SDK permissions and terms | [plan](upstream/shared/skills/plan/WORKFLOW.md) |
| `new`, `new-miniapp`, scaffold a project | [new-miniapp](upstream/shared/skills/new-miniapp/WORKFLOW.md) |
| `design`, screen or registration assets | [design](upstream/shared/skills/design/WORKFLOW.md) |
| `ux-writing`, Korean app copy | [ux-writing](upstream/shared/skills/ux-writing/WORKFLOW.md) |
| `inject`, `inject-devtools`, `inject-debug-console`, `inject-tossface` | [inject](upstream/shared/skills/inject/WORKFLOW.md), select that facet |
| `server`, user identity, mTLS, backend | [server](upstream/shared/skills/server/WORKFLOW.md) |
| `debug`, browser or phone-only problem | [debug](upstream/shared/skills/debug/WORKFLOW.md) |
| `setup-debugger`, opt-in device debugger | [setup-debugger](upstream/shared/skills/setup-debugger/WORKFLOW.md) |
| `test-on-device`, open the bundle in Toss | [test-on-device](upstream/shared/skills/test-on-device/WORKFLOW.md) |
| `launch`, pre-review checks or rejection | [launch](upstream/shared/skills/launch/WORKFLOW.md) |

Natural-language requests select the same workflow. An ordinary documentation
lookup uses official documentation directly; it need not run a project workflow.

## Adapt the original instructions

Read [runtime.md](references/runtime.md) when checking integrations, starting a
project, using a shell helper or configuring device debugging.

- Original `/ait:<mode>` references mean `/paseo-toss <mode>` here. `new` maps to
  `new-miniapp`; the three `inject-*` commands select facets of `inject`.
  `$ARGUMENTS` means the user's actual mode arguments, never a literal variable.
- A workflow's “base directory” is its containing directory, not this skill's
  root. `<plugin-root>` is `<skill-dir>/upstream`. Original `SKILL.md` references
  resolve to `WORKFLOW.md`. These names prevent registering eleven extra skills.
- Use the current agent's tools for reading files, durable shell processes,
  browsing and MCP discovery. Do not assume Claude's `Read`, `Bash`, `/mcp`,
  `run_in_background` or plugin environment variables exist. Skip Claude-only
  plugin-state inspection outside Claude; never read credential stores.
- Require actual discovered tools before an MCP call. Read their current schemas;
  do not invent callable tool names or infer authentication from configuration.
  For changing SDK APIs and review rules, consult current official Toss docs.
- Keep project design rules. For interface work also apply `paseo-design` when
  installed, using Toss platform constraints and preserving an existing design
  system. The upstream guide injection helper is fail-soft: inspect its summary
  for `FAIL` and unresolved assets rather than trusting exit code zero.

## Scope and evidence

Installation copies workflow documents, templates and helpers. It does not
install npm dependencies, register MCP servers, log into Toss, start a debugger,
create a console app, upload a bundle or submit a review.

Follow the user's requested stage. Phone testing may require an authorized
console upload; show the real tool-returned link and distinguish compile success
from a user's confirmed phone run. Before review submission, prepare the complete
request for approval as the launch workflow requires. Launching, rollback and
unrequested deployment are separate actions. Keep OAuth tokens, private keys and
certificates out of source, logs and cross-computer transfers.

Readiness reporting separates: skill installed, Node/npm ready, docs MCP callable,
console OAuth authorized, optional debugger supported/attached, and actual phone
or review evidence. Do not call these layers complete based on file presence.

For a read-only bundle integrity check:

```text
python3 <skill-dir>/scripts/verify.py
```

Windows uses `python` or `py -3`. Source provenance and per-file checksums are in
`upstream/SOURCE.json`; its `source` fields retain the original upstream paths.
