# Setup and context generation

Use for requested initial setup, environment repair, skill installation, or
context generation. Skip unrelated steps; installing skills does not also
require generating project context.

## Available helpers

Use helpers from a verified Paseobility checkout, not a guessed path relative
to an installed skill. If that checkout is unavailable, inspect the relevant
sources directly and report which helper operations were not run.

| Helper | Purpose |
| --- | --- |
| `scripts/paseobility-doctor.sh --root <project>` | Read-only environment diagnosis |
| `scripts/paseobility-context.sh --root <project>` | Generate context/commands/project-map/bootstrap-log under `.paseobility/` |
| `scripts/paseobility-init.sh --no-context` | Install skills with overwrite backups |
| `scripts/paseobility-install.ps1` | Native Windows installation |

For context generation, reuse existing files after checking freshness. The
helper preserves existing files unless `--force` is requested; do not call an
unchanged old artifact freshly generated. Read only output sections needed for
the requested work instead of rereading every source excerpt.

## Installation or update

- Read the checkout's `AGENTS.md` for installation-specific requirements.
- Use `--skill <name>` / `-Skill <name>` for a selected skill. Install Claude
  copies only when requested or updating existing Claude copies in scope.
- `--migrate-skills` / `-MigrateSkills` moves selected predecessor directories
  into backup after installing replacements. It preserves private library state.
- For isolated validation use `--target-home <temporary-directory> --no-context
  --no-paseo-check` or `-TargetHome <temporary-directory> -NoPaseoCheck`.
- Keep the backup path. Verify installed files; tell the user to start a new
  agent session or reload integrations. Do not restart Paseo.

## Platform boundaries

On macOS/Linux, check OS/architecture and CLI availability only as relevant.
On Windows use the PowerShell installer. Bash doctor/context scripts require a
compatible shell; otherwise inspect README, applicable agent instructions,
relevant docs, and command manifests directly. Do not claim native PowerShell
context generation or a successful environment repair without evidence.

Report what changed, generated artifacts, verified commands/runtime identity,
backups, and remaining setup issues. Do not append a separate brief workflow.
