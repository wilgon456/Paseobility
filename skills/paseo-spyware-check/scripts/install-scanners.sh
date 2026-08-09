#!/usr/bin/env bash
set -u

usage() {
  cat <<'USAGE'
Usage:
  install-scanners.sh --dry-run
  install-scanners.sh --yes

Installs the recommended open-source scanner set for /paseo-spyware-check.
This script never uses sudo and never executes code from the target repository.
USAGE
}

MODE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --yes)
      MODE="yes"
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

if [ -z "$MODE" ]; then
  echo "choose --dry-run or --yes" >&2
  usage >&2
  exit 2
fi

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

print_status() {
  for tool in gitleaks trufflehog semgrep osv-scanner trivy shellcheck yara; do
    if has_cmd "$tool"; then
      printf '[installed] %s -> %s\n' "$tool" "$(command -v "$tool")"
    else
      printf '[missing]   %s\n' "$tool"
    fi
  done
}

echo "== Current scanner status =="
print_status
echo

if has_cmd brew; then
  commands=(
    "brew install gitleaks"
    "brew install trufflehog"
    "brew install semgrep"
    "brew install osv-scanner"
    "brew install trivy"
    "brew install shellcheck"
    "brew install yara"
  )
else
  commands=(
    "Install these tools from their official package instructions:"
    "gitleaks trufflehog semgrep osv-scanner trivy shellcheck yara"
  )
fi

echo "== Planned commands =="
for cmd in "${commands[@]}"; do
  echo "$cmd"
done
echo

if [ "$MODE" = "dry-run" ]; then
  echo "[dry-run] No changes made."
  exit 0
fi

if ! has_cmd brew; then
  echo "automatic install currently requires Homebrew for a no-sudo path" >&2
  echo "use --dry-run output as manual guidance for this system" >&2
  exit 1
fi

for cmd in "${commands[@]}"; do
  echo "[run] $cmd"
  # shellcheck disable=SC2086
  $cmd
done

echo
echo "== Scanner status after install =="
print_status
