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

For another runtime, set both `PASEO_MULTI_HOST_CLIENT_MODULE` (absolute path to installed `@getpaseo/cli/dist/utils/client.js`) and `PASEO_MULTI_HOST_NODE` (absolute compatible Node executable). `cli HOST -- ...` reuses this detected runtime to launch the installed CLI JavaScript entrypoint. `PASEO_MULTI_HOST_CLI` can select a native executable; `.cmd` and `.bat` overrides are unsupported. JSON input/output uses UTF-8 on both macOS and Windows. Internal client compatibility is verified against 0.11.2 on those controllers; Linux remains unverified.

Run records are written before terminal creation and kept after closing. `runs` lists them; `capture RUN_ID` recovers a terminal by its unique name even if the creation response was lost. Windows scripts whose encoded wrapper exceeds the command-line limit are refused before submission.

Aliases must be unique and match exactly, never by prefix. A connection keeps its expected `serverId`; re-register when a host's identity changes. Helper output redacts connection material, but remote script output can contain private data: do not repeat secrets from it.
