#!/usr/bin/env python3
"""Run the repository's offline catalog, provenance, adapter, and privacy checks."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    args = parser.parse_args()
    root = Path(args.root).resolve()
    commands = [
        [sys.executable, str(root / "scripts" / "build_catalog.py"), "--check"],
        [sys.executable, str(root / "scripts" / "source_drift.py")],
        [sys.executable, str(root / "scripts" / "validate_adapters.py")],
        [sys.executable, str(root / "scripts" / "scan_public.py")],
    ]
    for command in commands:
        result = subprocess.run(command, cwd=root)
        if result.returncode:
            return result.returncode
    print("hub validation: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

