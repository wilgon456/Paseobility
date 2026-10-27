# Setup and context generation

Use for initial setup, environment repair, skill installation, or context
generation. Do what the outcome needs: install dependencies with the declared
manager, run builds/tests, and start servers to verify, then stop the ones you
started. Skill installation alone does not require generating context.

## Helpers in a Paseobility checkout

The helpers below are repository-root files, not bundled scripts in the
installed skill copy, so a relative path from the skill directory is not the
package root. Before using a helper, confirm the checkout contains
`paseobility.json`, `VERSION` and `skills/`, and that the helper file itself
exists. If no verified checkout is present, do not run, guess, download or
reconstruct these commands.

| Helper | Purpose |
| --- | --- |
| `scripts/paseobility-doctor.sh --root <project>` | Read-only environment diagnosis |
| `scripts/paseobility-context.sh --root <project>` | Generate context/commands/project-map/bootstrap-log under `.paseobility/` |
| `scripts/paseobility-init.sh --no-context` | Install skills with overwrite backups |
| `scripts/paseobility-install.ps1` | Native Windows installation |

When the helper is present, the context helper skips existing files; pass
`--force` when they are stale, and do not call an unchanged old file freshly
generated. Improve its output by hand where it is thin: it copies bounded
excerpts, not a full monorepo audit. It prefers a declared `packageManager` over
lockfiles and emits no guessed install command when they conflict.

Without a checkout, reach the same outcome with the target project's own tools:
read README, agent instructions and manifests; run the project's declared
install, build and test commands; inspect Paseo state with the read-only checks
in [SKILL.md](../SKILL.md); and write `.paseobility/` context files directly
from those sources. Report which helpers were unavailable and which checks you
ran manually instead.

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
