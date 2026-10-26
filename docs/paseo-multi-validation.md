# Paseo Multi validation — 2026-10-11

Scope: the local Paseobility v2.9.0 source and its `paseo-multi` adapter, using
the installed Paseo 0.11.2 client. These results do not establish every skill's
compatibility or an independently published release.

| Controller | Target | Result |
| --- | --- | --- |
| Apple Silicon macOS, bundled Electron runtime | MacBook Pro | Shell probe, exit 3, recorded capture and close passed |
| Apple Silicon macOS, bundled Electron runtime | Intel Mac mini | Initial running state, later completion with exit 4, capture and close passed |
| Apple Silicon macOS, bundled Electron runtime | Windows | PowerShell probe, exit 7, recorded capture and close passed |
| Windows, Python 3.12 and per-user Paseo Electron runtime | Intel Mac mini | Shell probe, exit 6, recorded capture and close passed |
| Windows, Python 3.12 and per-user Paseo Electron runtime | Same Windows computer through its registered daemon | PowerShell probe, exit 5, recorded capture and close passed |
| Windows controller | Intel Mac mini | Generic CLI `terminal ls --all --json` passed |
| Linux controller or target | Any | Unverified: no connected Linux machine or Linux runtime was available |

Nonzero probe exits above were intentional. Korean characters were preserved,
but screen capture inserted spaces between wide characters on tested targets.
It is not a byte-exact stdout channel. Tests used existing connections and
temporary, private registries; pairing material is excluded from this report.

## Automated checks

- Shared Python suite: 49 passed on macOS.
- Adapter suite: 12 passed on macOS and the same 12 passed on Windows.
- Node adapter syntax check and skill validator passed on macOS.
- Isolated single-skill installation to Codex and Claude targets was checked
  against source file contents.

The adapter suite covers identity mismatch, active/unknown/permission restart
guards, finished attention, redaction, target override refusal, terminal
ownership, a storage failure before dispatch, lost creation acknowledgement,
Windows command size refusal, and UTF-8 registry/output handling.

## Fixes prompted by testing

- Persist and flush the recovery record before terminal creation; refuse
  dispatch when local storage fails. Recover a lost creation response using
  the recorded unique terminal name.
- Discover the Windows Desktop runtime and launch the CLI JavaScript entrypoint
  through it, avoiding native execution of `.cmd` wrappers.
- Read registries/scripts and communicate JSON as UTF-8, including Windows
  Python stdout. The previous default encoding failed on Korean output.
- Refuse an oversized encoded PowerShell command before terminal creation.
- Allow the RPC timeout to cover connection setup plus the requested observation
  window; a timeout remains an unknown outcome requiring inspection.

## Limits

This is a tested preview for the listed Mac/Windows combinations. The adapter
still imports an internal Paseo client interface, so newer versions require
re-verification. Linux, a fresh Windows skill installation via the PowerShell
installer, and automatic discovery of newly added Desktop hosts are not proven
by this run. Restart safety was tested with fixtures; no real daemon restart,
CLI software update, active-agent cancellation, or user-data cleanup was
performed during this validation. Historical update evidence is separate.

## Save-before-close regression coverage (2026-10-26)

New runs carry `cleanupPolicy: saved-success-v1`; older records are not migrated.
The adapter suite covers verified private result persistence before close,
zero/nonzero exit, cancellation, unfinished/input-wait captures, truncated or
ambiguous output, storage collision, fsync/readback failure, private-directory
and symlink refusal, corrupt receipts, lost/refused close replies, concurrent
and repeated capture, sequential runs, `--keep-terminal`, and PowerShell wrapper
construction. The POSIX suite also executes the generated Bash wrapper with
quoted multiline output and explicit success/failure exits in a test-owned
process group.

These tests use fake daemon clients and temporary state, never existing hosts.
The new auto-close path has not been exercised against a live Paseo daemon or a
real Windows PowerShell terminal; the earlier live compatibility observations
above do not certify this new behavior. Complete local macOS CI-equivalent
suites pass; Windows adapter behavior is checked in repository CI.
