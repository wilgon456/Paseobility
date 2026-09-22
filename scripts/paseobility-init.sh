#!/usr/bin/env bash
set -euo pipefail

ROOT=""
INSTALL_CLAUDE=0
SKIP_CONTEXT=0
FORCE_CONTEXT=0
BACKUP_EXISTING=1
MIGRATE_SKILLS=0
TARGET_HOME="$HOME"
CHECK_PASEO=1
SKIP_CUA_DRIVER=0
ALLOW_HOST_RUNTIME=0
SKILLS=()

usage() {
  cat <<'EOF'
Usage:
  paseobility-init.sh [--root PATH] [--with-claude] [--no-context] [--force-context]
  paseobility-init.sh --skill <name> [--skill <name>] [--no-context]
  paseobility-init.sh --migrate-skills [--with-claude] --no-context

Options:
  --migrate-skills    Move retired skill directories to backup after installing replacements
  --target-home PATH Install skills under this home (custom target; host runtime skipped by default)
  --no-paseo-check   Skip live Paseo CLI/daemon checks
  --skip-cua-driver     Do not install the Cua Driver runtime (docs-only/offline)
  --allow-host-runtime  Allow real host runtime installation even when the
                        skills --target-home is custom

Install Paseobility skills and generate project context.

Runtime:
  Selecting paseo-cua or installing the full package also ensures the trycua
  Cua Driver exists (reused if present; never auto-upgraded). An ordinary
  --skill <other> install does not. A custom --target-home skips the real host
  runtime by default and logs why; --allow-host-runtime instead installs the
  driver on the real host at its normal host binary location.

Defaults:
  - installs skills to ~/.agents/skills
  - does not install to ~/.claude/skills unless --with-claude is passed
  - backs up existing same-name skill directories before replacement
  - generates .paseobility context files without overwriting existing files
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --root)
      ROOT="${2:-}"
      shift 2
      ;;
    --with-claude)
      INSTALL_CLAUDE=1
      shift
      ;;
    --no-context)
      SKIP_CONTEXT=1
      shift
      ;;
    --force-context)
      FORCE_CONTEXT=1
      shift
      ;;
    --skill)
      SKILLS+=("${2:-}")
      shift 2
      ;;
    --no-backup)
      BACKUP_EXISTING=0
      shift
      ;;
    --migrate-skills)
      MIGRATE_SKILLS=1
      shift
      ;;
    --target-home)
      TARGET_HOME="${2:?--target-home requires a path}"
      shift 2
      ;;
    --no-paseo-check)
      CHECK_PASEO=0
      shift
      ;;
    --skip-cua-driver)
      SKIP_CUA_DRIVER=1
      shift
      ;;
    --allow-host-runtime)
      ALLOW_HOST_RUNTIME=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[ -n "$TARGET_HOME" ] || { echo "--target-home must not be empty" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
VERSION="$(sed -n '1p' "$REPO_ROOT/VERSION" 2>/dev/null || printf 'dev')"

if [ -z "$ROOT" ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    ROOT="$(git rev-parse --show-toplevel)"
  else
    ROOT="$(pwd -P)"
  fi
fi
ROOT="$(cd "$ROOT" && pwd -P)"

selected_skill() {
  local requested="$1" candidate
  [ "${#SKILLS[@]}" -eq 0 ] && return 0
  for candidate in "${SKILLS[@]}"; do
    [ "$candidate" = "$requested" ] && return 0
  done
  return 1
}

# Preflight every retired entry before copying anything. Moving a directory
# preserves local edits; symlink roots and unknown ownership fail closed.
retired_entries() {
  printf '%s\n' 'paseo-agent-tournament:paseo-orchestration' \
    'paseo-session-brief:paseo-project' 'paseo-project-bootstrap:paseo-project' \
    'paseo-computer-use:paseo-browser' 'paseo-skill-save:'
}

check_retired() {
  local target="$1" old replacement dest
  [ "$MIGRATE_SKILLS" -eq 1 ] || return 0
  [ ! -L "$target" ] || { echo "Refusing symlink skill root: $target" >&2; return 1; }
  while IFS=: read -r old replacement; do
    selected_skill "$replacement" || continue
    if [ -n "$replacement" ] && [ ! -f "$REPO_ROOT/skills/$replacement/SKILL.md" ]; then
      echo "Replacement source missing: $replacement" >&2
      return 1
    fi
    dest="$target/$old"
    [ -e "$dest" ] || [ -L "$dest" ] || continue
    if [ -L "$dest" ] || [ ! -d "$dest" ] || [ -L "$dest/SKILL.md" ] ||
       [ "$(head -n 1 "$dest/SKILL.md")" != '---' ] ||
       ! sed -n '2,/^---$/p' "$dest/SKILL.md" | grep -Eq "^name: ['\"]?$old['\"]?[[:space:]]*$"; then
      echo "Refusing unrecognized retired skill: $dest" >&2
      return 1
    fi
  done < <(retired_entries)
}

check_retired "$TARGET_HOME/.agents/skills"
if [ "$INSTALL_CLAUDE" -eq 1 ]; then check_retired "$TARGET_HOME/.claude/skills"; fi

copy_skills() {
  local target="$1"
  local backup_parent="$2"
  local backup_root backup_count skill source dest

  mkdir -p "$target"
  backup_root="$backup_parent/Paseobility-${VERSION}-$(date -u +"%Y%m%dT%H%M%SZ")-$$"
  backup_count=0

  if [ "${#SKILLS[@]}" -eq 0 ]; then
    while IFS= read -r source; do
      skill="$(basename "$source")"
      dest="$target/$skill"
      if [ -e "$dest" ] && [ "$BACKUP_EXISTING" -eq 1 ]; then
        mkdir -p "$backup_root"
        cp -R "$dest" "$backup_root/"
        backup_count=$((backup_count + 1))
      fi
      rm -rf "$dest"
      cp -R "$source" "$target/"
      printf '[install] copied %s to %s\n' "$skill" "$target"
    done < <(find "$REPO_ROOT/skills" -mindepth 1 -maxdepth 1 -type d | sort)
  else
    for skill in "${SKILLS[@]}"; do
      if [ -z "$skill" ]; then
        continue
      fi
      source="$REPO_ROOT/skills/$skill"
      dest="$target/$skill"
      if [ ! -f "$source/SKILL.md" ]; then
        printf '[error] skill not found or missing SKILL.md: %s\n' "$skill" >&2
        exit 2
      fi
      if [ -e "$dest" ] && [ "$BACKUP_EXISTING" -eq 1 ]; then
        mkdir -p "$backup_root"
        cp -R "$dest" "$backup_root/"
        backup_count=$((backup_count + 1))
      fi
      rm -rf "$dest"
      cp -R "$source" "$target/"
      printf '[install] copied %s to %s\n' "$skill" "$target"
    done
  fi

  if [ "$MIGRATE_SKILLS" -eq 1 ]; then
    local old replacement retired
    while IFS=: read -r old replacement; do
      selected_skill "$replacement" || continue
      retired="$target/$old"
      [ -d "$retired" ] || continue
      if [ -n "$replacement" ] && [ ! -f "$target/$replacement/SKILL.md" ]; then
        echo "Replacement missing; preserving $retired" >&2
        return 1
      fi
      mkdir -p "$backup_root"
      [ ! -e "$backup_root/$old" ] || { echo "Backup collision: $old" >&2; return 1; }
      mv "$retired" "$backup_root/$old"
      backup_count=$((backup_count + 1))
      printf '[migrate] moved %s to %s\n' "$retired" "$backup_root/$old"
    done < <(retired_entries)
  fi

  if [ "$backup_count" -gt 0 ]; then
    printf '[backup] saved %s existing skill(s) to %s\n' "$backup_count" "$backup_root"
  fi
}

copy_skills "$TARGET_HOME/.agents/skills" "$TARGET_HOME/.agents/skills-backups"

if [ "$INSTALL_CLAUDE" -eq 1 ]; then
  copy_skills "$TARGET_HOME/.claude/skills" "$TARGET_HOME/.claude/skills-backups"
else
  printf '[skip] ~/.claude/skills not touched. Pass --with-claude to install there.\n'
fi

# Ensure the Cua Driver runtime when the paseo-cua skill (or the full package)
# is selected. Idempotent: an existing driver is reused, never auto-upgraded.
RUNTIME_STATUS="not-requested"
wants_runtime=0
if [ "${#SKILLS[@]}" -eq 0 ] || selected_skill paseo-cua; then
  wants_runtime=1
fi

printf '\n'
if [ "$wants_runtime" -eq 0 ]; then
  printf '[skip] Cua Driver runtime not requested for this skill selection.\n'
elif [ "$SKIP_CUA_DRIVER" -eq 1 ]; then
  printf '[skip] Cua Driver runtime install skipped (--skip-cua-driver).\n'
  RUNTIME_STATUS="skipped"
elif [ "$TARGET_HOME" != "$HOME" ] && [ "$ALLOW_HOST_RUNTIME" -eq 0 ]; then
  printf '[skip] Cua Driver runtime install skipped for custom --target-home (%s); pass --allow-host-runtime to install on the real host.\n' "$TARGET_HOME"
  RUNTIME_STATUS="skipped-custom-target"
else
  # Host runtime: use the driver's normal host binary location (or the
  # PASEOBILITY_CUA_BIN_DIR test hook). The custom --target-home only redirects
  # the skill copy, so it must not redirect the driver.
  if "$SCRIPT_DIR/paseobility-cua-driver.sh"; then
    RUNTIME_STATUS="installed"
  else
    RUNTIME_STATUS="failed"
  fi
fi

printf '\n'
if [ "$CHECK_PASEO" -eq 1 ]; then
  # Diagnostics are optional and must never fail an otherwise successful skill
  # install (for example on a host without Python 3).
  if ! "$SCRIPT_DIR/paseobility-doctor.sh" --root "$ROOT" --target-home "$TARGET_HOME"; then
    printf '[warn] diagnostics unavailable (paseobility-doctor.sh exited non-zero); skills were still copied.\n' >&2
  fi
else
  printf '[skip] live Paseo checks skipped.\n'
fi

if [ "$SKIP_CONTEXT" -eq 0 ]; then
  printf '\n'
  if [ "$FORCE_CONTEXT" -eq 1 ]; then
    "$SCRIPT_DIR/paseobility-context.sh" --root "$ROOT" --force
  else
    "$SCRIPT_DIR/paseobility-context.sh" --root "$ROOT"
  fi
else
  printf '[skip] context generation skipped.\n'
fi

if [ "$RUNTIME_STATUS" = "failed" ]; then
  cat <<'EOF'

Skills were copied, but the Cua Driver runtime setup failed.
Installation may be incomplete (partial files possible). Resolve the error above and
re-run, or pass --skip-cua-driver to install skills only.
EOF
  exit 1
fi

cat <<'EOF'

Done.
Restart the agent session or reload integrations if newly installed skills do not appear immediately.
EOF
