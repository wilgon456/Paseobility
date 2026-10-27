# Grok completion webhook

The resident can send one completion notification per task, after its first
transition into `passed`, `failed`, or `blocked`. Existing terminal tasks are
not backfilled. `unknown` requires manual reconciliation and does not notify.
Notification errors never change the task verdict, outbox result or health.

## Secret provisioning on the sending host

Use Python 3.11+ in a dedicated venv and install `requirements-webhook.txt`.
This is separate from the shared agent-auth broker and the resident's Python.
The official `bitwarden-sdk==2.1.0` reads the existing broker's Secrets Manager
project and access-token file. The default Windows broker config is
`%APPDATA%\gateOFbabylon\config.toml`; `--broker-config` can select another
public config path. No secret or access token is accepted on argv.

`secret_store.py check` authenticates and reads project metadata.
`secret_store.py store` accepts only bounded UTF-8 JSON from **piped stdin**:
an object containing exactly `url` and `key`. Send those bytes from the clipboard
in memory over authenticated Tailscale SSH with `-T` and
`StrictHostKeyChecking=yes`. Do not interpolate values into shell commands,
use `echo`, write temporary JSON, enable shell tracing, or print the clipboard.
Clear the clipboard in a `finally` block, including on transfer failures.

The tool creates or updates `paseo-bot-grok-webhook` and reads it back in memory
before emitting only `{"ok":true,"operation":"store"}`. Same-name duplicates
or an entry belonging to another project fail closed. `verify` validates the
stored entry without printing it. A failed or lost acknowledgement is not
automatically replayed: run `verify` before deciding whether to repeat a store.
SDK logs, native stdout/stderr and exceptions are suppressed; the SDK does not
receive a state-file path. The new webhook value is stored only in Bitwarden.
The pre-existing machine token file is read, never rewritten.

## Enable delivery

Create `webhook.json` inside the resident's private state directory. It contains
only public local paths, for example:

```json
{
  "enabled": true,
  "python": "C:\\Users\\example\\.local\\share\\paseo-bot\\sdk-venv\\Scripts\\python.exe",
  "brokerConfig": "C:\\Users\\example\\AppData\\Roaming\\gateOFbabylon\\config.toml"
}
```

Absence or `enabled: false` disables sending. Do not place the URL, key or token
in this file, the project registry, SQLite, agent prompts, task receipts or logs.
Each attempt starts `webhook_delivery.py` in the configured SDK venv, passes
the task payload through a private stdin pipe and reads the Bitwarden entry
in that process. Its stdout contains only an outcome and optional HTTP status.

The POST has `Content-Type: application/json`, an `Authorization` header, and a
stable `Idempotency-Key` derived from the task ID. A bare key becomes
`Bearer <key>`; an existing authorization scheme or `Authorization:` prefix is
preserved/normalized. HTTPS is required. Redirects are rejected so credentials
cannot be forwarded to another host. Response bodies and redirect targets are
never read or logged.

The JSON body contains `task_id`, `project`, `machine`, `state`, `summary`,
`pr_url`, and `requester`. Producers can supply the optional `pr_url` and
`requester` fields during task intake; absent values are empty strings. When a
`publish: draft-pr` target published the passed work, `pr_url` is that draft PR
(the notification is sent after cleanup, so the link already exists). For a
blocked task without a summary, its reason becomes the summary.
If routing failed before a target machine was selected, `machine` names the
resident host that produced the blocked result.

## Retries and duplicate protection

SQLite commits the completion event and unique task notification together.
Repeated saves, repeated ticks, duplicate submissions, resident restarts and
later terminal-state changes cannot create a second notification for that task.
Delivery is serialized under the resident owner lock; it never runs inside the
task database transaction. Historical terminal results remain unchanged.

HTTP 429/5xx and secret-read/child-launch failures allow **three retries after
the initial attempt**, at 5, 15 and 45 seconds (four attempts maximum). The
attempt count and next eligible time survive restart. Other HTTP rejections
stop immediately. Timeout, connection loss, malformed worker receipt or a
crash after the durable send claim is marked `uncertain` and not replayed:
the receiver may already have processed that POST. Inspect before intervention.

HTTP cannot prove exactly-once remote side effects without receiver cooperation.
The stable idempotency header lets a supporting receiver deduplicate retries;
an endpoint returning 5xx after processing must also honor that header to avoid
duplicate remote effects. The live acceptance test must separately verify one
attempt, a 2xx acknowledgement and one Grok routine run with the test task ID.
Do not call a local fixture or HTTP receipt alone end-to-end receiver proof.

Delivery metadata is in `webhook_jobs`: `task_id`, `delivery_id`, bounded task
payload, `status`, `attempts`, `next_at`, and optional `http_status`. No raw
exception, response body, webhook URL or credential is persisted. `exhausted`,
`rejected`, and `uncertain` do not automatically replay on restart.

## Offline checks

```sh
python -m unittest discover -s tests -p 'test_paseo*py' -v
```

These test SDK create/update/read-back, stdin validation, silent Python/native
diagnostics, terminal transitions, all payload fields, retry budget, durable
duplicate prevention, crash ambiguity, authorization, redirect rejection, and
unchanged task results when delivery fails. They do not contact Bitwarden or
Grok. Windows and macOS CI both run the same tests.
