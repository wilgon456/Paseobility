#!/usr/bin/env bash
set -euo pipefail

ROOT=""

usage() {
  cat <<'EOF'
Usage: paseobility-doctor.sh [--root PATH]

Diagnose the current project for Paseobility/Paseo setup.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --root)
      ROOT="${2:-}"
      shift 2
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

if [ -z "$ROOT" ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    ROOT="$(git rev-parse --show-toplevel)"
  else
    ROOT="$(pwd -P)"
  fi
fi

ROOT="$(cd "$ROOT" && pwd -P)"

status() {
  printf '[%s] %s\n' "$1" "$2"
}

section() {
  printf '\n== %s ==\n' "$1"
}

find_paseo_cli() {
  if command -v paseo >/dev/null 2>&1; then
    command -v paseo
    return 0
  fi

  local app_cli="/Applications/Paseo.app/Contents/Resources/bin/paseo"
  if [ -x "$app_cli" ]; then
    printf '%s\n' "$app_cli"
    return 0
  fi

  return 1
}

section "Project"
status "root" "$ROOT"

if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  status "git" "inside work tree"
  status "git_root" "$(git -C "$ROOT" rev-parse --show-toplevel)"
  if git -C "$ROOT" remote -v >/dev/null 2>&1; then
    git -C "$ROOT" remote -v | sed 's/^/[remote] /'
  fi
  git -C "$ROOT" status --short | sed 's/^/[status] /' || true
else
  status "git" "not a git repository"
fi

section "System"
OS="$(uname -s)"
ARCH="$(uname -m)"
status "os" "$OS"
status "arch" "$ARCH"

if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH" = "x86_64" ]; then
    status "mac" "Intel detected"
  elif [ "$ARCH" = "arm64" ]; then
    status "mac" "Apple Silicon detected"
  else
    status "mac" "unknown macOS architecture"
  fi
else
  status "mac" "not macOS"
fi

section "Paseo"
if PASEO_CLI="$(find_paseo_cli)"; then
  status "paseo_cli" "$PASEO_CLI"
  "$PASEO_CLI" --version 2>/dev/null | sed 's/^/[paseo_version] /' || status "paseo_version" "unavailable"
else
  status "paseo_cli" "not found"
  status "hint" "Install/open Paseo or ensure the bundled CLI is linked into PATH."
fi

if [ -f "$ROOT/paseo.json" ]; then
  status "paseo_json" "found"
else
  status "paseo_json" "not found"
fi

section "Skill Directories"
for dir in "$HOME/.agents/skills" "$HOME/.claude/skills"; do
  if [ -d "$dir" ]; then
    status "exists" "$dir"
  else
    status "missing" "$dir"
  fi
done

section "Project Signals"
for file in \
  "package.json" \
  "pnpm-lock.yaml" \
  "yarn.lock" \
  "package-lock.json" \
  "pyproject.toml" \
  "requirements.txt" \
  "Cargo.toml" \
  "go.mod" \
  "Makefile" \
  "justfile" \
  "Taskfile.yml" \
  "AGENTS.md" \
  "CLAUDE.md" \
  ".github/copilot-instructions.md"; do
  if [ -e "$ROOT/$file" ]; then
    status "found" "$file"
  fi
done

if [ -d "$ROOT/docs" ]; then
  status "found" "docs/"
fi
if [ -d "$ROOT/.cursor/rules" ]; then
  status "found" ".cursor/rules/"
fi

section "Next Steps"
status "context" "./scripts/paseobility-context.sh --root \"$ROOT\""
status "init" "./scripts/paseobility-init.sh --root \"$ROOT\""
