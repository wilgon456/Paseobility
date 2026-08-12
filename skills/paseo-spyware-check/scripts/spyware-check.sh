#!/usr/bin/env bash
# Required setup and report writes fail fast. Optional scanner failures are
# captured by run_optional so the remaining scanners and fallback scan run.
set -euo pipefail

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
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/paseo-spyware.XXXXXX")" || {
  echo "could not create temporary workspace" >&2
  exit 1
}

cleanup() {
  if [ "$KEEP" -ne 1 ]; then
    rm -rf -- "$WORK_DIR" || true
  fi
}
trap cleanup EXIT

if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/paseo-spyware-report.XXXXXX")" || {
    echo "could not create report directory" >&2
    exit 1
  }
fi
mkdir -p -- "$OUT_DIR" || {
  echo "could not create report directory: $OUT_DIR" >&2
  exit 1
}

is_url() {
  case "$1" in
    http://*|https://*|git@*) return 0 ;;
    *) return 1 ;;
  esac
}

REPO_DIR=""
if is_url "$TARGET"; then
  REPO_DIR="$WORK_DIR/repo"
  if git clone --depth 1 "$TARGET" "$REPO_DIR" >"$OUT_DIR/git-clone.log" 2>&1; then
    :
  else
    clone_status=$?
    echo "git clone failed. See $OUT_DIR/git-clone.log" >&2
    exit "$clone_status"
  fi
else
  if REPO_DIR="$(cd "$TARGET" 2>/dev/null && pwd)"; then
    :
  else
    echo "target path does not exist: $TARGET" >&2
    exit 2
  fi
fi

REPORT="$OUT_DIR/report.md"
RAW="$OUT_DIR/raw-findings.txt"
CLASSIFIED="$OUT_DIR/classified-findings.tsv"
TOOLS_LOG="$OUT_DIR/tools.log"
if ! { : >"$RAW" && : >"$CLASSIFIED" && : >"$TOOLS_LOG"; }; then
  echo "could not initialize report files in: $OUT_DIR" >&2
  exit 1
fi

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
  {
    echo "== $name =="
    if "$@" 2>&1; then
      scanner_status=0
    else
      scanner_status=$?
    fi
    echo "exit=$scanner_status"
    echo
  } >>"$TOOLS_LOG"
  return 0
}

classify_finding_line() {
  line="$1"
  rel_line="$(printf '%s\n' "$line" | sed "s#^$REPO_DIR/##")"
  path="${rel_line%%:*}"
  text="${rel_line#*:}"
  text="${text#*:}"

  severity="Medium"
  reason="suspicious static pattern"

  case "$path" in
    README.md|README.*|skills/paseo-spyware-check/SKILL.md|skills/paseo-spyware-check/scripts/*)
      severity="Info"
      reason="self-reference or scanner documentation"
      ;;
  esac

  if [ "$severity" != "Info" ]; then
    if printf '%s\n' "$text" | grep -Eq 'curl .*\|.*(sh|bash|zsh)|wget .*\|.*(sh|bash|zsh)|EncodedCommand|DownloadString|Invoke-Expression|Start-Process.*Hidden|New-ScheduledTask|CurrentVersion\\Run|launchctl|LaunchAgents|crontab|systemctl'; then
      severity="High"
      reason="remote execution, hidden execution, or persistence indicator"
    elif printf '%s\n' "$text" | grep -Eq '\.ssh|\.aws|\.npmrc|GITHUB_TOKEN|NPM_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|api[_-]?key|webhook|pastebin|discord(app)?\.com/api/webhooks'; then
      severity="High"
      reason="credential or exfiltration indicator"
    elif printf '%s\n' "$text" | grep -Eq 'preinstall|postinstall|prepare|prepublish'; then
      severity="Medium"
      reason="install-time script indicator"
    elif printf '%s\n' "$text" | grep -Eq 'child_process|eval\(|Function\(|base64|atob|Buffer\.from|process\.env'; then
      severity="Medium"
      reason="dynamic execution, obfuscation, or environment access indicator"
    fi
  fi

  printf '%s\t%s\t%s\n' "$severity" "$rel_line" "$reason" >>"$CLASSIFIED"
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
    while IFS= read -r line; do
      classify_finding_line "$line"
    done <"$RAW"

    high_count="$(awk -F '\t' '$1 == "High" { count++ } END { print count + 0 }' "$CLASSIFIED")"
    medium_count="$(awk -F '\t' '$1 == "Medium" { count++ } END { print count + 0 }' "$CLASSIFIED")"
    info_count="$(awk -F '\t' '$1 == "Info" { count++ } END { print count + 0 }' "$CLASSIFIED")"
    if [ "$high_count" -gt 0 ]; then
      verdict_hint="High"
    elif [ "$medium_count" -gt 0 ]; then
      verdict_hint="Medium"
    else
      verdict_hint="Low"
    fi

    {
      echo "## Finding Summary"
      echo
      echo "- Verdict hint: \`$verdict_hint\`"
      echo "- High: \`$high_count\`"
      echo "- Medium: \`$medium_count\`"
      echo "- Info: \`$info_count\`"
      echo
      echo "Treat this as triage output. Final judgement still requires manual review of the evidence and optional scanner logs."
      echo
    } >>"$REPORT"

    {
      echo "## Classified Findings"
      echo
      echo "| Severity | Evidence | Reason |"
      echo "| --- | --- | --- |"
      while IFS="$(printf '\t')" read -r severity evidence reason; do
        escaped_evidence="$(printf '%s\n' "$evidence" | sed 's/|/\\|/g')"
        printf '| %s | `%s` | %s |\n' "$severity" "$escaped_evidence" "$reason"
      done <"$CLASSIFIED"
      echo
    } >>"$REPORT"

    echo "## Raw Pattern Matches" >>"$REPORT"
    echo >>"$REPORT"
    sed "s#^$REPO_DIR/##" "$RAW" | sed 's/^/- `/' | sed 's/$/`/' >>"$REPORT"
  else
    {
      echo "## Finding Summary"
      echo
      echo "- Verdict hint: \`Low\`"
      echo "- High: \`0\`"
      echo "- Medium: \`0\`"
      echo "- Info: \`0\`"
      echo
    } >>"$REPORT"
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
