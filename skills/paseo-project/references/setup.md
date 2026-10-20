# Setup and context generation

Use for initial setup, environment repair, skill installation, or context
generation. Do what the outcome needs: install dependencies with the declared
manager, run builds/tests, and start servers to verify, then stop the ones you
started. Skill installation alone does not require generating context.

## Available helpers

Use helpers from a verified Paseobility checkout, not a guessed path relative
to an installed skill. Without one, do the equivalent work directly and say
which helpers were not run.

| Helper | Purpose |
| --- | --- |
| `scripts/paseobility-doctor.sh --root <project>` | Read-only environment diagnosis |
| `scripts/paseobility-context.sh --root <project>` | Generate context/commands/project-map/bootstrap-log under `.paseobility/` |
| `scripts/paseobility-init.sh --no-context` | Install skills with overwrite backups |
| `scripts/paseobility-install.ps1` | Native Windows installation |

The context helper skips existing files; pass `--force` when they are stale,
and do not call an unchanged old file freshly generated. Improve its output by
hand where it is thin: it copies bounded excerpts, not a full monorepo audit.
It prefers a declared `packageManager` over lockfiles and emits no guessed
install command when they conflict.

Use the repository's declared package manager, runtime and lockfile; never
generate a second lockfile. Report install, build, test and runtime results
separately; an install or a healthy daemon alone does not prove the repair.

## Installation or update

- Read the checkout's `AGENTS.md` for installation-specific requirements.
- Use `--skill <name>` / `-Skill <name>` for a selected skill. Add Claude
  copies (`--with-claude` / `-WithClaude`) when requested or when Claude Code
  is in use (`~/.claude/skills` exists).
- `--migrate-skills` / `-MigrateSkills` moves selected predecessor directories
  into backup after installing replacements. It preserves private library state.
- For isolated validation use `--target-home <temporary-directory> --no-context
  --no-paseo-check` or `-TargetHome <temporary-directory> -NoPaseoCheck`.
- Keep the backup path. Verify installed files; tell the user to start a new
  agent session or reload integrations. Do not restart Paseo.

## Platform boundaries

On Windows use the PowerShell installer. Bash doctor/context scripts need a
compatible shell; without one, write the context files directly from README,
agent instructions and manifests. Do not claim a repair without evidence.

Report what changed, generated artifacts, verified commands/runtime identity,
backups and remaining setup issues.
