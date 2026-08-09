#!/usr/bin/env bash
set -euo pipefail

ROOT=""
INSTALL_CLAUDE=0
SKIP_CONTEXT=0
FORCE_CONTEXT=0
BACKUP_EXISTING=1
SKILLS=()

usage() {
  cat <<'EOF'
Usage:
  paseobility-init.sh [--root PATH] [--with-claude] [--no-context] [--force-context]
  paseobility-init.sh --skill <name> [--skill <name>] [--no-context]

Install Paseobility skills and generate project context.

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

copy_skills() {
  local target="$1"
  local backup_parent="$2"
  local backup_root backup_count skill source dest

  mkdir -p "$target"
  backup_root="$backup_parent/Paseobility-${VERSION}-$(date -u +"%Y%m%dT%H%M%SZ")"
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

  if [ "$backup_count" -gt 0 ]; then
    printf '[backup] saved %s existing skill(s) to %s\n' "$backup_count" "$backup_root"
  fi
}

copy_skills "$HOME/.agents/skills" "$HOME/.agents/skills-backups"

if [ "$INSTALL_CLAUDE" -eq 1 ]; then
  copy_skills "$HOME/.claude/skills" "$HOME/.claude/skills-backups"
else
  printf '[skip] ~/.claude/skills not touched. Pass --with-claude to install there.\n'
fi

printf '\n'
"$SCRIPT_DIR/paseobility-doctor.sh" --root "$ROOT"

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

cat <<'EOF'

Done.
Restart the agent session or reload integrations if newly installed skills do not appear immediately.
EOF
