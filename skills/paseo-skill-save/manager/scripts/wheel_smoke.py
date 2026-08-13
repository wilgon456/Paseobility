#!/usr/bin/env python3
"""Fresh-install smoke test: install the built wheel into a throwaway venv.

The test is offline after the wheel exists: pip installs with --no-index, and
the exercised flow (init/search/inspect/list/use/uninstall/doctor) uses only
packaged router content, never the network. No real agent folder is touched.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def find_wheel() -> Path:
    dist = ROOT / "dist"
    wheels = sorted(dist.glob("skillnload-*.whl")) if dist.is_dir() else []
    if not wheels:
        raise SystemExit("no wheel found in dist/; run scripts/build_package.py first")
    return wheels[-1]


def run(command: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, encoding="utf-8", capture_output=True, **kwargs)


def main() -> int:
    wheel = find_wheel()
    with tempfile.TemporaryDirectory(prefix="skillhub-wheel-smoke-") as temp:
        base = Path(temp)
        venv_dir = base / "venv"
        venv.create(venv_dir, with_pip=True)
        if os.name == "nt":
            python = venv_dir / "Scripts" / "python.exe"
            skillhub = venv_dir / "Scripts" / "skillhub.exe"
        else:
            python = venv_dir / "bin" / "python"
            skillhub = venv_dir / "bin" / "skillhub"
        env = dict(os.environ)
        env.pop("SKILLHUB_REPO", None)
        env.pop("SKILLHUB_STATE_DIR", None)
        proc = run([str(python), "-m", "pip", "install", "--no-index", "--find-links", str(wheel.parent), str(wheel)], env=env)
        if proc.returncode:
            print(proc.stdout, file=sys.stderr)
            print(proc.stderr, file=sys.stderr)
            return proc.returncode
        home = base / "home"
        state = base / "state"
        prefix = [str(skillhub), "--home", str(home), "--state-dir", str(state)]
        commands = [
            prefix + ["--version"],
            prefix + ["init", "--target", "generic,codex", "--json"],
            prefix + ["search", "router", "--available-only", "--json"],
            prefix + ["inspect", "core.skill-hub-router", "--json"],
            prefix + ["verify", "core.skill-hub-router", "--json"],
            prefix + ["list", "--installed", "--json"],
            prefix + ["use", "core.skill-hub-router", "--once", "--target", "claude", "--yes", "--json"],
            prefix + ["status", "--json"],
            prefix + ["doctor", "--json"],
        ]
        for command in commands:
            proc = run(command, env=env, cwd=str(base))
            if proc.returncode:
                print("command failed: " + " ".join(command), file=sys.stderr)
                print(proc.stdout, file=sys.stderr)
                print(proc.stderr, file=sys.stderr)
                return proc.returncode
        inspect_result = json.loads(run(prefix + ["inspect", "core.skill-hub-router", "--json"], env=env).stdout)
        if inspect_result.get("local_state") not in {"enabled", "one-shot"}:
            print(f"unexpected local_state: {inspect_result.get('local_state')}", file=sys.stderr)
            return 1
        proc = run(prefix + ["uninstall", "core.skill-hub-router", "--json"], env=env)
        if proc.returncode:
            print(proc.stderr, file=sys.stderr)
            return proc.returncode
        roots = [
            home / ".agents" / "skills",
            home / ".claude" / "skills",
            home / ".config" / "opencode" / "skills",
            home / ".paseo" / "skills",
            home / ".ai-skill-library" / "skills",
        ]
        leftover = [str(path) for root in roots if root.exists() for path in root.iterdir()]
        if leftover:
            print(f"smoke test left exposures: {leftover}", file=sys.stderr)
            return 1
    print(f"wheel smoke: ok ({wheel.name})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
