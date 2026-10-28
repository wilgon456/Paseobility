# Paseo bot v3 routing and composer

The command/inspect surface keeps the chat primary and the board secondary. The composer groups project, model and effort choices with the input; each defaults to automatic. Plan cards show the server-resolved work model and the reason. Existing Paseo theme colors supply surfaces, borders and status colors in both themes. On compact screens controls wrap and the board replaces the chat until closed.

The GUI sends only aliases (`sol`, `claude`, `go`, or 자동). The service checks the active registry and a fixed model/effort allowlist, applies the selection to every plan step, and includes it in the plan digest. It never accepts cwd or commands from the GUI. The manager's task text and classifications remain untrusted. Normal work defaults to Codex `gpt-6.1-sol` (high thinking when effort is 자동); only the hardest design/debug work (`hard`) selects Claude `claude-opus-5-5`, and lightweight work (`sync`) uses OpenCode `opencode-go/deepseek-v4.1-flash`. Review and postflight stages stay on Sol. GPT-6.1 Terra is retired as a default and is no longer selectable; queued tasks, pending plans or older clients that still say `terra` resolve to Sol. When a confirmed usage limit (or a model missing on the host) stops an attempt, the fallback chain is Sol → Claude Opus → DeepSeek Flash → Sol, never retrying a model already attempted in that stage. DeepSeek Flash has no medium thinking level, so an explicit medium effort runs it at high. Other failures, permissions, missing acknowledgements, and ambiguous outcomes stop without replay. Each retry uses the completed attempt's workspace ID and checks the returned path. The bridge returns a fixed error category, never raw provider errors.

The profiles provide host permission modes, while model IDs and provider families are constrained in the bridge; CommandCode is not selectable. Neither a rendered fixture nor a passed unit test proves live provider limits, desktop integration or deployment.

The compact plan defaults to a single summary, a horizontally scrollable project/model/effort/reason row and admission, modification and details controls. Modification cancels the pending plan and returns focus to the composer; a new request creates a new plan. Details expand separately. Tags use deterministic project hues, provider and effort colors, and state/requester colors; text colors are checked against their computed surfaces for 4.5:1 contrast. Paseo's single accent remains the primary-action color. Motion includes short card entrance/hover, admission and detail transitions, a running indicator and completion check. System reduced-motion disables those animations. Board changes animate an entry in the direction of the new lane; this is not a continuous physical drag between independently scrolling columns.

## v2.1 visual redesign

The console keeps the same chat-first command/inspect structure and the host theme tokens; color now carries meaning instead of decoration. Concept: a dispatch desk whose status lanes are colored signal tracks.

- Header: an accent bot mark, a live status pill (green connected, blue running, yellow checking, red reconnecting) and a running-count badge on 작업 보기. On compact screens the header actions become 44px icon buttons with unchanged accessible names.
- Chat: the operator's messages are right-aligned accent-tinted bubbles, the bot's replies carry an avatar, and admission notices are green completion pills with a check pop. New messages and plans enter with a short rise.
- 이렇게 진행할게요: one line (label + summary), one horizontally scrolling chip row (project, model, effort, step count, reason), then 접수 / 수정 / 상세 펼치기. Steps stay collapsed until requested; admission dims and scales the card before the completion notice replaces it. The card remains at most 130px tall at phone, tablet and desktop widths.
- Composer: one rounded surface like the Paseo conversation window, with project/model/effort chips (each defaulting to 자동, with colored option dots and short notes) and a round send button inside.
- Board: pressable colored stat tiles filter by lane; lanes have tinted tracks and headers with count bubbles; cards show a status-colored top strip, project/model/requester tags, a status badge and a four-segment stage rail whose active segment breathes while running. Hover lifts cards and tiles; lane changes slide in from the previous lane's direction.
- Tokens: radii 10 (controls), 14 (surfaces) and pill; elevations resting/raised; tags mix the tone into the actual surface and keep 4.5:1 text contrast in light and dark. Reduced motion disables every loop, lift and entrance.

Rows in the board snapshot now include the active model alias (the fallback model once dispatched, otherwise the planned work model).

Design-check on the offline fixture (conversation and kanban, 375/768/1440, light and dark) reports no overflow or contrast findings. Remaining align-x/align-r errors are near-miss pairs between unrelated groups (for example the plan card edge and the bot avatar above it). The single conversation text-overlap comes from a message scrolled under the header inside the clipped chat scroller. The hangul-font and 13px findings come from the web test stand-in, not the host app.

## Repeated-use recovery (v4)

The service never resolves an ambiguous state by itself, but it no longer hides
one. `sync` returns `stuck`: `job-unknown` when a sent request could not be
proven delivered, `manager-missing` when recovery by label finds no manager.
The GUI shows the reason with one explicit action (`resolve`): skip the
unproven request, or start a fresh manager for the conversation. Nothing is
resent automatically. A failing or foreign manager is isolated to its own
conversation, and idle conversations without pending work make no remote call.

`gui-runtime.json` accepts an optional `mode` (default `full-access` for
existing installs). The manager only plans and explains, so pin the narrowest
mode its provider advertises that still answers without permission prompts.
Task rows include the model alias, and passed tasks on `publish: draft-pr`
targets carry their draft PR link.

## Fewer workspaces and agents (v5)

Conversation managers share one Paseo workspace on the configured daemon instead
of opening a new local workspace per conversation. The first manager creates it;
its ID is remembered in the queue database for that `serverId` and reused with
`paseo run --workspace`. If that workspace was archived, the next manager opens
one new workspace and that one is remembered.

A conversation whose last message is older than `managerIdleDays` (optional in
`gui-runtime.json`, default 7, `0` disables) has its idle manager archived and
becomes `dormant`. Nothing remote happens until the user writes again; then a
fresh manager starts and the first request carries the last twelve visible
messages as historical data. Conversations with an unresolved request keep their
manager. The same history replay applies after the operator restarts a missing
manager.
