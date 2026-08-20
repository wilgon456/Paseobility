#!/usr/bin/env python3
"""Exercise URL-style setup and standalone router bootstrap in isolation."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        command,
        cwd=cwd,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
        timeout=180,
    )
    if completed.returncode:
        raise RuntimeError(
            f"command failed ({completed.returncode}): {' '.join(command)}\n"
            + (completed.stderr or completed.stdout)
        )
    return completed


def json_result(completed: subprocess.CompletedProcess[str]) -> dict:
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        raise RuntimeError("expected a JSON object")
    return value


def assert_ready(result: dict, expected_installation: str) -> None:
    if result.get("status") != "ready":
        raise RuntimeError(f"installer status is not ready: {result}")
    if result.get("installation") != expected_installation:
        raise RuntimeError(f"unexpected installation mode: {result.get('installation')}")
    if result.get("doctor", {}).get("status") != "ok":
        raise RuntimeError("doctor did not pass")
    if result.get("smoke_test", {}).get("status") != "passed":
        raise RuntimeError("natural-language smoke test did not pass")
    if result.get("installed_workload_skills") != 0:
        raise RuntimeError("URL setup installed workload skills")


def assert_code_only_runtime(result: dict) -> None:
    if result.get("preloaded_private_skills") != 0:
        raise RuntimeError("manager-only install preloaded private skills")
    if result.get("private_runtime") is not None:
        raise RuntimeError("manager-only install reported a private payload runtime")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--network",
        action="store_true",
        help="also bootstrap from the real pinned GitHub release (never enabled by hosted CI)",
    )
    args = parser.parse_args(argv)
    with tempfile.TemporaryDirectory(prefix="skillhub-agent-install-") as temporary:
        sandbox = Path(temporary)
        home = sandbox / "home"
        state = sandbox / "state"
        install = [
            sys.executable,
            str(ROOT / "install.py"),
            "--target",
            "codex,claude",
            "--home",
            str(home),
            "--state-dir",
            str(state),
            "--json",
        ]
        first = json_result(run(install, cwd=ROOT))
        assert_ready(first, "updated")
        assert_code_only_runtime(first)
        second = json_result(run(install, cwd=ROOT))
        assert_ready(second, "already-ready")
        assert_code_only_runtime(second)

        for path in (
            home / ".agents" / "skills" / "skill-hub-router",
            home / ".claude" / "skills" / "skill-hub-router",
        ):
            if (
                not (path / "SKILL.md").is_file()
                or not (path / "agents" / "openai.yaml").is_file()
                or not (path / "scripts" / "skillhub.py").is_file()
            ):
                raise RuntimeError(f"router payload is incomplete: {path}")
            router_contract = (path / "SKILL.md").read_text(encoding="utf-8")
            required_explicit_contract = (
                "명시적으로 검색",
                "일반 자연어 작업에는 자동으로 참여하지 않는다",
                "## 명시적 호출 게이트",
                "사용자가 요청하지 않은",
                "`apply_ephemerally`",
            )
            missing = [value for value in required_explicit_contract if value not in router_contract]
            if missing:
                raise RuntimeError(f"installed router lost its explicit-only contract: {path}: {missing}")
            openai_contract = (path / "agents" / "openai.yaml").read_text(encoding="utf-8")
            if "allow_implicit_invocation: false" not in openai_contract:
                raise RuntimeError(f"installed router permits implicit invocation: {path}")

        # Prove that an activated router still works from an unrelated working
        # directory through the persisted manager runtime.
        environment = os.environ.copy()
        environment["SKILLHUB_STATE_DIR"] = str(state)
        environment["PYTHONUTF8"] = "1"
        wrapper = home / ".agents" / "skills" / "skill-hub-router" / "scripts" / "skillhub.py"
        matched = json_result(
            run(
                [
                    sys.executable,
                    str(wrapper),
                    "match",
                    "한국어 PDF 표를 추출해서 요약해줘",
                    "--target",
                    "codex",
                    "--json",
                ],
                cwd=sandbox,
                env=environment,
            )
        )
        if "decision" not in matched and "status" not in matched:
            raise RuntimeError("persisted runtime did not return a routing decision")

        # Simulate a direct SKILL.md-only installation.  The override points at
        # this local Git repository while still exercising sparse clone,
        # revision verification, and standalone dispatch without network.
        standalone = sandbox / "standalone-router"
        shutil.copytree(ROOT / "skills" / "skill-hub-router", standalone)
        revision = run(["git", "rev-parse", "HEAD"], cwd=ROOT).stdout.strip()
        bootstrap_state = sandbox / "standalone-state"
        bootstrap_env = os.environ.copy()
        bootstrap_env.update(
            {
                "SKILLHUB_STATE_DIR": str(bootstrap_state),
                "SKILLHUB_BOOTSTRAP_REPOSITORY": str(ROOT),
                "SKILLHUB_BOOTSTRAP_REVISION": revision,
                "SKILLHUB_BOOTSTRAP_REF": "",
                "PYTHONUTF8": "1",
            }
        )
        direct = json_result(
            run(
                [
                    sys.executable,
                    str(standalone / "scripts" / "skillhub.py"),
                    "match",
                    "회의록을 요약해줘",
                    "--target",
                    "claude",
                    "--json",
                ],
                cwd=sandbox,
                env=bootstrap_env,
            )
        )
        if "decision" not in direct and "status" not in direct:
            raise RuntimeError("standalone bootstrap did not return a routing decision")
        runtime_sources = list((bootstrap_state / "runtime").glob("manager-*/source"))
        if len(runtime_sources) != 1:
            raise RuntimeError("standalone bootstrap did not create exactly one pinned runtime")
        if (runtime_sources[0] / "archive").exists() or (runtime_sources[0] / "vendor").exists():
            raise RuntimeError("standalone bootstrap downloaded bulk skill payloads")

        if args.network:
            network_state = sandbox / "network-state"
            network_env = os.environ.copy()
            for key in (
                "SKILLHUB_REPO",
                "SKILLHUB_BOOTSTRAP_REPOSITORY",
                "SKILLHUB_BOOTSTRAP_REVISION",
                "SKILLHUB_BOOTSTRAP_REF",
                "SKILLHUB_BOOTSTRAP_FROM_CHECKOUT",
                "SKILLHUB_FORCE_BOOTSTRAP",
                "SKILLHUB_PREFER_RUNTIME",
                "PYTHONPATH",
            ):
                network_env.pop(key, None)
            network_env.update({"SKILLHUB_STATE_DIR": str(network_state), "PYTHONUTF8": "1"})
            remote = json_result(
                run(
                    [
                        sys.executable,
                        str(standalone / "scripts" / "skillhub.py"),
                        "match",
                        "일정을 정리해줘",
                        "--target",
                        "codex",
                        "--json",
                    ],
                    cwd=sandbox,
                    env=network_env,
                )
            )
            if "decision" not in remote and "status" not in remote:
                raise RuntimeError("real pinned bootstrap did not return a routing decision")
            remote_sources = list((network_state / "runtime").glob("manager-*/source"))
            if len(remote_sources) != 1 or not (remote_sources[0] / ".git").is_dir():
                raise RuntimeError("real pinned bootstrap did not create one Git checkout")
            remote_revision = run(["git", "rev-parse", "HEAD"], cwd=remote_sources[0]).stdout.strip()
            if remote_revision != "1d1167259a1cb132db8679dce3fef13fb6373015":
                raise RuntimeError("real pinned bootstrap resolved an unexpected revision")

    print(
        json.dumps(
            {
                "status": "ok",
                "targets": ["codex", "claude"],
                "workload_skills": 0,
                "network_bootstrap": "passed" if args.network else "not-requested",
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
