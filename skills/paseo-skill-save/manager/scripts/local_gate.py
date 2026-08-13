#!/usr/bin/env python3
"""Run the same deterministic release checks locally without GitHub Actions."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def run(label: str, *command: str) -> None:
    print(f"==> {label}", flush=True)
    result = subprocess.run(command, cwd=ROOT, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true", help="skip release package build and wheel smoke checks")
    parser.add_argument(
        "--install-smoke",
        action="store_true",
        help="also run the isolated URL-only installer E2E; never enabled by hosted CI",
    )
    parser.add_argument(
        "--native-install",
        action="store_true",
        help="also exercise locally installed Codex/Claude CLIs; never enabled by hosted CI",
    )
    args = parser.parse_args()

    run("generated native adapter payloads", sys.executable, "scripts/build_adapters.py", "--check")
    run("generated catalog", sys.executable, "scripts/build_catalog.py", "--check")
    run("adapters and source pins", sys.executable, "scripts/validate_adapters.py")
    run("public tree scan", sys.executable, "scripts/scan_public.py")
    run("diff hygiene", "git", "diff", "--check")
    run("unit tests", sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v")
    run("242-case natural-language E2E", sys.executable, "scripts/evaluate_router_e2e.py")
    if args.install_smoke:
        run("URL-only agent install smoke", sys.executable, "scripts/agent_install_smoke.py")
    if not args.quick:
        run("offline release packages", sys.executable, "scripts/build_package.py", "--clean")
        run("package contents", sys.executable, "scripts/package_inspect.py")
        run("fresh wheel smoke test", sys.executable, "scripts/wheel_smoke.py")
    if args.native_install:
        run("native Codex/Claude plugin smoke", sys.executable, "scripts/native_plugin_smoke.py")
    print("Local gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
