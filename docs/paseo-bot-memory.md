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
  (`uses`, `successes`, `failures`), `supersedes`, the pending `approval` and a
  bounded JSON `history`.
- `uses(task_id, item_id, at)` records which items were injected into which
  task. `curation_jobs` queues one curator turn per finished task or idle
  owner conversation, and `meta` stores migration markers, the curator agent,
  export bookkeeping and rejected proposals.
- A SQLite FTS5 table `search(doc_id, kind, project, title, body)` indexes
  active/stale items and finished tasks (title, prompt excerpt up to 2 000
  characters, summary/reason, project, state). Without FTS5 the store degrades
  to `LIKE` search; nothing else changes.
- Existing GUI `remember` pins in `gui_memory` are copied once as
  `scope=project, kind=fact, evidence=owner, importance=routine` items with a
  `gui-pin` source. `gui_memory` is left untouched, and the GUI action keeps
  writing both places.
- Caps: at most 40 active project items / 6 000 characters per project, and 15
  owner items / 2 000 characters. A write over the cap retires the
  lowest-score routine items first (score = successes − 2·failures, then oldest
  `last_verified`). A hard cap still holds if only important items remain; the
  retired item stays in history and the export omits it.

## Policy (routine vs important)

- Most memory is written by AI **without** human approval, but every item carries provenance and outcome tracking and is pruned automatically when it proves wrong or stale.
- Only **important** items need owner approval (Discord buttons). Importance is decided by **deterministic rules in code**, never by the model alone.
- Memory is data, never instructions: it is injected with a clear "verify before relying" wrapper, and nothing from untrusted sources (web pages, third-party text, tool output) becomes memory.

Importance rules, verbatim from the implementation contract:

> an op is `important` if ANY: scope is `owner`; kind is `convention`; text matches deploy/release/publish/secret/token/credential/password/permission/approve/production/merge/force/delete/database keywords (Korean equivalents too: 배포, 출시, 비밀, 토큰, 인증, 권한, 운영, 병합, 삭제, 데이터베이스); it updates/retires an item whose evidence is `owner` or that was approved before; it would retire > 3 items in one job. Otherwise `routine`.

Routine operations apply immediately (`active`/`retired`) and append history
`{at, op, by:'curator', job, model}`. Important operations become `pending`
with `approval={key, op, proposedText, at}`; the previous version stays active
and pending items are never injected. Approvals never expire into an automatic
apply: unanswered proposals stay pending (P5b lists them in the weekly digest).

## Evidence gate

- A task job may `add` or `update` only when the task ended `passed`. The item
  evidence is `verified` for a `verified` workflow and `daily` for a daily one.
- A `failed` or `blocked` task may only add `kind='caution'` items, and may
  retire/update items that were actually injected into that task.
- A conversation job takes evidence from the owner's own messages; owner-scope
  operations are allowed only there, and project operations only for a project
  that conversation's tasks already used.
- Every operation is re-validated in code: schema, length, scrub, secret-like
  patterns (tokens, keys, emails, credentials in URLs), project existence, item
  ownership, and an injection scan for agent-control phrasing. A rejected
  operation does not invalidate the rest of the job.
- Near-duplicate adds (≥ 0.8 token Jaccard overlap with an active item) are
  converted into an update of that item instead of creating a duplicate.

## Outcomes, quarantine and staleness

- `passed` increments `successes` for the items that were injected into the
  task; `command`/`fact` items whose text contains a gate command or a changed
  path from the receipt get `last_verified=now` and leave `stale`.
- `failed`/`blocked` increments `failures`, except `cancelled`, `capability` and
  `transient` blocks, which say nothing about the memory.
- An item with at least 3 failures and a failure ratio of 0.6 or more over its
  last 5 outcomes is quarantined (not injected, still searchable) and a curator
  job is queued to propose an update or retirement.
- `command`/`fact` items not verified for 60 days become `stale`: they are not
  injected but remain searchable. A later passed task that re-verifies the same
  command or path makes them `active` again.
- Rejected proposals are recorded and the curator is told about them for 30
  days, so it does not re-propose the same text.

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

## Git-versioned export

Set `memoryExport` in `gui-runtime.json` to push a human-readable copy into a
private clone:

```json
{"memoryExport": {"repo": "/Users/me/private-memory", "remote": "origin", "branch": "main"}}
```

After a change (debounced 10 minutes) and at least daily, the bot renders
`owner.md` and `projects/<id>.md` with active, pending, stale and quarantined
sections. Every line carries the item id, kind, text, status, evidence, source,
uses (`successes/failures`) and last verification date. Retired items are
omitted but stay in history. The export runs `git add -A`, commits only when
there is a diff (`memory: <n> changes`), and pushes with a 60-second timeout,
using the host's existing git credentials. Nothing is force-pushed, no token is
put in argv, the environment or logs, and every rendered line is scrubbed
again. A failed push is retried on the next cycle.

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
