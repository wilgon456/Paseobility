# Paseo bot v1

A resident development-task manager for every registered Paseo project across
MacBook, MAC_MINI, MAC_COM and VAXPORT. Source stays in this repository under
`tools/paseo-bot`; private host credentials and project state stay outside Git.
It adds no bundled skill or plugin UI and changes no existing Paseo agent.

## Architecture and contract

Grok Bot → trusted CLI intake over Tailscale SSH → SQLite inbox → resident Python
loop → destination Paseo CLI `run` → JSON file outbox → Grok Bot reads/polls.
No HTTP listener, webhook callback, Slack client or bot token is needed. File
intake avoids adding an unauthenticated network surface. SSH authentication and
the private OS account are the admission boundary: this is a trusted developer
assistant, not a sandbox for arbitrary untrusted users or repositories.

The resident runtime is a deterministic five-second ticker. Models run only for
admitted tasks, in fresh Paseo agents. A visible manager agent can use
`tools/paseo-bot/MANAGER.md` to inspect the queue and report to the user. Running
`serve` as a Paseo workspace script makes its terminal/lifecycle visible inside
Paseo without relying on an LLM to stay in an endless chat turn. The service does
not restart the Paseo daemon, install an OS login service or auto-start after a
machine reboot. See deployment below for a dedicated workspace.

Each task advances through four phases:

1. `git-sync`: read-only source inspection, query the configured remote with `git ls-remote`,
   and verify that exact default-branch commit object exists in the local clone.
   A missing object reports `blocked` with a needs-host-fetch reason. No source
   `.git` writes or stale tracking-ref fallback. Existing files stay intact.
2. Chosen profile: `paseo run --new-workspace worktree --worktree-mode branch-off`
   from that SHA, on branch `paseo-bot/<task-id>`. No shared checkout code edits.
3. `gpt-task`: a fresh independent agent in the returned workspace reviews actual
   files/diff and reruns every configured gate. Missing gate evidence fails.
4. `git-sync`: a fresh agent verifies branch, HEAD and SHA256 of tracked diff plus
   untracked file contents against the review. A later change fails the task.

`passed` requires all four receipts; `idle` alone never passes. A task result is
agent-reviewed evidence, not proof of provider sandboxing or deployed behavior.
Reviewers have their configured provider tools: the no-edit/no-deploy rules are
instructions, not an OS security boundary. Use restricted provider modes and
separate OS accounts for stronger isolation. No automatic commit, push, merge,
deployment, permission approval, credential change or worktree cleanup exists.
Deployment commands are registry metadata for later authorized work; the bot
never executes them as a deployment phase. Gates themselves must be trusted
commands appropriate for that machine and safe without production secrets.

## Requirements

- Python 3.9+, Node/Electron provided by a working Paseo installation.
- Paseo **0.13.1** internal client/CLI surface is the implementation target.
  Internal APIs are checked at runtime and fail closed on incompatible schemas.
- Existing private `paseo-multi` host registry, with exact labels, expected
  server IDs and working connections. No host connections are created/imported.
- Destination profiles named `git-sync`, `coding-hard`, `refactor-bulk`,
  `gpt-task`; their notes/configuration are read from each host, never guessed.
  Provider, model, thinking and optional mode are materialized to CLI flags.
  When profile mode is absent, the fresh provider snapshot supplies its configured
  default mode explicitly (0.13.1 CLI creation otherwise chose `auto` locally).
  Provider enabled/ready status and advertised mode IDs are validated.
  Nonempty `featureValues` are refused: current CLI has no matching feature flag.
  The bot does not silently discard them or change human profiles.
- POSIX controller permissions: state directory 0700, files 0600. Windows
  controllers need private user ACLs; POSIX permission checks do not set ACLs.
  Windows controller support is covered offline in CI; remote Windows targets
  use their own paths and profiles. Live code-task E2E is documented separately.

`paseo-multi` runtime discovery and private registry parsing are reused directly;
there are no new npm/pip runtime dependencies. Packaged Electron and npm CLI
installations use the same detection as the existing adapter.

## Project registry: all connected projects

```bash
python3 tools/paseo-bot/paseo_bot.py discover
```

This reads every configured machine concurrently, including background agents,
checks server identities, and inventories Paseo's connected project list. Offline
hosts are reported individually. Newly found projects are added **disabled**, with
unknown default branches and empty gates; existing policies are preserved.
Non-git projects remain visible but require a Git checkout before worktree tasks.
Discovery has no fixed project allowlist and supports any number of projects.

Edit `~/.config/paseo-bot/projects.json` privately. Use
`tools/paseo-bot/registry.example.json` as the schema/example, replacing placeholder
paths and confirming commands before setting `enabled: true`. Every target has:

| Field | Meaning |
|---|---|
| `machine` | Exact private-registry label/alias; MacBook is often `MAC_HOME`, VAXPORT `VAX_COM` |
| `repo` | Absolute path **on that target machine** |
| `defaultBranch` | Confirmed Git branch name, including `master` where applicable |
| `gates` | Nonempty ordered list of actual verification commands |
| `deployCommands` | Documented deploy commands, never run automatically |
| `skills` | Relevant installed skills the task agent must read |
| `enabled` | Admission policy for this target |

`machineAliases` can map friendly names such as `MacBook` and `VAXPORT` to
registered `MAC_HOME` and `VAX_COM` labels; matching still verifies server identity.
A project may have multiple targets. Selection respects an explicit task machine;
otherwise it picks the reachable eligible target with the fewest active agents,
using registry order to break ties. Every required phase profile must exist on
that same target. Host identity is checked again for every RPC. Running tasks
retain their admitted target/gates snapshot even if the registry later changes.
The base is an explicit resolved SHA; no unconditional `origin/main` assumption.

Grok submits a project ID, not an arbitrary repo path or gate command. The JSON
schema only accepts `id`, `project`, `title`, `prompt`, optional `kind` and optional
`machine`. `kind` maps `sync→git-sync`, `hard→coding-hard`,
`refactor→refactor-bulk`, `gpt→gpt-task`. If omitted, bounded keyword rules pick
refactor/architecture/sync work, otherwise gpt. Explicit kinds always win. Sync
uses the same worktree/review pipeline and does not authorize a push.

## Run and submit

From a persistent checkout of this branch/version:

```bash
python3 tools/paseo-bot/paseo_bot.py serve
# Another shell (or a trusted Tailscale SSH session):
python3 tools/paseo-bot/paseo_bot.py submit --file /absolute/path/task.json
python3 tools/paseo-bot/paseo_bot.py result grok-example-001
python3 tools/paseo-bot/paseo_bot.py list
python3 tools/paseo-bot/paseo_bot.py health
```

Use `--state /absolute/private/directory` **before** the subcommand to select a
separate queue. Do not repurpose HOME. Submission also accepts UTF-8 JSON on
stdin. Grok can stream task JSON through SSH stdin without shell interpolation:

```text
ssh <trusted-tailnet-host> python3 /absolute/Paseobility/tools/paseo-bot/paseo_bot.py submit < task.json
ssh <trusted-tailnet-host> python3 /absolute/Paseobility/tools/paseo-bot/paseo_bot.py result grok-example-001
```

In a private dedicated directory, write a `paseo.json` using the normal workspace
script schema (see `paseo script --help` and your installed Paseo documentation)
with the following script (replace the absolute paths):

```json
{"scripts":{"paseo-bot":{"type":"script","command":"python3 /absolute/Paseobility/tools/paseo-bot/paseo_bot.py --state /absolute/private/paseo-bot serve"}}}
```

Create a local workspace for that directory, launch a coordinator agent with the
MANAGER.md brief, then `paseo script start paseo-bot --workspace <workspace-id>`.
Keep the runtime checkout pinned while it is running. SIGTERM/SIGINT stops the
loop after its current bounded RPC; already dispatched agents remain in Paseo.
`health.json` carries last tick time and PID. The health CLI marks a tick older
than 120 seconds unhealthy. A heartbeat proves the ticker, not provider health.

## Results, memory and recovery

SQLite `queue.sqlite3` is authoritative. `results/<task-id>.json` is the durable
outbox Grok can consume; terminal results are regenerated if publication was
interrupted. No network delivery is claimed. Grok should poll until `state` is
`passed`, `failed`, `blocked` or `unknown`, then acknowledge consumption in its
own system. Repeated reads are harmless; there is no exactly-once messaging
claim. Active states are `queued`, `ready`, `dispatching`, `running`, `repairing`.

The version-1 result contains task/project ID, state, machine/server ID, branch,
worktree/workspace ID, per-phase profile/provider/model/agent receipts, verification
evidence, summary/reason, timestamps, `deployment: not-run` and
`delivery: file-outbox`. Raw provider output/stderr is never copied to outbox.
Only one strict `PASEO_BOT_RESULT=<JSON>` final response is accepted per turn.
A missing/invalid receipt gets at most one durable format-correction follow-up
to that same idle, owned agent; evidence is recomputed read-only. Failed gates,
wrong branches, unauthorized commits or mismatched fingerprints are never
corrected into a pass. A lost correction acknowledgement becomes unknown;
known token/credential patterns are scrubbed before persistence. Pattern
scrubbing is defense in depth, not a general detector for every possible secret.
Do not put credentials in task text, gates, registry notes or worker reports.
Private detailed provider traces remain in the destination Paseo session.

Task IDs are idempotency keys. The same ID+body returns the existing record;
a different body under that ID is rejected. A kernel file lock serializes ticks,
SQLite transactions atomically admit tasks, and synchronous writes persist the
launch attempt **before** invoking `paseo run`. The unique attempt label allows
adoption after a lost response. Exactly one matching owned agent is adopted;
zero/multiple matches become `unknown`, never an automatic second launch.
Restart resumes recorded agents and phases. Unknown receipt, identity drift,
permission wait, invalid JSON, incomplete gates or deadlines never becomes pass.
Timeout leaves agents/worktrees intact; nothing automatically kills them.

The v1 worker processes one task at a time. It does not move a partly completed
task to another machine, retry failed code automatically, or synthesize missing
profiles. After inspecting blocked/unknown agents, submit a separately scoped
follow-up with a new ID. Do not delete journal rows to force a retry.

Memory consists of private project policy plus the task/evidence journal. Fresh
agents receive only the last three passed summaries **for the same project**,
with task IDs/timestamps. Historical model text is untrusted and cannot override
policy. No native Codex/Hermes memory or personal skill directory is edited.

## Reference study and provenance

Base: the user's `~/paseo-specs/paseo-dispatch-SKILL.md` (2026-10-26). Its
host-local profiles, explicit endpoint resolution, worktrees, identity tuple,
completion/review distinction and Git reporting rules are implemented here.

Studied read-only before finalizing:

- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent/tree/9b904dcc22c23fe8b82834339bbdd96495072e59),
  especially `cron/scheduler.py`, `gateway/session.py`, `agent/memory_manager.py`
  and `tools/skills_tool.py`: adopted a deterministic resident ticker, locked
  admission/recovery ledger, fresh task sessions, isolated memory context and
  explicit final-result delivery. Implemented as a small stdlib runtime rather
  than importing Hermes or its messaging stack.
- [vaxport123/vax-wiki-gateway](https://github.com/vaxport123/vax-wiki-gateway/tree/6d3c8f0529a127994ad6e69d216a45403b668790),
  `systemd/hermes-gateway.service`, `docs/two-bots-setup.md`,
  `docs/hermes-work-skills.md`, `docs/hermes-mcp-hardening.md`,
  `docs/hermes-skill-discovery-source-2026-10-25.md`, `hermes/skill_sync.py`,
  `ops/hermes_health.py`, `ops/hermes_deployment_contract.py`, `hermes/SOUL.md`:
  adopted separation of service lifetime from model turns, project-scoped skills,
  configured capability boundaries, private state, explicit health and evidence
  layers. Installed skill inventory is not claimed as proof that a model used
  it. No config, Slack connector, token, private business fact, prose or runtime
  patch was copied. Its repo state is not proof of its deployed server state.

## Validation

```bash
python3 -m unittest discover -s tests -p test_paseo_bot.py -v
node --test tools/paseo-bot/bridge.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

Tests cover routing across four target identities, profile materialization,
worktree/phase receipts, duplicate intake, unknown launch recovery, independent
gate/fingerprint failures, scoped memory, secret redaction and private state.
Live fleet discovery and a disposable local coding smoke are separate evidence;
they do not certify every project's gates, deployment, or remote coding providers.

### 2026-10-26 local evidence

- Shared Python suite: 115 tests, one existing skip; bot contracts: 25 tests.
- Node bridge: 7 passing contracts. Catalog validation and diff whitespace checks passed.
- Live read-only inventory/profile discovery: all four registered 0.13.1 daemons;
  23 projects. This is fleet discovery evidence, not fleet-wide code execution.
- Disposable MacBook task `smoke-v5` reached `passed` through four real agents
  (`git-sync`, `gpt-task`, `gpt-task`, `git-sync`) in a Paseo-managed worktree.
  Independent gate `python3 verify.py` passed; only `answer.txt` changed 41→42.
  Controller rechecked the actual gate, HEAD, unchanged source/test and matching
  reviewed/final SHA256. Earlier blocked development receipts remain retained.
- Real Grok Bot transport wiring, every project's gates, and remote coding E2E
  remain separate rollout work; see the private report/checklist.

## Windows PowerShell and owner handoff

`tools/paseo-bot/paseo-bot.ps1` is a PowerShell 5.1/7 entrypoint. It accepts a
UTF-8 JSON file (with or without BOM), or pipeline JSON, and emits UTF-8 JSON.
It uses the local Python launcher without a shell-built command string. Examples
for a private Windows runtime pinned to the PR commit:

```powershell
$Bot = Join-Path $env:USERPROFILE '.local\share\paseo-bot\runtime\tools\paseo-bot\paseo-bot.ps1'
& $Bot submit -File 'C:\path\task.json'
Get-Content -Raw -Encoding UTF8 'C:\path\task.json' | & $Bot submit
& $Bot status
& $Bot status 'task-id'
& $Bot result 'task-id'
```

Use `-State` for a nondefault queue and `-Python` for a specific interpreter.
`status` reports heartbeat, ownership mode, queue counts and task states; a task
ID gives a compact task status. `result` returns the full receipt. The wrapper
restores PowerShell encoding settings and propagates the Python exit code.

Migrated queues use a private `owner.json` bound to the controller's OS hostname:

- `active`: this host can admit tasks and dispatch.
- `standby`: heartbeat/readiness works; intake and dispatch are disabled.
- `retired`: intake and dispatch remain disabled, including accidental restarts.
- A copy bound to another hostname cannot dispatch until explicitly rebound to
  standby. Retired queues cannot jump straight back to active.

Manage the fence with the Python entrypoint (not with hand-edited task records):

```powershell
python -X utf8 .\tools\paseo-bot\paseo_bot.py owner --mode standby --label VAX_COM --rebind
python -X utf8 .\tools\paseo-bot\paseo_bot.py owner --mode active --label VAX_COM
```

Use `--state PATH` before `owner` when necessary. Existing unfenced v1 queues
remain compatible as `legacy`; install a fence before migration. Owner changes
serialize with both runner and intake locks. Intake holds its separate lock for
the full transaction, so retirement cannot race an already admitted request.
Windows paths in remote receipts compare using Windows case/separator rules;
Mac paths remain case-sensitive and are never resolved on the controller.

For a single-owner handoff, prepare the destination with a pinned clean runtime,
private user ACLs, its existing host registry and a standby fence. Verify a fresh
standby heartbeat and all destination-to-fleet connections before stopping the
source. Retire and stop the source, then use SQLite's backup API for the final
queue snapshot under the runner/intake locks. Copy project policy and result
records, preserving historical remote paths and all task IDs/events. Archive
source-only workspace/agent receipts instead of making them live destination
identities. Do not overwrite a running destination SQLite database: stop its
standby script for final import, restore/verify the snapshot, restart in standby,
and activate only after the source retirement is confirmed. Keep the old source
fenced and its backup intact; never run both copies active.

A healthy standby only proves readiness. It does not claim active dispatch or
satisfy an end-to-end smoke. Verify a complete task from the new controller after
activation, including actual worktree files, gates, independent review and final
result retrieval through PowerShell.

For Tailscale-only fleet routing, put explicit verified SSH-over-Tailscale
endpoints into the destination's existing private `paseo-multi` registry. Endpoint
selection precedes saved relay connections; a failed tunnel does not silently
fall back to relay. Verify SSH host keys through an already authenticated control
path, preserve existing registry/known-host backups, and use strict host-key
checking. Do not print connection material, change private keys or restart
working daemons just to move the controller.

Native process stdin is UTF-8 as well as PowerShell pipeline input. The wrapper
restores both console input/output encodings. Keep source repositories outside
the private queue directory on Windows: the native coding sandbox needs to
traverse project directories, while queue credentials/policy retain private ACLs.
