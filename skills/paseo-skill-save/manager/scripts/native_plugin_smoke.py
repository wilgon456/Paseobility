#!/usr/bin/env python3
"""Opt-in smoke test for locally installed Codex and Claude plugin CLIs.

This script is deliberately absent from hosted CI unless a developer passes
``scripts/local_gate.py --native-install``.  It uses isolated configuration,
local marketplace fixtures, and the current adapter payloads.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
MARKETPLACE_NAME = "skillhub-native-smoke"


def run(command: list[str], *, cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
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


def marketplace(path: Path, schema: str, plugin_source: Path) -> None:
    package = path / "plugins" / "skill-hub-router"
    shutil.copytree(plugin_source, package)
    is_claude = "anthropic" in schema
    plugin = {
        "name": "skill-hub-router",
        "description": "Local router fixture.",
        "source": "./plugins/skill-hub-router" if is_claude else {
            "source": "local",
            "path": "./plugins/skill-hub-router",
        },
    }
    if not is_claude:
        plugin["policy"] = {"installation": "AVAILABLE", "authentication": "ON_INSTALL"}
        plugin["category"] = "Productivity"
    manifest = {
        "$schema": schema,
        "name": MARKETPLACE_NAME,
        "description": "Isolated local Skill Hub native installation smoke test.",
        "plugins": [plugin],
    }
    if is_claude:
        manifest["owner"] = {"name": "skillNload tests"}
        manifest_path = path / ".claude-plugin" / "marketplace.json"
    else:
        manifest["interface"] = {"displayName": "Skill Hub native smoke"}
        manifest_path = path / ".agents" / "plugins" / "marketplace.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def installed_wrapper(root: Path) -> Path:
    matches = [
        path
        for path in root.rglob("skillhub.py")
        if path.parent.name == "scripts" and path.parent.parent.name == "skill-hub-router"
    ]
    if not matches:
        raise RuntimeError(f"installed plugin has no router wrapper under {root}")
    return matches[0]


def exercise_wrapper(wrapper: Path, sandbox: Path, state: Path) -> None:
    environment = os.environ.copy()
    environment.update(
        {
            "SKILLHUB_STATE_DIR": str(state),
            "SKILLHUB_FORCE_BOOTSTRAP": "1",
            "SKILLHUB_BOOTSTRAP_FROM_CHECKOUT": str(ROOT),
            "PYTHONUTF8": "1",
        }
    )
    result = run(
        [sys.executable, str(wrapper), "doctor", "--json"],
        cwd=sandbox,
        env=environment,
    )
    payload = json.loads(result.stdout)
    if payload.get("status") != "ok":
        raise RuntimeError("native plugin wrapper doctor failed")


def main() -> int:
    available = {name: path for name in ("codex", "claude") if (path := shutil.which(name))}
    if not available:
        print(json.dumps({"status": "skipped", "reason": "codex and claude CLIs are unavailable"}))
        return 0

    completed_targets: list[str] = []
    with tempfile.TemporaryDirectory(prefix="skillhub-native-plugin-") as temporary:
        sandbox = Path(temporary)

        if "codex" in available:
            market = sandbox / "codex-marketplace"
            marketplace(
                market,
                "https://codex.openai.com/plugin/marketplace.schema.json",
                ROOT / ".agents" / "plugins" / "skill-hub-router",
            )
            codex_home = sandbox / "codex-home"
            codex_home.mkdir()
            environment = os.environ.copy()
            environment.update({"CODEX_HOME": str(codex_home), "PYTHONUTF8": "1"})
            run([available["codex"], "plugin", "marketplace", "add", str(market), "--json"], cwd=sandbox, env=environment)
            run(
                [available["codex"], "plugin", "add", f"skill-hub-router@{MARKETPLACE_NAME}", "--json"],
                cwd=sandbox,
                env=environment,
            )
            exercise_wrapper(installed_wrapper(codex_home), sandbox, sandbox / "codex-state")
            completed_targets.append("codex")

        if "claude" in available:
            market = sandbox / "claude-marketplace"
            marketplace(
                market,
                "https://anthropic.com/claude-code/marketplace.schema.json",
                ROOT / ".claude-plugin" / "plugins" / "skill-hub-router",
            )
            project = sandbox / "claude-project"
            project.mkdir()
            claude_config = sandbox / "claude-config"
            claude_config.mkdir()
            environment = os.environ.copy()
            environment.update(
                {
                    "CLAUDE_CONFIG_DIR": str(claude_config),
                    "CLAUDE_CODE_PLUGIN_CACHE_DIR": str(sandbox / "claude-cache"),
                    "CI": "1",
                    "PYTHONUTF8": "1",
                }
            )
            run(
                [available["claude"], "plugin", "marketplace", "add", str(market), "--scope", "local"],
                cwd=project,
                env=environment,
            )
            run(
                [available["claude"], "plugin", "install", f"skill-hub-router@{MARKETPLACE_NAME}", "--scope", "local"],
                cwd=project,
                env=environment,
            )
            search_root = sandbox / "claude-cache"
            if not search_root.exists():
                search_root = claude_config
            exercise_wrapper(installed_wrapper(search_root), sandbox, sandbox / "claude-state")
            completed_targets.append("claude")

    print(json.dumps({"status": "ok", "targets": completed_targets}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
