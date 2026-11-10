#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/spyware-check.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/paseo-spyware-shell-test.XXXXXX")"
# Allow only required utilities. Never discover/run the user's scanners, rules
# or network-capable tools. Use actual utility paths, not a copied host PATH.
BASE_BIN="$TEST_ROOT/base-bin"
mkdir -p "$BASE_BIN"
for tool in bash cat chmod date dirname find git grep mkdir mktemp rm sed awk; do
  resolved="$(command -v "$tool")" || { echo "missing test utility: $tool" >&2; exit 1; }
  ln -s "$resolved" "$BASE_BIN/$tool"
done
export PATH="$BASE_BIN"
unset RIPGREP_CONFIG_PATH

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

bash "$SCRIPT" --target "$TARGET" --out "$TEST_ROOT/no-tools" >"$TEST_ROOT/no-tools.stdout"
grep -q 'ripgrep is not installed; fallback pattern scan was skipped' "$TEST_ROOT/no-tools/report.md" ||
  fail "missing rg was not disclosed"
if grep -q 'Verdict hint:.*Low' "$TEST_ROOT/no-tools/report.md"; then
  fail "missing coverage was called clean"
fi

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

cat >"$MOCK_BIN/osv-scanner" <<'EOF'
#!/usr/bin/env bash
set -eu
[ "$1" = scan ] && [ "$2" = source ] || exit 90
shift 2
out=""
bounded=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-file) out="$2"; shift 2 ;;
    --no-resolve) bounded=1; shift ;;
    --output) exit 91 ;;
    *) shift ;;
  esac
done
[ "$bounded" -eq 1 ] && [ -n "$out" ] || exit 92
printf '%s\n' '{"results":[]}' >"$out"
EOF
chmod +x "$MOCK_BIN/osv-scanner"
printf '%s\n' 'GITHUB_TOKEN="fixture-sensitive-value-123"' >"$TARGET/fixture.js"
# The report contract is independent of whether a runner installs optional rg.
# Supply a deterministic match containing actual fixture bytes to exercise
# classification/location retention and ensure source values do not escape.
cat >"$MOCK_BIN/rg" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  --files) printf '%s\n' "$FIXTURE_MATCH_FILE" ;;
  -n) printf '%s:1:%s\n' "$FIXTURE_MATCH_FILE" "$(cat "$FIXTURE_MATCH_FILE")" ;;
  *) cat ;; # Inventory filter: preserve filenames supplied on stdin.
esac
EOF
chmod +x "$MOCK_BIN/rg"
export FIXTURE_MATCH_FILE="$TARGET/fixture.js"
PATH="$MOCK_BIN:$PATH" bash "$SCRIPT" --target "$TARGET" --out "$TEST_ROOT/current-report" \
  >"$TEST_ROOT/current.stdout" 2>"$TEST_ROOT/current.stderr" ||
  fail "current scanner invocation failed"
test -s "$TEST_ROOT/current-report/osv-scanner.json" || fail "OSV output flag did not write its report"
grep -q 'fixture.js:1:' "$TEST_ROOT/current-report/report.md" || fail "report lost finding location"
if grep -q 'fixture-sensitive-value-123' "$TEST_ROOT/current-report/report.md"; then
  fail "fallback report exposed source contents"
fi
echo "ok 3 - current OSV invocation writes output and report retains location without source values"

# Repeated fresh runs must each produce the finding without accumulating rows.
for repeat in 1 2 3; do
  report="$TEST_ROOT/repeat-$repeat"
  PATH="$MOCK_BIN:$BASE_BIN" bash "$SCRIPT" --target "$TARGET" --out "$report" >"$TEST_ROOT/repeat.stdout"
  count="$(grep -c 'fixture.js:1:' "$report/report.md")"
  [ "$count" = 1 ] || fail "repeat accumulated or lost findings"
done
sentinel="$TEST_ROOT/current-report/preserved.json"
printf '%s\n' 'prior-artifact' >"$sentinel"
if PATH="$MOCK_BIN:$BASE_BIN" bash "$SCRIPT" --target "$TARGET" --out "$TEST_ROOT/current-report" \
    >"$TEST_ROOT/reuse.stdout" 2>"$TEST_ROOT/reuse.stderr"; then
  fail "nonempty report directory was reused"
fi
[ "$(cat "$sentinel")" = prior-artifact ] || fail "prior scan evidence was modified"
grep -q 'report directory must be empty' "$TEST_ROOT/reuse.stderr" || fail "reuse did not explain refusal"
if PATH="$MOCK_BIN:$BASE_BIN" bash "$SCRIPT" --target "$TARGET" --out "$TARGET/report" \
    >"$TEST_ROOT/nested.stdout" 2>"$TEST_ROOT/nested.stderr"; then
  fail "target-contained report permitted self-scanning"
fi
grep -q 'outside the scanned target' "$TEST_ROOT/nested.stderr" || fail "nested output did not explain refusal"
echo "ok 4 - missing tools, repeated fresh scans and preserved prior reports are deterministic"

cat >"$MOCK_BIN/rg" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  -n) echo 'fixture read error' >&2; exit 2 ;;
  --files) exit 0 ;;
  *) cat ;;
esac
EOF
if PATH="$MOCK_BIN:$BASE_BIN" bash "$SCRIPT" --target "$TARGET" --out "$TEST_ROOT/rg-error" \
    >"$TEST_ROOT/error.stdout" 2>"$TEST_ROOT/error.stderr"; then
  fail "failed fallback scan returned success"
fi
grep -q 'coverage is incomplete' "$TEST_ROOT/rg-error/report.md" || fail "scan failure not disclosed"
if grep -q 'Verdict hint:.*Low' "$TEST_ROOT/rg-error/report.md"; then fail "scan error became clean verdict"; fi
echo "ok 5 - fallback read errors remain failed coverage, never a clean scan"

cat >"$MOCK_BIN/brew" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$INSTALL_CALLS"
if [ "$*" = 'install gitleaks' ]; then exit 19; fi
EOF
chmod +x "$MOCK_BIN/brew"
export INSTALL_CALLS="$TEST_ROOT/install-calls"
if PATH="$MOCK_BIN:$BASE_BIN" bash "$SCRIPT_DIR/install-scanners.sh" --yes \
    >"$TEST_ROOT/install.stdout" 2>"$TEST_ROOT/install.stderr"; then
  fail "partial scanner install returned success"
fi
[ "$(grep -c '^install ' "$INSTALL_CALLS")" = 7 ] ||
  fail "failed installation prevented the remaining independent installs"
echo "ok 6 - partial scanner installation attempts remaining tools and returns failure"
