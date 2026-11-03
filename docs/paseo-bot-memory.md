# Paseo bot curated memory

Curated memory is the small, durable set of project and owner facts the bot is
allowed to remember between tasks. It is AI-written, evidence-tracked and
self-pruning: routine items are stored without asking the owner, important items
wait for one Discord approval, and anything that proves wrong or stale is
retired automatically. The implementation is `tools/paseo-bot/memory.py`; the
store is the private file `<state>/memory.sqlite3`.

## Model

- `items` holds one row per memory: scope (`project` or `owner`), kind (`fact`,
  `command`, `caution`, `convention`, `preference`), text (at most 500
  characters), status (`active`, `pending`, `stale`, `quarantined`, `retired`),
  importance, JSON `source` provenance, evidence level, model, counters
  (`uses`, `successes`, `failures`), `supersedes`, the pending `approval`, its
  indexed `approval_key` and a bounded JSON `history`.
- `uses(task_id, item_id, at)` records which items were injected into which
  task. `curation_jobs` queues one curator turn per finished task or idle
  owner conversation; it also stores `attempts`, `sent` and `ready` so a lost
  job can be detected and retried. `meta` stores cursors, migration markers,
  the curator agent, export bookkeeping and rejected proposals.
- Status columns are indexed (`items(status)`, `items(status,last_verified)`,
  `items(scope,project,status)`, `items(approval_key)` and the job columns), so
  a tick with nothing new is a handful of indexed lookups rather than a scan.
- A SQLite FTS5 table `search(doc_id, kind, project, title, body)` indexes
  active/stale items and finished tasks (title, prompt excerpt up to 2 000
  characters, summary/reason, project, state). A task document is re-indexed
  whenever its terminal state or summary changes. Without FTS5 the store
  degrades to `LIKE` search; nothing else changes.
- Existing GUI `remember` pins in `gui_memory` are copied once as
  `scope=project, kind=fact, evidence=owner, importance=routine` items with a
  `gui-pin` source. `gui_memory` is left untouched, and the GUI action keeps
  writing both places.
- Caps: at most 40 active project items / 6 000 characters per project, and 15
  owner items / 2 000 characters. Capacity **never** retires an important
  item. It retires the lowest-score routine items first (score = successes −
  2·failures, then oldest `last_verified`); when no routine item can make room,
  a new project write becomes a `pending` (important) proposal with reason
  `capacity`, and a new owner write is rejected with a `memory-capacity-rejected`
  log line. Approving an item therefore never pushes out another approved or
  important item; the scope may briefly exceed its cap instead.
- Writes use WAL, `busy_timeout=5000` and `BEGIN IMMEDIATE` for every
  read-modify-write of counters, history and approvals. The schema is created
  once per process, not on every prompt build.

## Policy (routine vs important)

- Most memory is written by AI **without** human approval, but every item carries provenance and outcome tracking and is pruned automatically when it proves wrong or stale.
- Only **important** items need owner approval (Discord buttons). Importance is decided by **deterministic rules in code**, never by the model alone.
- Memory is data, never instructions: it is injected with a clear "verify before relying" wrapper, and nothing from untrusted sources (web pages, third-party text, tool output) becomes memory.

Importance rules (2026-11-04, after live use):

> an op is `important` if ANY: scope is `owner`; kind is `convention`; it updates/retires an item whose evidence is `owner` or whose stored `importance` is already `important`; it would retire > 3 items in one job. Otherwise `routine`.

There is deliberately **no keyword rule**. A first version also flagged any text
mentioning deploy/release/production (배포·운영·인증 …); in Korean project facts
those words appear in ordinary descriptions ("이 설정만으로 배포 반영을 확인할 수
없다"), so the owner was asked to approve plain facts. Facts, commands and
cautions are data: wrong ones are quarantined by outcomes and go stale. Only
items that change how agents behave, or that touch what the owner confirmed,
need a click. Approving an item sets `importance='important'` permanently; the
stored column, not history, decides later updates. Importance never decays.

The curator keeps only reusable project facts (commands, file locations,
structure, configuration, recurring pitfalls), never the conclusion of one
investigation or the answer to a one-off question, and proposes at most three
operations per job (extra ones are ignored).

Routine operations apply immediately (`active`/`retired`) and append history
`{at, op, by:'curator', job, model}`. Important operations become `pending`
with `approval={key, op, proposedText, at}`; the previous version stays active
and pending items are never injected. An item that already carries an approval
key is never overwritten: a new proposal for it is rejected (a pending update
is queued as its own row via `supersedes`). Approvals never expire into an
automatic apply: unanswered proposals stay pending (P5b lists them in the weekly
digest).

## Evidence gate

- A task job may `add` or `update` only when the task ended `passed`. The item
  evidence is `verified` for a `verified` workflow and `daily` for a daily one.
- A `failed` or `blocked` task may only add `kind='caution'` items, and may
  retire/update items that were actually injected into that task.
- A conversation job takes project items as evidence `owner` only when the
  proposed text restates owner-authored text (substring or ≥ 0.5 token overlap
  with an owner message); otherwise the evidence is `daily`. Owner-scope
  operations are allowed only there, and project operations only for a project
  that conversation's tasks already used.
- Every operation is re-validated in code: schema, length, scrub, secret-like
  patterns (tokens, keys, emails, credentials in URLs), project existence, item
  ownership, and an injection scan for agent-control phrasing. A rejected
  operation does not invalidate the rest of the job.
- Near-duplicate adds (≥ 0.8 token Jaccard overlap with an active item) are
  converted into an update of that item instead of creating a duplicate.

## Curator runs

- The curator is one model turn per tick, phrased with
  `MEMORY_REQUEST_ID=<job>` and a `Memory data` block (untrusted data). It also
  receives the project's active, pending, **stale** and **quarantined** items so
  update/retire proposals can target an item that is no longer injected.
- The reply must be exactly one line
  `PASEO_MEMORY_RESPONSE={"jobId":"<job id>","ops":[...]}` with at most five
  ops. The job id must match the request; a reply for another job is never
  applied.
- A `sent` job older than 10 minutes, an agent whose status is `error` or
  `closed`, and a conclusive but unusable reply each mark the job invalid
  (`attempts+1`). It is re-queued **once** at the back of the queue and then
  becomes `invalid`, so a single job can never stall the queue. A queued job
  that waits six hours behind a busy agent is bounded the same way.
- The curator agent is long-lived but is archived and recreated every 50 jobs
  or 7 days to bound its context.
- At most **one remote manager call per tick**: recover/create, observe, send,
  permits or archive happen on separate ticks. Permission requests are only
  polled when the last `observe` reported `pendingPermissions > 0`; each one is
  denied on its own tick.

## Cost model

Task outcomes, triggers and task indexing share one cursor over the append-only
`events` table (`cursor:task-events`), which receives one row per task save.
`tasks.rowid` cannot detect a state change because rows are updated in place,
and JSON-extracting `updatedAt` would mean a full scan every tick, so the event
sequence is the indexed equivalent. Conversation triggers use a cursor over
`gui_messages.rowid` plus per-conversation `conv:<id>` meta
(`{last, owners, last_curated_at}`). The first start after an upgrade only enqueues the
last 20 finished tasks.

A conversation is curated again only when at least 4 **new** owner messages
arrived since `last_curated_at` and the conversation has been idle
for 30 minutes. The owner-message counter is reset when a job is queued, so an
idle conversation is never re-curated in a loop.

## Outcomes, quarantine and staleness

- `passed` increments `successes` for the items that were injected into the
  task; `command`/`fact` items whose text contains a gate command or a changed
  path from the receipt get `last_verified=now` and leave `stale`.
- A later `passed` task also re-activates a `stale` item of the same project
  whose text matches one of its gate commands or changed files **without** that
  item having been injected.
- `failures` is incremented only when the task itself is at fault: state
  `failed`, or state `blocked` with `blockedKind` `verdict`/`evidence`.
  `timeout`, `needs_input`, `capability`, `transient`, `cancelled`, `safety` and
  `dependency` say nothing about the memory.
- An item with at least 3 failures and a failure ratio of 0.6 or more over its
  last 5 outcomes is quarantined (not injected, still searchable) and a curator
  job is queued to propose an update or retirement.
- `command`/`fact` items not verified for 60 days become `stale`: they are not
  injected but remain searchable, and the curator sees them.
- Rejected proposals are recorded and the curator is told about them for 30
  days, so it does not re-propose the same text.
- The outcome marker and the counter updates commit in one transaction, so a
  crash mid-outcome leaves nothing half-applied.

## Retention

Once a day the store prunes `uses` older than 180 days, `done`/`invalid`
curation jobs older than 30 days, retired items older than 180 days, and stale
`meta` keys (old outcome markers, old index signatures, expired rejections and
conversation activity, and `announced:` markers whose approval is gone). Items
retired by capacity are removed from the search index.

## Injection format

The manager envelope and the `work`/`review` worker prompts receive a bounded,
clearly-labelled data block:

```text
Project memory (data; may be outdated — verify paths/commands before relying):
- [fact] The gate command is `python3 -m unittest discover -s tests`.
- [command] Run `node --test tools/paseo-bot/bridge.test.mjs` before a release.
```

The manager gets related projects plus owner scope (≤ 1 500 characters); workers
get the task project only (≤ 1 000 characters). Pending, stale, quarantined and
retired items are never injected. Items injected into a task are recorded in
`uses` and receive its outcome later.

## Approvals (Discord)

Each new important proposal posts one system message to the originating
conversation, or to the dedicated `memory-review` conversation when the task has
none:

```text
기억 변경 승인 요청 (<project or 전역>): <op 한국어>
<proposedText>
근거: <task/conversation id, evidence>
```

The message carries `{memoryApproval: {key}}`; the gateway attaches owner-only
`pb:ma:<key>` (승인) and `pb:mr:<key>` (거절) buttons, defers the interaction,
calls the `gui_api` `memory` action, then edits the card. The `memory-review`
conversation maps to the configured channel itself (no thread) and is polled at
the warm 60-second tier. Rejecting drops the proposed operation, records it in
history and feeds the rejection back to the curator.

The notify callback owns its own database write and must commit it before it
returns; `announced:<key>` is recorded only after the callback returns
successfully, so a notice that failed to persist is retried on the next tick.

## Git-versioned export

Set `memoryExport` in `gui-runtime.json` to push a human-readable copy into a
private clone:

```json
{"memoryExport": {"repo": "/Users/me/private-memory", "remote": "origin", "branch": "main"}}
```

After a change (debounced 10 minutes) and at least once per local day, the bot
renders `owner.md` and `projects/<id>.md` with active, pending, stale and
quarantined sections. Every line carries the item id, kind, text, status,
evidence, source, uses (`successes/failures`) and last verification date.
Retired items are omitted but stay in history. The rendered files contain no
per-run content (no generated timestamp), so unchanged memory produces no
commit. The export runs `git add -A`, commits only when there is a diff
(`memory: <n> changes`), and pushes.

Export rules:

- at most one export per 10 minutes, with exponential backoff on failure
  (10 min, 20 min, 40 min … capped at 6 hours);
- one 60-second budget for the whole export, including the push; a git call
  that exceeds it has its whole process tree killed;
- `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never` so git can never block on
  a prompt; `GCM_CREDENTIAL_*` settings are kept (they name a credential store,
  not a secret) while token-bearing environment variables are removed;
- git output is decoded with `errors='replace'`, nothing is force-pushed, no
  token goes into argv, the environment or logs, and every rendered line is
  scrubbed again;
- the branch must be a strict refname (no `+`, `..`, leading `-`, spaces or
  control characters);
- a directory that is not a git repository is logged once and the export stays
  disabled until the process restarts. A failed push is retried on the next
  cycle.

## Configuration

`gui-runtime.json` accepts two optional objects next to the manager settings:

```json
{
  "curator": {"provider": "codex", "model": "<cheap-model>", "thinking": "low", "mode": "auto"},
  "memoryExport": {"repo": "/Users/me/private-memory", "remote": "origin", "branch": "main"}
}
```

`curator` is validated like the manager object. Without it curation is disabled
(logged once) while injection, outcomes, staleness, approvals already queued and
the export keep working. The curator agent is long-lived, uses the same daemon
and workspace as the manager, is read-only, and every permission request it
makes is denied automatically. Only one model turn runs per gui tick.

## CLI and bridge

- `gui_api.py` action `memory` (write requires `--allow-submit`):
  `{op:'approve'|'reject', key, requestId}`, `{op:'forget', id, requestId}`;
  read: `{op:'list', project?, status?}`, `{op:'search', query, project?}`
  (FTS, at most 20 scrubbed results). Unknown keys are rejected.
- `paseo_bot.py memory list|search|forget|approve|reject …` and
  `paseo-bot.ps1 memory <op> [-Value] [-Project] [-Status] [-Query]` pass through
  to the same action.

## Limits

Memory cannot guarantee correctness. It records what a model inferred from one
task or conversation, so paths and commands must still be verified before use.
Only important items get human approval; routine items are AI-written and are
corrected by outcomes, staleness and the curator rather than by review. The
store is private state, not a backup: the optional export is the readable copy,
and it depends on the host's git credentials and connectivity.
