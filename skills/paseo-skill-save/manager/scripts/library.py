"""Compatibility shim: the implementation lives in the skillhub package."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from skillhub import library as _library  # noqa: E402

for _name in dir(_library):
    if not _name.startswith("_"):
        globals()[_name] = getattr(_library, _name)
