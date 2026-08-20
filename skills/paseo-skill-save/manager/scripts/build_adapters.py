#!/usr/bin/env python3
"""Synchronize the canonical router payload into native plugin adapters."""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "skills" / "skill-hub-router"
DESTINATIONS = (
    ROOT / ".agents" / "plugins" / "skill-hub-router" / "skills" / "skill-hub-router",
    ROOT / ".claude-plugin" / "plugins" / "skill-hub-router" / "skills" / "skill-hub-router",
)
FILES = (
    Path("SKILL.md"),
    Path("agents") / "openai.yaml",
    Path("scripts") / "skillhub.py",
)


def synchronized(destination: Path) -> bool:
    return all(
        (destination / relative).is_file()
        and (destination / relative).read_bytes() == (SOURCE / relative).read_bytes()
        for relative in FILES
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    stale = [destination for destination in DESTINATIONS if not synchronized(destination)]
    if args.check:
        if stale:
            for destination in stale:
                print(f"stale adapter payload: {destination.relative_to(ROOT)}", file=sys.stderr)
            return 1
        print("adapter payloads are synchronized")
        return 0
    for destination in DESTINATIONS:
        for relative in FILES:
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(SOURCE / relative, target)
    print(f"synchronized {len(FILES)} files into {len(DESTINATIONS)} adapters")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
