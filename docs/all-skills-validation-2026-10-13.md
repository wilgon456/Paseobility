# Existing nine skills: completed review and follow-up — 2026-10-13

The initial v2.9.1 refresh changed four skills and shared checks, not all nine
individually. This v2.9.2 follow-up covers the remaining five. The separately
added `paseo-god` workflow is preserved and outside this nine-skill audit.
No third-party skill or scanner binary was installed for this follow-up.

## Per-skill coverage

| Existing skill | Applied improvement | Proven boundary |
| --- | --- | --- |
| agent-cleanup | Full snapshots, identity/ownership, permission/unknown-state guards, exact dispatch and verification | Prior 23 decision tests, 8 adapter fixtures and live Mac read-only preview |
| browser | CloakBrowser 0.6.2 / Playwright 1.64.0, accessible targets, bounded result waits | Prior actual isolated browser fixtures and cleanup, not anti-bot/platform certification |
| cua | Driver 0.34.1 / immutable installer, element tokens and capture contracts | Prior installed Mac version/doctor/permissions/schema; no fresh full native GUI E2E |
| design | Refreshed Vercel guidance, explicit upstream-only test skips and runtime/data CI | Prior 137 runtime tests, 4 explicit skips, data checks and 13 browser selfchecks |
| multi | All agent pages with deadline/limit/schema/duplicate guards; conservative restart states and permission attention | 13 adapter tests, including later-page active work, missing/repeated cursor and malformed counts; no remote restart performed |
| orchestration | Writer ownership/base tracking, lost-creation reconciliation, evidence-based completion and integrated-tree verification | Official MCP/worktree contract comparison; no new agents, tournament or merge executed |
| project | Nested instructions, declared manager/devEngines priority, ambiguous-manager refusal and package cwd handoff | 5 generated-context fixture tests; generated hints are not executed installs |
| share | Porcelain-classified concurrency retry only, bounded processes, uncertainty stop and retained commit | 20 tests, including real two-clone/bare-remote concurrent push and both artifacts preserved |
| spyware-check | Current Gitleaks/OSV flags, no OSV resolver/remediation, Semgrep metrics off, source content omitted from fallback reports; concise entrypoint | 13 stdlib tests, 3 POSIX helper checks and PowerShell fixture in CI; optional scanner invocation uses stubs, not live vulnerability databases |

## Official research and resulting decisions

- [Paseo v0.11.2 data model](https://github.com/getpaseo/paseo/blob/v0.11.2/docs/data-model.md),
  [MCP contract](https://github.com/getpaseo/paseo/blob/v0.11.2/public-docs/mcp.md)
  and [workspaces](https://github.com/getpaseo/paseo/blob/v0.11.2/public-docs/worktrees.md):
  compact lists cannot certify all active work; workspace placement and parentage
  differ; profile fields must be materialized into actual advertised settings.
  Restart and archive reads/actions remain separate and can race new work.
- [Git worktrees](https://git-scm.com/docs/git-worktree): working files can be
  isolated while refs/objects are shared. Keep unique/active work and validate
  the integrated result rather than accepting a worker's isolated test claim.
- [AGENTS.md](https://agents.md/) and
  [Corepack package metadata](https://github.com/nodejs/corepack#when-authoring-packages):
  module instructions and declared package managers must precede generated
  summaries and lockfile guesses. The helper reads metadata only; it does not
  enable/download Corepack or execute arbitrary packageManager URLs.
- [Git push output](https://git-scm.com/docs/git-push#_output): distinguish a
  non-fast-forward rejection from authentication, server rejection and uncertain
  transport results. Only proven concurrent ref updates are automatically retried.
- [Gitleaks commands](https://github.com/gitleaks/gitleaks#commands): replace
  deprecated `detect` with current-tree `dir`; history is a separate scope.
- [OSV v2 usage](https://google.github.io/osv-scanner/usage/): use `--output-file`
  and `--no-resolve`; exclude `fix`, which can invoke package-manager behavior.
  [Offline mode](https://google.github.io/osv-scanner/usage/offline-mode/)
  requires appropriate local databases and missing databases remain failed coverage.
- [Semgrep metrics](https://semgrep.dev/docs/metrics): `--metrics=off` suppresses
  rule metrics, while Registry rule retrieval still uses the network.
  [TruffleHog](https://github.com/trufflesecurity/trufflehog) retains no-verification
  scanning; raw tool reports may include secrets and remain private local evidence.

Earlier source research and runtime evidence for the first four skills remain
in [dependency validation](dependency-validation-2026-10-13.md) and
[initial improvements](skill-improvements-2026-10-13.md). Those dated records
describe their original preparation boundary, not the entire nine-skill audit.

## Limits

Local final validation ran 60 shared Python tests: 59 passed and the PowerShell
fixture skipped because this Mac has no PowerShell. The 13 Multi tests, 20 Share
tests (including real local Git concurrency), 13 stdlib scanner tests, 3 POSIX
helper checks and all nine skill-creator validations passed. Existing Mac/Windows
CI runs the revised shared/Multi/Share suites; its Windows shared suite runs the
new PowerShell fixture under available pwsh and Windows PowerShell.

The revised five skills were installed to both `.agents/skills` and
`.claude/skills` with timestamped `Paseobility-2.9.2-*` backups. All nine audited
installed skill trees match source after excluding bytecode/OS metadata. No
Paseo daemon restart or Cua runtime update was performed in this follow-up.

Source/frontmatter, regression fixtures, installed file matching and CI are
separate from provider discovery or complete real-world task performance.
Orchestration and project instructions were reviewed and made more precise,
not benchmarked across every provider. Linux live operation, new Windows remote
dispatch, native Cua GUI end-to-end and third-party scanners against production
targets are not established by these changes. Online rule/database scans can
make network requests; metrics-off/no-resolve is not a universal offline claim.
