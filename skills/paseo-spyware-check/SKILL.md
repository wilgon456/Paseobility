---
name: paseo-spyware-check
description: >-
  Inspect a GitHub repository or local checkout for spyware, malware, credential
  theft and supply-chain risks before running it. Use for explicit repository
  safety reviews; perform static inspection without executing target code.
---

# Paseo Spyware Check

Static review only: never run the target's install, build, test, lifecycle
scripts, modules or binaries. That is the point of this skill. A static verdict
is not a guarantee of safety.

## Scan

Start with the stdlib helper (on Windows use `python` or `py -3`):

```text
python3 <skill-dir>/scripts/spyware-check.py <github-url-or-local-path> --timeout 180
```

It writes a redacted JSON receipt (schema v2): source commit or local snapshot,
findings with severity, policy decision, truncation. Exit 0 means the receipt
was written, not that the repo is safe. `--timeout` bounds each Git call.

For deeper coverage, use the shell/PowerShell helpers and optional scanners in
[references/review.md](references/review.md). Their heuristics differ from
schema v2; report them separately rather than adding counts. If a scanner is
missing and the extra coverage is worth it, install it with the bundled
installer and say what you installed. For confidential or offline targets, skip
tools that download rules or send package inventories.

## Review the evidence

- Note the exact URL/path, commit and scope. A shallow clone lacks history; a
  local snapshot can include uncommitted files. Check skipped, binary,
  generated and truncated content before trusting zero findings.
- Read the code paths that touch credentials, persistence, remote code or
  network sends. Docs and API-key variable names alone are not malicious;
  correlate with callers, triggers and destinations.
- Target-controlled scanner exclusions or config can hide findings; inspect
  them.
- Never verify found secrets against providers, print secret values, or upload
  raw matches, logs or report directories. Cite paths, line numbers and
  redacted evidence. Never run `osv-scanner fix`.

## Report

Verdict with evidence, the checked revision, tools that ran/failed/were
missing, coverage gaps, and the next sensible step. Separate real credential
material, reachable high-risk behavior, suspicious patterns and items needing
manual review. A clean complete pass is "no high-risk indicators found in this
static pass"; missing or truncated coverage cannot support an unqualified clean
verdict. Running the target, rotating credentials or remediation are the
user's call after the report.
