# Paseo bot GUI v2

The sidebar plugin is now a conversation with a dedicated **VAXPORT manager**,
with the existing queue's read-only Kanban/list available in the secondary **작업 보기** panel. The manager understands and
handles writing and questions directly and plans project changes; the Mac does not call an LLM. A plan is admitted only after the
operator selects the inline plan's single **접수** button. No project, machine or model form is required; the manager selects them from the active registry. Cards are projections,
not another scheduler. There is no drag/drop or state mutation endpoint.

The first sentence starts a persistent conversation automatically. Short follow-ups
use the same manager session and an authoritative snapshot of that conversation's
work. Stage changes and terminal results appear in the same chat, including safe
PR links. Natural-language retries create a new validated plan; failed-card retries
first confirm a review request and then require the new plan's **접수**.

## Runtime ownership

### Daily workflow

The composer defaults to **일상** (`workflow: daily`). Writing, translation,
summaries and ordinary answers are delivered in the conversation with no worker
plan or Git requirement. Project changes normally use one task, with a
service-enforced maximum of three tasks per plan. **정밀 검증**
(`workflow: verified`) explicitly opts into up to twelve tasks and the existing
independent review pipeline.

Daily coding uses two model stages: source preparation and implementation with
self-checks. Every configured gate receipt and a content fingerprint are required.
The deterministic cleanup helper compares the actual branch, HEAD and file
fingerprint before and after evidence capture. A missing or mismatching receipt
blocks the task without publishing or archiving the worktree. This is not an
independent code review. Verified coding retains its four model stages.

Daily automatic coding selection uses Sol with medium effort. Explicit worker
model/effort choices are honored; daily mode does not automatically rotate to a
premium model, repair a malformed receipt with another model call, or relaunch
preparation. The persistent conversational assistant still uses the operator's
`gui-runtime.json` model/thinking settings; composer model/effort choices are for
project workers, not retroactive changes to that assistant.

Completion notifications are deterministic messages from stored evidence, not
another model turn. Each user turn injects at most six recent task summaries
(600 characters per summary, reason and original request) and three relevant
saved notes (1,000 characters each), instead of full logs. The provider still
owns persistent-session history/compaction. These are workflow and context
bounds, not a hard total-token or billing ceiling, and no percentage saving or
quality advantage over ordinary chat is claimed without a comparative run.

Read-only references: Dinobot `SOUL.md` (scale planning to the task, check actual
evidence and stop), `src/auth/request-budget.ts` (bounded retries), and
`test/compaction-policy.test.ts` (bounded context) at
https://github.com/dinobot-labs/dinobot, inspected on 2026-10-27.
The implementation reuses Paseo's queue and manager rather than importing another
agent framework. Omo's inspect/do/check/stop discipline is used without mandatory
multi-agent planning or repeated review.

The existing manager is preserved. Every GUI conversation binds a new persistent
manager agent labelled `paseo_bot_gui=<conversation-id>`. The new manager retains
the approved full-access mode. Its prompt restricts its role to clarifying,
writing, answering, planning and explaining results; this is **not OS sandboxing**. The
bridge checks the configured server identity and the session ownership label
before observing/sending. The Mac cannot choose an agent ID, shell, cwd or model.

`gui_state.py` journals messages before sending. Unknown creation is recovered
by label; unknown sends are adopted only with a request marker in the original
timeline. They are never blindly resent. Final responses require a matching
request ID and a bounded `PASEO_GUI_RESPONSE` object. Raw tools, reasoning and
provider stderr are not exported. Only the structured final reply is displayed.

`gui_serve.py` is a deterministic single-writer service. `sync` only reads SQLite
using `mode=ro/query_only`; it never starts the manager or migrates the DB.
Explicit migration adds conversation/plan/delivery/memory tables to the same
queue database. A confirmed plan and its task origins are committed together;
registry/owner/schema are revalidated at admission. Dependencies reference earlier
plan steps and the existing resident dispatcher gates them until prerequisites
pass. Failed prerequisites block dependents without launching them.

## Provisioning (operator-only, private files)

Keep a clean pinned runtime checkout on VAXPORT. Back up `queue.sqlite3` using
SQLite's backup API, then explicitly migrate with:

```text
python -X utf8 tools/paseo-bot/gui_serve.py --state <private-state> migrate
```

Create `<private-state>/gui-runtime.json` privately with these fields:

```json
{
  "serverId": "EXPECTED_VAXPORT_SERVER_ID",
  "cwd": "C:\\absolute\\pinned-runtime",
  "provider": "codex",
  "model": "VERIFIED_MANAGER_MODEL",
  "thinking": "medium"
}
```

Use the approved existing manager's verified configuration, including
`full-access`; don't edit that agent. No credentials belong in this file. Windows
needs user-only ACLs on the private state directory. Register a dedicated Paseo
workspace script for `python -X utf8 .../gui_serve.py --state ... serve` and start
it without restarting the daemon. Update the original resident to this revision
at an idle boundary before admitting multi-step dependent plans; the older
resident does not implement dependency gates. Never run two unlocked dispatchers.

Point the Mac's existing private `connection.json` bridge path at this revision's
`gui-bridge.ps1`, retain strict host keys and allowSubmit for the trusted operator,
then install/reload `tools/paseo-bot/plugin`. The SSH command remains fixed and all
content travels as UTF-8 JSON stdin. No HTTP listener, new token or Slack sender.

## Producers and retries

Both CLI and GUI write the same `tasks` table through existing submit validation.
The task digest still covers only the original task body. Producer/context are
stored separately in `task_origins` and remain immutable on duplicate intake.

```powershell
# Grok's trusted local producer route; JSON via -File or UTF-8 stdin as before:
.\tools\paseo-bot\paseo-bot.ps1 submit -File task.json -Producer grok
```

```text
python tools/paseo-bot/paseo_bot.py submit --producer grok --file task.json
```

The producer flag records the trusted OS caller's declared route; it is not a
second authentication boundary. GUI origins come from the conversation service,
not task text. Prior unlabelled tasks remain **이전 작업**, ordinary CLI tasks
remain **CLI**, and Grok-marked tasks display **Grok 봇**. Never infer historical
provenance from a title or ID. Existing Grok callers can keep their old command;
to get the explicit badge they must use the producer flag on the updated CLI.

**재시도** on failed cards opens a confirmation and asks the manager to inspect
the old request/result. It does not change the old task or immediately submit a
copy. The resulting new plan needs another confirmation and uses new IDs, with
`retryOf` provenance. Blocked/unknown tasks are never silently replayed.

## Interface and evidence

The secondary overview shows queue totals and runner heartbeat. The chat header
separates SSH reconnection from a manager service that has stopped responding.
Search/project/machine/requester/state/sort filters run over the entire queue,
not only a page. The 100-item page and result count are explicit. Kanban and list
share filters. Running includes preflight/work/review/postflight; blocked and
unknown are attention, not success or generic failure. Unassigned values stay
unassigned instead of inventing a machine/model.

Card detail offers a workflow-specific timeline, structured receipts/gate exit codes,
safe PR links, expandable/filterable JSON and host clipboard copy. It never
claims unsaved raw logs exist. Chat has no required pickers. It provides source-linked task links, saved
reading position and drafts within a mounted session, a new-message
control, Enter/Shift+Enter with IME protection, `/` search and `N` composer focus.
Native host Modal/Markdown/toast/Icon are reused. Controls are 44px; colors come
from the host theme. Keyboard arrows navigate cards. Explicitly saved assistant
notes are project-scoped historical context, not execution authority.

Polling is 2s while chat is pending, 5s during work and 10s idle, with bounded
read backoff and reconnect guidance. Mutations never retry automatically. Message
IDs and plan digests make intentional retries idempotent. New sessions have
separate manager histories and cache slices. Task results generate durable
origin-conversation notices directly from stored receipts without a model call;
GUI text does not impersonate a model response. Ask a follow-up for an explanation.

Tests: Python conversation/admission/recovery/dependency/provenance/readonly
contracts, Node transport/model contracts, production-view browser interactions,
light/dark viewport and 44px checks. `npm run screenshots -- <output>` renders
offline fixtures with the production view and writes 72 images plus metadata.
The host chrome is a web stand-in there; live native app screenshots and live
manager intake evidence must be reported separately. No fixture is a live model
or production completion claim.

### Daily workflow validation (2026-10-27)

- Shared Python regression suite: 230 tests, 8 platform skips, exit 0.
- Bot bridge contracts: 13 passed. Final conversation tests after DTO/notice
  changes: 31 tests, 1 Windows-only skip, exit 0.
- Plugin typecheck: exit 0. Plugin contracts and browser interactions: 23 passed.
- Final production-component fixture matrix: 72 captures at 375, 768 and
  1440 px in light/dark; no root-page overflow. Inspected writing, composer,
  plan confirmation and daily/verified detail layouts.
- Native Paseo app verification remains separate: desktop automation reported
  `COMPUTER_LAUNCH_CONTEXT_REQUIRED` on this Mac. Installed plugin
  `paseo-bot-v3` still points to its separate runtime worktree; neither it nor
  the VAXPORT service was deployed/restarted by this change.
- No live model comparison was run, so quality superiority and measured token
  savings are unproven. Structural savings are two instead of four coding
  model stages and zero extra model turns for completion notices.
