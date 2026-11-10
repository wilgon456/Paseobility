# Connections and runtime

Official CLI transport reference: https://paseo.sh/docs/cli.md and https://paseo.sh/docs/connectivity.md. `--host` accepts a pairing-offer URL, TCP/IPC or SSH endpoint. SSH requires an already running daemon and working noninteractive SSH; it does not install Paseo. A bare relay URL is insufficient: the pairing offer includes the server identity and encryption key.

Private registry schema:

```json
{"hosts": [{"label": "EXAMPLE_PC", "aliases": ["example pc"], "platform": "macos", "serverId": "expected-server-id", "endpoint": "ssh://user@example"}]}
```

`endpoint` may instead be a trusted pairing-offer URL. For saved Desktop entries, retain `connections` with a `relay` entry (`relayEndpoint`, `daemonPublicKeyB64`, `useTls`) or `directTcp` entry (`endpoint`, optional `password`, `useTls`). The helper constructs the pairing URL in memory and never prints it.

To import a trusted saved-host JSON export:

```bash
python3 scripts/hosts.py import-saved /absolute/private/path/export.json
```

It accepts a host array, a nested host array as used by the saved Desktop snapshot, or an object containing `hosts`. With an existing registry it merges: an imported host replaces the entry with the same `serverId`, others are kept. `--replace` replaces the whole registry. A duplicate alias leaves the registry unchanged. The export and registry stay private. Copy a running LevelDB database before reading it rather than opening it in place. There is no automatic Desktop storage watcher.

Default registry: `~/.config/paseo-multi/hosts.json`, mode 0600 in a mode 0700 directory. Runs are recorded under the same directory in `runs/`. `--config PATH` selects a different registry; files are private on POSIX. Configure matching access restrictions when using a Windows controller.

macOS runtime discovery uses `/Applications/Paseo.app/Contents/Resources` and its bundled Electron Node runner. Windows discovery checks `%LOCALAPPDATA%\Programs\Paseo\resources`, then `%ProgramFiles%\Paseo\resources`, and uses the adjacent `Paseo.exe` as the Electron Node runtime. For a standalone npm installation, it resolves the real `paseo` executable to the installed `@getpaseo/cli` package and uses local Node. An alternate Desktop installation can be selected with `PASEO_MULTI_HOST_RESOURCES=/absolute/path/to/resources`.

For another runtime, set both `PASEO_MULTI_HOST_CLIENT_MODULE` (absolute path to installed `@getpaseo/cli/dist/utils/client.js`) and `PASEO_MULTI_HOST_NODE` (absolute compatible Node executable). `cli HOST -- ...` reuses this detected runtime to launch the installed CLI JavaScript entrypoint. `PASEO_MULTI_HOST_CLI` can select a native executable; `.cmd` and `.bat` overrides are unsupported. JSON input/output uses UTF-8 on both macOS and Windows; registry files and saved-host imports also accept a UTF-8 BOM from Windows editors. Internal client compatibility is verified against 0.11.2 on those controllers and 0.13.0 from macOS (see the compatibility link in SKILL.md); Windows with 0.13 and Linux remain unverified.

Run records are written before terminal creation and kept after closing. `runs` lists them; `capture RUN_ID` recovers a terminal by its unique name even if the creation response was lost. Windows scripts whose encoded wrapper exceeds the command-line limit are refused before submission.

Aliases must be unique and match exactly, never by prefix. A connection keeps its expected `serverId`; re-register when a host's identity changes. Helper output redacts connection material, but remote script output can contain private data: do not repeat secrets from it.


## Saved successful runs

New `exec` records opt into save-before-close. On a zero exit code, `exec` or
`capture` requires an intact start marker and one final completion marker before
saving the terminal capture and exit code to `runs/results/<run-id>.json`. These
are terminal screen captures (not byte-exact stdout/stderr logs). If the beginning
has scrolled away, capture fails, or storage cannot be verified, the terminal stays
open. Receipts redact the same known connection credentials as command output;
other command output may be sensitive. POSIX files use 0600 and their directory
0700; on Windows keep the registry directory under private user ACLs.

The receipt is flushed, atomically published without overwriting, and read back
before terminal close. A durable close-attempt claim prevents concurrent capture
or a lost acknowledgment from issuing duplicate closes. `terminalState` is
`closed`, `retained`, or `close-unconfirmed`; an unconfirmed close needs inspection
and, if the terminal still exists, explicit `close`. `status: completed` and
`exitCode` retain their previous meaning. Repeated `capture` returns the saved
output even after the terminal is gone, after verifying the registered host.

`--keep-terminal` opts out when launching a service or doing interactive work.
Nonzero exits, interruption, input waits, and old run records keep the previous
manual-close behavior. No existing run is migrated and no timer sweeps old
terminals. If `exec --wait` returns while the command is running, call `capture`
later to finalize it; a disconnected controller cannot perform cleanup.

## Health and cleanup

`health HOST|all` runs a read-only payload through the same identity-checked
`exec` path. It reports CPU, available/total RAM, home-volume disk space, top
memory processes, same-name counts and parent/task cause hints, listening orphan
dev servers, owned completed terminals and OS/managed temp sizes. `all` uses up
to eight connections and retains individual offline/error results. JSON includes
a readable `table`; `--format table` prints only that table. Use `--workspace ID`
when the remote daemon requires one. Incomplete output fails closed; recover the
recorded run before retrying. A terminal is briefly created to collect metrics.

macOS/Linux need Bash and Python 3; psutil is optional. Standard OS commands
provide the fallback. Windows uses PowerShell 5.1/CIM and needs no Python;
process environments/elevation cannot be established by that fallback, so its
process candidates always require a pick. Missing listener information is marked
`portsKnown: false` and cannot establish an orphan dev server. Temp-size walks
stop after 20,000 entries and report partial results. No raw process command line
or environment is returned.

`cleanup HOST` lists candidates with stable IDs. `--port N` filters process
candidates by listening port; it never means “kill whatever owns this port”.
`--apply` acts on AUTO only. After showing the dry-run, use
`--apply --pick 'process:PID:START'` for individual CONFIRM candidates; multiple
IDs can be space or comma separated. Unknown, changed, filtered and protected
IDs are refused. There is no “all CONFIRM” switch.

- AUTO: a recorded, completed terminal with intact output; tagged same-user
  processes whose run ended or parent died; owned regular files older than two
  days directly in our managed `temp/` directory. `--keep-terminal` is preserved.
- CONFIRM: untagged node/python/bun with no live original parent, age at least six
  hours and a listening port; same-name pileups (three or more); Windows process
  candidates, including potentially elevated ones. Parent and scheduled-task
  hints identify causes to investigate, rather than selecting a whole name.
- NEVER: other users, system/service processes, daemon itself, SSH/remote session
  trees and recognized agent trees. Unknown ownership is protected. Running,
  truncated or unrecorded terminals are excluded. Any active/unknown agent in
  the complete snapshot defers process cleanup, even for explicit picks.

The target checks ownership, PID creation time, current eligibility and protected
children again. POSIX sends TERM, waits two seconds and then KILL to an isolated
whole process group; shared groups, escaped children or changed identities are
skipped. Windows uses local `taskkill /T`, grace, then `/T /F` with fresh identity
and tree checks. Access denied or uncertain termination is reported, never
retried with elevation. No registry or scheduled task is changed.

Managed roots are `~/.cache/paseo-multi` on POSIX and
`%LOCALAPPDATA%\paseo-multi` on Windows. Only their immediate `temp/` files are
quarantined, never arbitrary OS temp data. Locked or linked files are skipped;
quarantine is retained for seven days and purged only during an explicit apply.
JSONL action logs with reasons live at `<managed-root>/cleanup.jsonl`; terminal
cleanup logs and preserved complete captures live at `runs/cleanup.jsonl` on the
controller. Attempt logs are flushed before mutations. Treat these as private
user data. Health starts no background sweep and installs no schedule.

Every new exec exports `PASEO_MULTI_SESSION=<runId>` to its command tree and
keeps the `paseo-multi-<runId>` terminal prefix. POSIX launches the command in a
new session when Python 3 or `setsid` is available. Legacy commands sharing a
process group are protected from automated process termination. The current
controller can identify only its own run records; a matching terminal name
alone is insufficient ownership evidence.
