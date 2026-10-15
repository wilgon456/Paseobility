---
name: paseo-multi
description: Operate selected computers connected through Paseo, including remote status checks, agent inspection, shell commands, and coordinated software updates. Use when a request names multiple PCs or a specific remote Paseo host.
---

# Paseo Multi

Use the existing Paseo connection to operate the computer the user selected. A desktop client and its remote daemon are different machines; local MCP tools usually address only the current daemon.

## Select the target

Resolve this skill's installed directory first. Run `python3 <skill-dir>/scripts/hosts.py hosts` (Windows: `python` or `py -3`). The relative examples below assume this skill directory, not the user's project. It lists a private registry at `~/.config/paseo-multi/hosts.json`, including names, aliases, platform and expected server ID. This registry is a snapshot, not automatic discovery of newly added Desktop hosts. Register a new connection from a trusted pairing offer or saved-host export; see [connections.md](references/connections.md).

Resolve names exactly against labels or aliases. If a user's name matches more than one computer, ask which one while doing independent read-only work. Never substitute the local computer for an unreachable remote host. Expand a request for several PCs into an explicit target list; `all` is not a mutation target.

Run `python3 scripts/hosts.py status HOST` and `agents HOST`. Every remote operation checks the live server ID against the registry before continuing. Offline hosts remain reported as offline. Registered hosts are not necessarily online.

`agents` reads every page, with a bounded deadline/page count. Malformed or
repeated cursors, duplicate IDs or unknown permission counts refuse a complete
result. Lifecycle decisions must use that complete snapshot; CLI/MCP compact
lists are display views. A later page can contain active work.

## Operate

The helper uses the installed Paseo client and supports:

```bash
python3 scripts/hosts.py status MAC_MINI
python3 scripts/hosts.py agents VAX_COM
python3 scripts/hosts.py exec MAC_MINI --file /absolute/path/check.sh --wait 20
python3 scripts/hosts.py exec VAX_COM --file /absolute/path/check.ps1 --wait 20
python3 scripts/hosts.py runs
python3 scripts/hosts.py capture RUN_ID
python3 scripts/hosts.py close RUN_ID
python3 scripts/hosts.py restart HOST
python3 scripts/hosts.py cli HOST -- agent inspect AGENT_ID --json
```

Some daemons refuse a terminal without a workspace ("workspaceId is required"). Pick an active one with `cli HOST -- workspace ls --json` and pass `exec HOST --workspace WORKSPACE_ID ...`; workspaces can be archived meanwhile, so re-list on "not active".

The retained terminal keeps the whole script in its command line until `close`. When a script carries a credential, close it with `close RUN_ID --interrupt` as soon as it completes, and never print the secret itself.

`exec` chooses Bash for registered macOS/Linux targets and PowerShell for Windows; an explicit `--shell` can override this. Scripts run on the remote machine. Use its paths, not the controller's paths. The helper retains its terminal until explicitly closed, reports a unique completion marker with the remote exit code, and only closes a terminal recorded as its own. `--wait` observes for up to 45 seconds; a timeout is `running`, not success or a retry instruction. Capture later, then close after completion. Do not retry a mutation merely because its response or connection was lost: inspect its installed state and logs first.

Before sending a command, the helper saves and flushes its recovery record. A local storage failure prevents dispatch. If the creation response is lost, use `runs`, then `capture RUN_ID`; capture resolves the terminal by its unique recorded name. A missing terminal means the outcome is unknown. Oversized Windows commands are rejected before dispatch; stage a shorter script on the selected host instead.

Capture returns a terminal screen, not raw stdout bytes. Paseo may insert spaces between wide characters, including Korean. Do not use captured text for byte-exact file transfer or integrity checks; read a checksum or an encoded artifact instead.

For agent/project/workspace/schedule operations, use `cli HOST -- ...` with installed `paseo ... --help` or the Paseo skill. Agent creation must follow the user's selected provider/profile. Acknowledged agent creation or daemon restart does not prove the requested task completed. The helper's generic CLI route refuses daemon lifecycle commands; use the dedicated guarded restart command or an authorized host-side script.

Treat the user's requested operation and target list as authorization for necessary steps within that scope. Do not ask again for already authorized updates. A request to inspect or list PCs does not authorize restarting them. Preserve existing settings, credentials, user data and unrelated work.

Before a restart/update, inspect active agents. The `restart` helper refuses active or unknown states. If the user says to apply after work finishes, use a host-local one-time idle watcher; do not cancel that work or rely on an indefinite controller session. Follow [updates.md](references/updates.md) for this mode. User instructions to restart immediately override the default waiting policy; do not silently infer that instruction from a general update request.

Only `idle`, `error` and `closed` are confirmed inactive lifecycle states for
the reviewed client. Permission attention blocks restart even if its separate
attention boolean is false. The server has no atomic idle-only restart guard;
fresh reads reduce the race but cannot prevent new work between read and restart.

## Verify and report

For an update, distinguish source version, installed app/CLI version, live daemon version and queued work. Report the proven layer per PC, failures and pending work. Verify by a fresh connection and direct installed-state readback. Keep pairing offers, connection keys and passwords in the private registry, outside this skill and public reports.

The bundled adapter is verified with macOS and Windows controllers using Paseo 0.11.2, with each controlling Mac and Windows targets. Linux controllers and targets are unverified. It imports Paseo's internal client; if a later release changes that interface, fail with a dependency error and inspect the installed client rather than downloading an arbitrary substitute. Runtime configuration and connection import are documented in [connections.md](references/connections.md).
