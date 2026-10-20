# Coordinated updates

Update the requested products on the requested computers, in parallel where hosts are independent. Updating Paseo and updating a manager repository are separate operations; a manager update does not imply running every managed CLI updater.

1. Check each target's platform/architecture and whether its daemon is Desktop-managed, standalone or containerized. Use the official latest stable release at execution time, not a remembered version. Read a checkout's own instructions before changing it; keep uncommitted work, schedules, PATH and configuration.
2. Download the official artifact on the target, check its published hash (and signature when the platform has one; do not call an unsigned artifact signed), and keep the current install as a rollback copy.
3. Check active agents. For "after this task", install a host-local one-time watcher: bounded polling (about 30 seconds), no repeat after success, a log, and fail-closed if agent states cannot be read. For "now", restart even with active agents (`restart --force` or the installer's own relaunch) and report what was interrupted.
4. Stop only the app/daemon the install topology needs, replace, relaunch. Desktop may start the daemon asynchronously; a transient `DAEMON_NOT_RUNNING` right after install is not failure — check installed version and the live runtime before retrying.
5. Read back app/CLI and daemon versions separately over a fresh connection. For a manager, run its doctor and confirm preserved settings. Report mismatches plainly.
6. Remove this operation's watcher after success; keep logs and backups. A queued update stays pending until readback shows the new version.

macOS: one-time LaunchAgent with `RunAtLoad: true`, `KeepAlive: false`. Windows: preserve scheduled-task principal/settings and use host paths. Linux/containers: the installation's own process manager. Do not reuse a PID, path or restart command from an old run.
