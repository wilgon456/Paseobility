---
name: paseo-spyware-check
description: >-
  Inspect a GitHub repository or local checkout for spyware, malware, credential
  theft and supply-chain risks before running it. Use for explicit repository
  safety reviews; perform static inspection without executing target code.
---

# Paseo Spyware Check

Inspect the selected repository without running its install, build, test,
lifecycle scripts or binaries. A static risk verdict is not a guarantee of safety.
This skill is independent of Paseo's daemon and workspace lifecycle.

## Choose the smallest useful scan

Resolve this skill's installed directory, then prefer the cross-platform,
Python-stdlib helper for a redacted machine-readable receipt:

```text
python3 <skill-dir>/scripts/spyware-check.py <github-url-or-local-path> --timeout 180
```

On Windows use `python` or `py -3`. Schema v2 records immutable GitHub source
identity or a local snapshot, finding IDs/severity, policy decision, truncation
and a receipt digest. Review the receipt's coverage and decision: exit 0 means
receipt generation succeeded, not that the repository is safe. A receipt digest
checks integrity, not trusted authorship or a signature.
`--timeout` bounds each Git subprocess, not the entire filesystem snapshot/scan.

Use [extended scanner/manual review](references/review.md) only when optional
scanner coverage, a shell/PowerShell report or deeper manual inspection is useful.
Those helpers have broader heuristics and different classification from schema
v2; do not combine their counts as equivalent results. No scanner binaries/rules
are vendored. Keep existing scanner versions unless an update is requested.

## Review the evidence

- Identify the exact URL/path, commit and scan scope. A shallow clone lacks full
  history; a local snapshot can include uncommitted files. Check skipped, large,
  binary, generated and truncated content before interpreting zero findings.
- Inspect executable/configuration paths that can read credentials, persist,
  fetch/run remote code or send data. Documentation examples and API-key variable
  names alone do not prove malicious behavior. Correlate findings with callers,
  execution triggers and network destinations.
- Use only installed optional scanners. Show the exact package-manager command
  before requesting scanner installation; do not execute project code as a scan.
- Optional tools may download rules/databases or query package inventories.
  For confidential/offline work, use the stdlib helper and local rules/cached
  databases only; missing coverage remains missing. Never run OSV `fix` here.
- Do not verify found secrets against providers. Never print secret values or
  upload raw matches, scanner logs or full report directories. Summarize with
  paths, line numbers and redacted evidence. Inspect target-controlled scanner
  exclusions/configuration; suppressed findings are not proof of safety.

## Report and stop

Give the verdict and concrete evidence, exact checked revision/snapshot,
available/failed/missing tools, coverage limits and the next justified action.
Distinguish actual credential material, reachable high-risk behavior, suspicious
patterns and items needing manual review. On a clean complete static pass, say
"no high-risk indicators found in this static pass". Missing/truncated/failed
coverage cannot support an unqualified clean verdict. No automatic install,
remediation, target execution or credential rotation follows from this skill.
