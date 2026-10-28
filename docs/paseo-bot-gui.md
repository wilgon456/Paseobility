# Paseo 봇 GUI

## Design and existing registrations

Existing Paseobility `plugin/index.client.tsx` registers its `skills` screen with
`addScreen`, a `SidebarRow` with `addSidebarHeaderItem`, and daemon RPC handlers
with `server.handle`. The installed Agent Observatory similarly registers its
observatory/archives/schedule screens through those two client APIs.

The new independent plugin is `tools/paseo-bot/plugin` (ID `paseo-bot`, Paseo
0.13.x). It adds **Paseo 봇**, keeping the existing plugin's lifecycle unchanged.
The primary surface is Operate: queue counts and health first, a newest-first
task list and selected result second, an explicit new-task form on request.
At compact widths the result follows the list. All text and surfaces use Paseo
theme colors, React Native primitives, 44px controls and the host's type scale.
No marketing hero or new palette is introduced. The offline preview supplies
fixture colors only; production always uses `theme.colors`.

## Chosen transport and trust boundary

App → typed plugin RPC → daemon subprocess → existing OpenSSH → Windows fixed
`gui-bridge.ps1` → one-shot `gui_api.py` → private queue.

This reuses authenticated SSH over Tailscale rather than opening a status HTTP
port or distributing bearer tokens. Addresses are limited to Tailscale IPv4
100.64.0.0/10 or MagicDNS `*.ts.net`; SSH host keys must already be trusted.
`BatchMode=yes`, `StrictHostKeyChecking=yes`, no SSH config/proxy/local commands,
no TTY/forwarding, time/input/output limits, and fixed Windows paths are enforced.
No accept-new, password prompt, relay/public-network fallback or raw error logging.
Task text crosses stdin as UTF-8 JSON, never shell arguments or evaluated code.

`status` and `result` open SQLite using `mode=ro` and `query_only=ON`; they do not
initialize the Bot, create schema, tick the runner or change ownership. Status
returns counts, a 100-item page, bounded task labels, heartbeat and project IDs;
it omits prompts, repository paths, gates and private host configuration. Result
returns the scrubbed existing receipt (including verification evidence). Submit
uses exactly `Bot.submit`, the same admission function used by
`paseo-bot.ps1 submit`. Owner fencing, ID/body idempotency and task schema stay
authoritative. No extra queue, runner or model session is created by the bridge.
`--allow-submit` on the bridge is opt-in and the private local connection must
also permit it. Standby/retired/copied queues reject intake.

The SSH account and every client authorized on this Paseo daemon are trusted
operators. This is application-level command restriction, **not an OS sandbox**
or an untrusted-user API: an existing full-account SSH key still has its account
rights. For separate viewers, use a dedicated account/forced-command key without
`-AllowSubmit` and appropriate read-only Windows ACLs; provision and verify that
as a separate access-policy task. The plugin does not edit SSH keys, ACLs,
Tailscale policy or credentials. Pattern scrubbing is defense in depth, so never
place credentials in task text or project policy.

## Install

The controller may be Windows (`gui-bridge.ps1`) or macOS/Linux
(`gui-bridge.sh`, run with `/bin/sh`). If the plugin's Paseo daemon runs on the
controller itself, set `"host": "local"` and omit `user`: the plugin starts the
bridge directly, without SSH. Otherwise the steps below apply; for a Mac
controller use its tailnet name and an absolute `.../tools/paseo-bot/gui-bridge.sh`
path as `bridge`.

1. Pin a clean checkout/worktree on VAXPORT that contains these bridge files and
   the runtime's existing `skills/paseo-multi` imports. Leave its active runtime
   checkout and resident process alone. The authoritative queue remains
   `C:\Users\maste\.config\paseo-bot`.
2. On the MacBook daemon host, create private directory
   `~/.config/paseo-bot-gui` (0700) and `connection.json` (0600):

   ```json
   {
     "host": "100.64.0.1",
     "user": "WINDOWS_USER",
     "bridge": "C:\\absolute\\Paseobility\\tools\\paseo-bot\\gui-bridge.ps1",
     "expectedHost": "VAXPORT",
     "allowSubmit": false
   }
   ```

   Replace the example with the actual tailnet address and account. Optional
   `identityFile` and `knownHostsFile` are absolute paths; private key material
   never goes into JSON, the frontend, the repository or logs. Windows daemon
   hosts need user-only ACLs on the connection file and SSH keys. There is no GUI
   credential editor. A fresh install defaults to read-only. Set `allowSubmit`
   true privately only for an operator authorized to start tasks.
3. Verify SSH host identity through an already trusted channel, and confirm a
   noninteractive login works. Never bypass host-key checking to make it work.
4. `paseo plugin add /absolute/Paseobility/tools/paseo-bot/plugin`. No daemon
   restart. Plugins are scoped to their daemon; select the MacBook host in Paseo
   to use its connection configuration. Other daemons need their own install
   and explicitly configured access.

## Screen usage

- Open **Paseo 봇** in the sidebar. Counts, heartbeat and task pages refresh every
  ten seconds. Connection errors explicitly mark cached data as possibly old.
- Select a task to see its state, phase, summary/reason, deployment status and
  **상세 JSON 보기** for existing review/gate receipts. `passed` means the bot's
  review pipeline passed; it is not deployment proof. The plugin does not merge
  or deploy task results.
- **새 작업** → choose an enabled project ID, enter title/content and a type →
  **작업 제출**. Machine routing follows the existing registry. The registry's
  enabled projects and gates remain operator policy, never editable here.
- The UI generates a stable request ID before submission. It does not retry
  mutations automatically. On an ambiguous timeout the draft is frozen: inspect
  the list using that ID; **같은 요청 재시도** sends identical data and ID, which
  the queue deduplicates. **새 요청 작성** starts a new ID, so only use it for a
  separate intended request. Acknowledged intake is not task completion.

## Validation record

Python tests cover read-only DB bytes, missing DB, bounded input, policy omission,
pagination, redaction, owner fencing and idempotency. A Windows-only integration
test exercises `gui-bridge.ps1` read/submit/result via real UTF-8 stdin, including
duplicate submission on a temporary queue. Node tests cover fixed SSH options,
tailnet/path validation, stdin isolation, split UTF-8, wrong-host/failure behavior
and bounded requests. Browser tests render the production React Native view with
offline data and exercise selection, result JSON, form validation, submit, frozen
ambiguous retry, error, loading and empty states.

Both existing macOS and Windows CI jobs install/typecheck/test this plugin and
run the shared Python suite. Browser fixtures use preinstalled Chrome/Edge.
Measured design-check evidence and actual installed/runtime checks are recorded
in the requested local `~/paseo-specs/paseo-bot-gui-report.md`, separately from
offline tests. Tests never submit a task to the production queue.
