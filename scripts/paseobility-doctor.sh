#!/usr/bin/env bash
# Thin wrapper over the cross-platform Python diagnostics helper.
#
# The diagnostics themselves live in paseobility-doctor.py (stdlib only) so the
# same logic runs on macOS, Linux, and Windows. Arguments are passed through,
# including --root, --source-root, --target-home, --json, and --check-mcp.
#
# Diagnostics are optional: the installers treat a non-zero exit here as
# "diagnostics unavailable", never as an installation failure, so a host without
# Python 3 can still install skills.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PYTHON="${PASEOBILITY_PYTHON:-}"

if [ -z "$PYTHON" ]; then
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 &&
       "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info[0] == 3 else 1)' >/dev/null 2>&1; then
      PYTHON="$candidate"
      break
    fi
  done
fi

if [ -z "$PYTHON" ]; then
  echo "[doctor] diagnostics unavailable: Python 3 was not found." >&2
  echo "[doctor] Both wrappers (.sh and .ps1) need Python 3; installation still succeeds without diagnostics." >&2
  exit 2
fi

exec "$PYTHON" "$SCRIPT_DIR/paseobility-doctor.py" "$@"
