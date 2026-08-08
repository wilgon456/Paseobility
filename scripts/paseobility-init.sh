#!/usr/bin/env bash
set -euo pipefail

ROOT=""
INSTALL_CLAUDE=0
SKIP_CONTEXT=0
FORCE_CONTEXT=0

usage() {
  cat <<'EOF'
Usage: paseobility-init.sh [--root PATH] [--with-claude] [--no-context] [--force-context]

Install Paseobility skills and generate project context.

Defaults:
  - installs skills to ~/.agents/skills
  - does not install to ~/.claude/skills unless --with-claude is passed
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
  mkdir -p "$target"
  cp -R "$REPO_ROOT"/skills/* "$target"/
  printf '[install] copied skills to %s\n' "$target"
}

copy_skills "$HOME/.agents/skills"

if [ "$INSTALL_CLAUDE" -eq 1 ]; then
  copy_skills "$HOME/.claude/skills"
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
