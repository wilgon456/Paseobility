# Ego Lite macOS startup recovery — 2026-11-17

A reported repeated Ego Lite error was inspected on a MacBook Pro with macOS
27.2.1, Ego Lite 0.6.3.14 and Paseo.app 0.15.4. This is a bounded diagnosis and
instruction correction; it is not an Ego runtime patch or a new public release.

## Observed

- Ego's CLI resolved to the installed 0.6.3.14 app and was executable. Both
  installed `ps-browser` copies matched the repository's previous source, and
  neither included a macOS execution-boundary check.
- Five relevant reports from the previous evening/early morning showed Ego
  startup `SIGABRT`, with `___RegisterApplication_block_invoke`,
  `_RegisterApplication` and `TransformProcessType` on the faulting stack.
  Their responsible process was `claude`, with the Claude Desktop coalition.
- The existing Ego browser process was still running. `ego-browser skill`
  succeeded through an authorized Paseo terminal and returned the complete
  v2.2.1 runtime guide, including its end marker.
- A single owned TaskSpace and `p1` navigated to the public example page. The
  first assertion waited for an assumed `h1` that the page did not contain;
  that failed with a selector timeout. Resuming the same space in a separate
  CLI round returned the expected URL/title and a semantic page snapshot.
  This was a probe assertion error, not a reproduced application crash.
- The final independent round finished the same TaskSpace: `closedSpace: true`,
  `closedManagedLabels: ['p1']`, no unmanaged tabs retained. No additional Ego
  crash report appeared during the page probe.

The first bounded inspection established a startup-registration failure and a
functioning host-terminal route. It did not establish the effective policy of
the failing session; no explicit denial appeared in its unified-log query.

## Follow-up: nested Codex workers identified

The Claude session history and the four referenced Codex worker logs were then
correlated with all five crash capture times. Claude Desktop was 5.11492.5; its
running Claude Code engine and the standalone Claude CLI were both 2.1.325.

- The parent launched workers with `codex exec -s workspace-write`.
- All four Codex turn contexts recorded `sandbox_policy.type: workspace-write`,
  `network_access: false`, and `approval_policy: never`.
- All five crash times matched `design-check` calls in these workers, within
  less than a second of each call. The macOS capture times were 23:04:16 on
  November 16, and 00:12:35, 00:19:28, 00:23:04 and 00:41:46 on November 17.
- Four interactive Ego CLI attempts in the same workers separately reported
  `Failed to start ego lite`, an invalid `com.apple.hiservices-xpcservice`
  connection and the CLI's default-agent-sandbox warning.

This identifies the failing execution route: browser processes were launched
inside restricted Codex children of Claude, rather than a general failure of
Claude or the running Ego instance. Correlation does not establish a separate
Claude product regression. Codex documents the macOS Seatbelt boundary in
[its sandbox guide](https://learn.chatgpt.com/docs/sandboxing); the
[process-spawn source](https://github.com/openai/codex/blob/main/codex-rs/core/src/spawn.rs)
defines the `CODEX_SANDBOX=seatbelt` marker used by the guard below.

## Correction and remaining check

The shipped `ps-browser` entry point now checks the macOS execution boundary
before any CLI invocation, including `skill`, and stops identical retries on
startup crashes or bootstrap denials. Its Ego reference separates registration
crash evidence from a confirmed sandbox denial and uses the host's normal
command-specific permission flow when policy permits it. It forbids changing
global security settings or routing around a denied permission. See
[Claude Code sandbox documentation](https://code.claude.com/docs/en/sandboxing)
for command boundaries and approved retry behavior.

The affected browser/design workflow files and checker were backed up and
applied to the affected computer's Codex-style and Claude skill directories.
The existing Claude global instruction block was expanded to require file-only
briefs for restricted Codex workers, preserving prior instructions.
The Claude settings file remained byte-identical. Browser/Paseo processes,
profiles, cookies and unrelated skills were not replaced or restarted.

The design checker now returns a tool error before browser discovery or
profile creation on macOS when `CODEX_SANDBOX=seatbelt` is present. This marker
check covers the identified Codex route; absence of the marker does not prove
that an arbitrary process is unrestricted. Browser discovery behavior elsewhere
is preserved. The workflow also requires file-only briefs for restricted
workers and keeps browser verification in an already-authorized controller.
It does not remove sandboxing or retry through a denied permission.

Validation includes the fifteen-skill catalog/frontmatter check, relative
links, clean diff whitespace and the design-check runtime regression suite.
The new regression verifies that a restricted macOS worker stops before any
browser discovery, profile or report output, while Linux/Windows and normal
macOS discovery retain their previous behavior. All five runtime tests passed
both locally and on the affected Mac.

An additional probe used the installed Codex 0.169.0 `sandbox` command with an
ephemeral read-only, network-disabled permission profile. Inside the actual
Seatbelt process, `CODEX_SANDBOX` was `seatbelt` and the checker returned
`BROWSER_SANDBOX_RESTRICTED`. A fake browser executable was supplied as a safety
sentinel; it was never launched and no render output was created. No new Ego
crash report appeared. The probe did not start a model agent or change any
persisted sandbox/approval settings.

The original user task still needs a fresh Claude Desktop session to establish
that the revised delegation instructions are followed. Existing sessions can
retain previously loaded instructions. A successful host-terminal round does
not prove that the failing session has obtained an allowed execution boundary.
Private crash reports, terminal receipts and the host instruction backup stay
on the affected computer/controller and are excluded from this repository.
