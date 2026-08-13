#!/usr/bin/env python3
"""Compatibility shim: the implementation lives in the skillhub package."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from skillhub.catalog_build import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
