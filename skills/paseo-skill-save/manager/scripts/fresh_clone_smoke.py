#!/usr/bin/env python3
"""Exercise a fresh clone with disposable homes and no third-party execution."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def run(command: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, encoding="utf-8", capture_output=True)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="skillnload-smoke-") as temp:
        base = Path(temp)
        clone = base / "clone"
        branch_proc = run(["git", "branch", "--show-current"], root)
        if branch_proc.returncode:
            print(branch_proc.stderr, file=sys.stderr)
            return branch_proc.returncode
        branch = branch_proc.stdout.strip()
        clone_command = ["git", "clone", "--no-hardlinks"]
        if branch:
            clone_command += ["--branch", branch]
        clone_command += [str(root), str(clone)]
        proc = run(clone_command, root)
        if proc.returncode:
            print(proc.stderr, file=sys.stderr)
            return proc.returncode
        home = base / "home"
        state = base / "state"
        prefix = [sys.executable, str(clone / "scripts" / "skillhub.py"), "--repo", str(clone), "--home", str(home), "--state-dir", str(state)]
        commands = [
            prefix + ["validate"],
            prefix + ["doctor", "--json"],
            prefix + ["search", "router", "--available-only", "--json"],
            prefix + ["inspect", "core.skill-hub-router", "--json"],
            prefix + ["bootstrap", "--profile", "default", "--json"],
            prefix + ["status", "--json"],
            prefix + ["disable", "core.skill-hub-router", "--target", "all", "--json"],
        ]
        for command in commands:
            proc = run(command, clone)
            if proc.returncode:
                print(proc.stdout, file=sys.stdout)
                print(proc.stderr, file=sys.stderr)
                return proc.returncode
        if (home / ".agents" / "skills" / "skill-hub-router").exists() or (home / ".claude" / "skills" / "skill-hub-router").exists():
            print("smoke test left an activated target", file=sys.stderr)
            return 1
        if (base / "home" / ".agents" / "skills").exists() and any((base / "home" / ".agents" / "skills").iterdir()):
            print("smoke test did not remove managed targets", file=sys.stderr)
            return 1
    print("fresh clone smoke: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
