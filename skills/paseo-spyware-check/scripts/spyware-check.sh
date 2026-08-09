#!/usr/bin/env bash
set -u

usage() {
  cat <<'USAGE'
Usage:
  spyware-check.sh --target <github-url-or-local-path> [--out <report-dir>] [--keep]

Read-only static spyware/supply-chain triage for a GitHub URL or local repo.
This script does not run target project install/build/test/app code.
USAGE
}

TARGET=""
OUT_DIR=""
KEEP=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --out)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --keep)
      KEEP=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "--target is required" >&2
  usage >&2
  exit 2
fi

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/paseo-spyware.XXXXXX")"
if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/paseo-spyware-report.XXXXXX")"
fi
mkdir -p "$OUT_DIR"

cleanup() {
  if [ "$KEEP" -ne 1 ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

is_url() {
  case "$1" in
    http://*|https://*|git@*) return 0 ;;
    *) return 1 ;;
  esac
}

REPO_DIR=""
if is_url "$TARGET"; then
  REPO_DIR="$WORK_DIR/repo"
  git clone --depth 1 "$TARGET" "$REPO_DIR" >"$OUT_DIR/git-clone.log" 2>&1
  clone_status=$?
  if [ "$clone_status" -ne 0 ]; then
    echo "git clone failed. See $OUT_DIR/git-clone.log" >&2
    exit "$clone_status"
  fi
else
  REPO_DIR="$(cd "$TARGET" 2>/dev/null && pwd)"
  if [ -z "$REPO_DIR" ]; then
    echo "target path does not exist: $TARGET" >&2
    exit 2
  fi
fi

REPORT="$OUT_DIR/report.md"
RAW="$OUT_DIR/raw-findings.txt"
: >"$RAW"

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

append_cmd_status() {
  tool="$1"
  if has_cmd "$tool"; then
    echo "- $tool: available" >>"$REPORT"
  else
    echo "- $tool: missing" >>"$REPORT"
  fi
}

run_optional() {
  name="$1"
  shift
  echo "== $name ==" >>"$OUT_DIR/tools.log"
  "$@" >>"$OUT_DIR/tools.log" 2>&1
  status=$?
  echo "exit=$status" >>"$OUT_DIR/tools.log"
  echo >>"$OUT_DIR/tools.log"
  return 0
}

{
  echo "# Paseo Spyware Check Report"
  echo
  echo "- target: \`$TARGET\`"
  echo "- repo: \`$REPO_DIR\`"
  echo "- generated: \`$timestamp\`"
  if git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "- commit: \`$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true)\`"
    echo "- remote:"
    git -C "$REPO_DIR" remote -v 2>/dev/null | sed 's/^/  - /' || true
  fi
  echo
  echo "## Scanner Availability"
} >"$REPORT"

for tool in rg git gitleaks trufflehog semgrep osv-scanner trivy shellcheck yara; do
  append_cmd_status "$tool"
done

{
  echo
  echo "## Inventory"
  echo
  echo "### High-signal files"
} >>"$REPORT"

if has_cmd rg; then
  rg --files "$REPO_DIR" |
    rg '(^|/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum|pyproject\.toml|requirements.*\.txt|Pipfile|poetry\.lock|Makefile|justfile|Taskfile\.ya?ml|Dockerfile|docker-compose\.ya?ml|AGENTS\.md|CLAUDE\.md)$|(^|/)\.github/workflows/.*\.ya?ml$|\.(sh|bash|zsh|ps1|js|ts|mjs|cjs|py)$' |
    sed 's/^/- /' >>"$REPORT" || true
else
  find "$REPO_DIR" -type f |
    sed "s#^$REPO_DIR/##" |
    sed 's/^/- /' >>"$REPORT"
fi

if has_cmd gitleaks; then
  run_optional "gitleaks" gitleaks detect --source "$REPO_DIR" --redact --report-format json --report-path "$OUT_DIR/gitleaks.json"
fi

if has_cmd trufflehog; then
  run_optional "trufflehog" trufflehog filesystem "$REPO_DIR" --no-verification --json
fi

if has_cmd semgrep; then
  run_optional "semgrep" semgrep scan --config p/security-audit --json --output "$OUT_DIR/semgrep.json" "$REPO_DIR"
fi

if has_cmd osv-scanner; then
  run_optional "osv-scanner" osv-scanner scan source -r "$REPO_DIR" --format json --output "$OUT_DIR/osv-scanner.json"
fi

if has_cmd trivy; then
  run_optional "trivy" trivy fs --scanners vuln,secret,misconfig --format json --output "$OUT_DIR/trivy.json" "$REPO_DIR"
fi

if has_cmd shellcheck; then
  if has_cmd rg; then
    rg --files "$REPO_DIR" | rg '\.(sh|bash|zsh)$' >"$OUT_DIR/shell-files.txt" || true
  else
    find "$REPO_DIR" -type f \( -name '*.sh' -o -name '*.bash' -o -name '*.zsh' \) >"$OUT_DIR/shell-files.txt"
  fi
  while IFS= read -r file; do
    [ -n "$file" ] && run_optional "shellcheck $file" shellcheck "$file"
  done <"$OUT_DIR/shell-files.txt"
fi

if has_cmd rg; then
  {
    echo "## Suspicious Pattern Matches"
    echo
  } >>"$REPORT"

  rg -n --hidden --glob '!/.git/**' --glob '!node_modules/**' --glob '!vendor/**' \
    'preinstall|postinstall|prepare|prepublish|curl[[:space:]].*\|[[:space:]]*(sh|bash|zsh)|wget[[:space:]].*\|[[:space:]]*(sh|bash|zsh)|Invoke-Expression|[^A-Za-z]iex[^A-Za-z]|DownloadString|EncodedCommand|Start-Process.*Hidden|New-ScheduledTask|CurrentVersion\\Run|launchctl|LaunchAgents|crontab|systemctl|child_process|eval\(|Function\(|base64|atob|Buffer\.from|process\.env|\.ssh|\.aws|\.npmrc|GITHUB_TOKEN|NPM_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|api[_-]?key|webhook|pastebin|discord(app)?\.com/api/webhooks' \
    "$REPO_DIR" >"$RAW" 2>/dev/null || true

  if [ -s "$RAW" ]; then
    sed "s#^$REPO_DIR/##" "$RAW" | sed 's/^/- `/' | sed 's/$/`/' >>"$REPORT"
  else
    echo "- No fallback pattern matches found." >>"$REPORT"
  fi
else
  echo >>"$REPORT"
  echo "## Suspicious Pattern Matches" >>"$REPORT"
  echo >>"$REPORT"
  echo "- ripgrep is not installed; fallback pattern scan was skipped." >>"$REPORT"
fi

{
  echo
  echo "## Notes"
  echo
  echo "- This report is static triage, not proof of safety."
  echo "- The target repo's code was not executed."
  echo "- Review optional scanner logs in \`$OUT_DIR\`."
} >>"$REPORT"

echo "$REPORT"
