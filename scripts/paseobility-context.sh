#!/usr/bin/env bash
set -euo pipefail

ROOT=""
OUT_DIR=""
FORCE=0
STDOUT=0
MAX_LINES="${PASEOBILITY_MAX_LINES:-80}"

usage() {
  cat <<'EOF'
Usage: paseobility-context.sh [--root PATH] [--out DIR] [--force] [--stdout]

Generate lightweight project context artifacts:
  .paseobility/context.md
  .paseobility/commands.md
  .paseobility/project-map.md
  .paseobility/bootstrap-log.md

By default existing files are not overwritten.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --root)
      ROOT="${2:-}"
      shift 2
      ;;
    --out)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --stdout)
      STDOUT=1
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

if [ -z "$ROOT" ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    ROOT="$(git rev-parse --show-toplevel)"
  else
    ROOT="$(pwd -P)"
  fi
fi

ROOT="$(cd "$ROOT" && pwd -P)"
if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$ROOT/.paseobility"
fi

mkdir -p "$OUT_DIR"

relpath() {
  local path="$1"
  case "$path" in
    "$ROOT"/*) printf '%s\n' "${path#"$ROOT"/}" ;;
    *) printf '%s\n' "$path" ;;
  esac
}

write_file() {
  local path="$1"
  if [ -e "$path" ] && [ "$FORCE" -ne 1 ]; then
    printf '[skip] %s exists. Use --force to overwrite.\n' "$(relpath "$path")" >&2
    return 0
  fi
  cat > "$path"
  printf '[write] %s\n' "$(relpath "$path")" >&2
}

project_files() {
  find "$ROOT" \
    \( -path "$ROOT/.git" -o -path "$ROOT/node_modules" -o -path "$ROOT/vendor" -o -path "$ROOT/dist" -o -path "$ROOT/build" -o -path "$ROOT/target" -o -path "$ROOT/.paseobility" \) -prune \
    -o -type f -print | sort
}

instruction_files() {
  project_files | while IFS= read -r file; do
    rel="$(relpath "$file")"
    case "$rel" in
      README|README.*|AGENTS.md|CLAUDE.md|GEMINI.md|.github/copilot-instructions.md|.cursor/rules/*|docs/*.md|docs/*/*.md)
        printf '%s\n' "$file"
        ;;
    esac
  done
}

headings_for() {
  local file="$1"
  awk '
    /^#{1,6}[[:space:]]/ { print; count++; if (count >= 20) exit }
  ' "$file" 2>/dev/null || true
}

excerpt_for() {
  local file="$1"
  sed -n "1,${MAX_LINES}p" "$file" 2>/dev/null || true
}

package_manager() {
  if [ -f "$ROOT/pnpm-lock.yaml" ]; then
    printf 'pnpm\n'
  elif [ -f "$ROOT/yarn.lock" ]; then
    printf 'yarn\n'
  elif [ -f "$ROOT/package-lock.json" ]; then
    printf 'npm\n'
  elif [ -f "$ROOT/package.json" ]; then
    printf 'npm\n'
  else
    printf 'unknown\n'
  fi
}

json_scripts() {
  if [ ! -f "$ROOT/package.json" ]; then
    return 0
  fi
  node -e '
const fs = require("fs");
const path = process.argv[1];
try {
  const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
  const scripts = pkg.scripts || {};
  for (const [name, command] of Object.entries(scripts)) {
    console.log(`- ${name}: \`${command}\``);
  }
} catch (err) {
  process.exit(0);
}
' "$ROOT/package.json" 2>/dev/null || true
}

generate_context() {
  cat <<EOF
# Paseobility Project Context

Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Root: \`$ROOT\`

## Repository

EOF
  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf -- '- Git root: `%s`\n' "$(git -C "$ROOT" rev-parse --show-toplevel)"
    remotes="$(git -C "$ROOT" remote -v 2>/dev/null | sed 's/^/  /' || true)"
    if [ -n "$remotes" ]; then
      printf -- '- Remotes:\n%s\n' "$remotes"
    fi
    status_short="$(git -C "$ROOT" status --short 2>/dev/null || true)"
    if [ -n "$status_short" ]; then
      printf -- '- Working tree has changes:\n```text\n%s\n```\n' "$status_short"
    else
      printf -- '- Working tree: clean\n'
    fi
  else
    printf -- '- Not a git repository\n'
  fi

  cat <<EOF

## Detected Files

EOF
  for file in package.json pyproject.toml requirements.txt Cargo.toml go.mod Makefile justfile Taskfile.yml paseo.json AGENTS.md CLAUDE.md .github/copilot-instructions.md; do
    if [ -e "$ROOT/$file" ]; then
      printf -- '- `%s`\n' "$file"
    fi
  done
  [ -d "$ROOT/docs" ] && printf -- '- `docs/`\n'
  [ -d "$ROOT/.cursor/rules" ] && printf -- '- `.cursor/rules/`\n'

  cat <<EOF

## Instruction Sources

EOF
  instruction_files | while IFS= read -r file; do
    rel="$(relpath "$file")"
    printf '\n### `%s`\n\n' "$rel"
    headings="$(headings_for "$file")"
    if [ -n "$headings" ]; then
      printf 'Headings:\n\n```text\n%s\n```\n\n' "$headings"
    fi
    printf 'Excerpt:\n\n```text\n'
    excerpt_for "$file"
    printf '\n```\n'
  done

  cat <<'EOF'

## Workspace Hygiene

- Prefer working inside the current project root.
- Do not create sibling projects, external clones, or new workspaces unless the user asks or the task clearly requires it.
- If work happens outside this root, report the exact path and reason.
EOF
}

generate_commands() {
  pm="$(package_manager)"
  cat <<EOF
# Paseobility Command Hints

Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Root: \`$ROOT\`

## Package Manager

- Detected: \`$pm\`

EOF
  if [ -f "$ROOT/package.json" ]; then
    cat <<'EOF'
## package.json Scripts

EOF
    scripts="$(json_scripts)"
    if [ -n "$scripts" ]; then
      printf '%s\n' "$scripts"
    else
      printf 'No scripts detected or package.json could not be parsed.\n'
    fi
    cat <<EOF

## Common Node Commands

- Install: \`$pm install\`
- Dev: check package scripts above; common names are \`dev\`, \`start\`
- Test: check package scripts above; common names are \`test\`, \`lint\`, \`typecheck\`

EOF
  fi

  if [ -f "$ROOT/pyproject.toml" ] || [ -f "$ROOT/requirements.txt" ]; then
    cat <<'EOF'
## Python Signals

- Dependency files found. Inspect `pyproject.toml` or `requirements*.txt` before installing.
- Common checks: `python -m pytest`, `python -m ruff check .`, `python -m mypy .`

EOF
  fi

  if [ -f "$ROOT/Cargo.toml" ]; then
    cat <<'EOF'
## Rust Signals

- Common checks: `cargo test`, `cargo clippy`, `cargo fmt --check`

EOF
  fi

  if [ -f "$ROOT/go.mod" ]; then
    cat <<'EOF'
## Go Signals

- Common checks: `go test ./...`, `go vet ./...`, `gofmt -w`

EOF
  fi

  if [ -f "$ROOT/Makefile" ]; then
    cat <<'EOF'
## Makefile Targets

```text
EOF
    awk -F: '/^[A-Za-z0-9_.-]+:/ { print $1 }' "$ROOT/Makefile" | sort -u | sed -n '1,80p'
    cat <<'EOF'
```

EOF
  fi

  if [ -f "$ROOT/paseo.json" ]; then
    cat <<'EOF'
## Paseo Scripts

`paseo.json` exists. Inspect it before adding or changing scripts.

EOF
  else
    cat <<'EOF'
## Paseo Scripts

No `paseo.json` detected. Use the command hints above or add a project-specific `paseo.json` after verifying the local Paseo setup.

EOF
  fi
}

generate_project_map() {
  cat <<EOF
# Paseobility Project Map

Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Root: \`$ROOT\`

## Top-Level Entries

EOF
  find "$ROOT" -maxdepth 1 -mindepth 1 | sort | while IFS= read -r entry; do
    rel="$(relpath "$entry")"
    if [ -d "$entry" ]; then
      printf -- '- `%s/`\n' "$rel"
    else
      printf -- '- `%s`\n' "$rel"
    fi
  done

  cat <<'EOF'

## Source-Like Files

```text
EOF
  project_files | sed "s#^$ROOT/##" | sed -n '1,250p'
  cat <<'EOF'
```
EOF
}

generate_log() {
  cat <<EOF
# Paseobility Bootstrap Log

Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Root: \`$ROOT\`

## System

- OS: \`$(uname -s)\`
- Arch: \`$(uname -m)\`
EOF
  cat <<'EOF'

## Generated Artifacts

- `.paseobility/context.md`
- `.paseobility/commands.md`
- `.paseobility/project-map.md`
- `.paseobility/bootstrap-log.md`
EOF
}

if [ "$STDOUT" -eq 1 ]; then
  generate_context
else
  generate_context | write_file "$OUT_DIR/context.md"
  generate_commands | write_file "$OUT_DIR/commands.md"
  generate_project_map | write_file "$OUT_DIR/project-map.md"
  generate_log | write_file "$OUT_DIR/bootstrap-log.md"
fi
