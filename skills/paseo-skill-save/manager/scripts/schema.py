#!/usr/bin/env python3
"""Compatibility shim: the implementation lives in the skillhub package."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from skillhub import schema as _schema  # noqa: E402

for _name in dir(_schema):
    if not _name.startswith("_"):
        globals()[_name] = getattr(_schema, _name)

if __name__ == "__main__":
    raise SystemExit(_schema.main())
