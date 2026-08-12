#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/spyware-check.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/paseo-spyware-shell-test.XXXXXX")"

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  echo "not ok - $1" >&2
  exit 1
}

TARGET="$TEST_ROOT/target"
mkdir -p "$TARGET"
printf '%s\n' 'plain fixture' >"$TARGET/fixture.txt"

BLOCKER="$TEST_ROOT/not-a-directory"
printf '%s\n' 'block directory creation' >"$BLOCKER"
if bash "$SCRIPT" --target "$TARGET" --out "$BLOCKER/report" \
  >"$TEST_ROOT/invalid-out.stdout" 2>"$TEST_ROOT/invalid-out.stderr"; then
  fail "unwritable report path returned success"
fi
grep -q 'could not create report directory' "$TEST_ROOT/invalid-out.stderr" ||
  fail "unwritable report path did not explain the failure"
echo "ok 1 - required report setup fails closed"

MOCK_BIN="$TEST_ROOT/mock-bin"
REPORT_DIR="$TEST_ROOT/report"
mkdir -p "$MOCK_BIN"
cat >"$MOCK_BIN/gitleaks" <<'EOF'
#!/usr/bin/env bash
echo "fixture scanner failure" >&2
exit 23
EOF
chmod +x "$MOCK_BIN/gitleaks"

PATH="$MOCK_BIN:$PATH" bash "$SCRIPT" --target "$TARGET" --out "$REPORT_DIR" \
  >"$TEST_ROOT/optional.stdout" 2>"$TEST_ROOT/optional.stderr" ||
  fail "optional scanner failure stopped the helper"
test -f "$REPORT_DIR/report.md" || fail "report was not written"
grep -q '== gitleaks ==' "$REPORT_DIR/tools.log" ||
  fail "optional scanner was not recorded"
grep -q 'exit=23' "$REPORT_DIR/tools.log" ||
  fail "optional scanner exit status was not recorded"
echo "ok 2 - optional scanner failure is recorded and scanning continues"
