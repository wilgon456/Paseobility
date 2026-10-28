#!/bin/sh
# macOS/Linux counterpart of gui-bridge.ps1. SSH (or the local plugin) launches this
# fixed entry. Requests are UTF-8 JSON on stdin, never code.
fail() { printf '%s' '{"ok":false,"error":"Bot bridge unavailable. Check Python and private queue."}'; exit 1; }
allow=""
[ "${1:-}" = "--allow-submit" ] && allow="--allow-submit"
state="${PASEO_BOT_STATE:-$HOME/.config/paseo-bot}"
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || fail
# Non-interactive SSH sessions often lack Homebrew on PATH.
python=""
for candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 "$(command -v python3 2>/dev/null)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then python="$candidate"; break; fi
done
[ -n "$python" ] || fail
PYTHONIOENCODING=utf-8 exec "$python" -X utf8 "$dir/gui_api.py" --state "$state" $allow 2>/dev/null
