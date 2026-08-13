#!/usr/bin/env python3
"""Validate self-contained adapter manifests and public provenance pins."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    from .library import ROOT, contains_privacy_token, read_json
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from library import ROOT, contains_privacy_token, read_json  # type: ignore


PUBLIC_REPOSITORY = "https://github.com/wilgon456/skillNload.git"
RELEASE_REF = "v0.6.0"
SHA = re.compile(r"^[0-9a-f]{40}$")


def validate_marketplace(path: Path) -> list[str]:
    errors: list[str] = []
    data = read_json(path)
    canonical_skill = (ROOT / "skills" / "skill-hub-router" / "SKILL.md").read_text(encoding="utf-8")
    for plugin in data.get("plugins", []):
        source = plugin.get("source", {})
        if source.get("url") != PUBLIC_REPOSITORY:
            errors.append(f"{path}: adapter is not sourced from the public repository")
        if source.get("ref") != RELEASE_REF:
            errors.append(f"{path}: adapter ref must be the release tag")
        if not isinstance(source.get("sha"), str) or not SHA.fullmatch(source["sha"]) or set(source["sha"]) == {"0"}:
            errors.append(f"{path}: adapter source needs a non-zero exact commit SHA")
        package = ROOT / str(source.get("path", ""))
        if not package.is_dir():
            errors.append(f"{path}: package path is missing")
        else:
            if not list(package.rglob("SKILL.md")):
                errors.append(f"{path}: package has no self-contained SKILL.md")
            if not list(package.rglob("plugin.json")):
                errors.append(f"{path}: package has no plugin manifest")
            adapter_skills = list(package.rglob("SKILL.md"))
            if len(adapter_skills) != 1 or adapter_skills[0].read_text(encoding="utf-8") != canonical_skill:
                errors.append(f"{path}: router SKILL.md is not synchronized with the canonical payload")
            launchers = list(package.rglob("skills/skill-hub-router/scripts/skillhub.py"))
            canonical_launcher = ROOT / "skills" / "skill-hub-router" / "scripts" / "skillhub.py"
            if len(launchers) != 1 or launchers[0].read_bytes() != canonical_launcher.read_bytes():
                errors.append(f"{path}: router launcher is missing or not synchronized")
            if path.parts[-3:-1] == (".agents", "plugins"):
                if not (package / ".codex-plugin" / "plugin.json").is_file():
                    errors.append(f"{path}: canonical Codex plugin manifest is missing")
            elif not (package / ".claude-plugin" / "plugin.json").is_file():
                errors.append(f"{path}: Claude plugin manifest is missing")
    return errors


def validate_catalog_sources() -> list[str]:
    errors: list[str] = []
    source_dir = ROOT / "catalog" / "sources"
    for path in sorted(source_dir.glob("*.json")):
        data = read_json(path)
        commit = data.get("commit")
        if not isinstance(commit, str) or not SHA.fullmatch(commit):
            errors.append(f"{path}: source pin is not a SHA")
        if data.get("status") not in {"archived", "metadata-only"}:
            errors.append(f"{path}: unexpected source status")
        if not data.get("added_at"):
            errors.append(f"{path}: source added_at is missing")
        if data.get("catalog_role") not in {"add-on", "internal"}:
            errors.append(f"{path}: source catalog_role is invalid")
        if contains_privacy_token(path.read_text(encoding="utf-8")):
            errors.append(f"{path}: privacy denylist hit")
    source_names = {path.stem for path in source_dir.glob("*.json")}
    expected = {"router", "private-library"} if "private-library" in source_names else {"router"}
    if source_names != expected:
        errors.append("source catalog contains an unexpected source")
    router = read_json(source_dir / "router.json")
    router_sha = router.get("commit")
    for marketplace in (ROOT / ".agents" / "plugins" / "marketplace.json", ROOT / ".claude-plugin" / "marketplace.json"):
        data = read_json(marketplace)
        for plugin in data.get("plugins", []):
            if plugin.get("source", {}).get("sha") != router_sha:
                errors.append(f"{marketplace}: adapter pin does not match router provenance commit")
    return errors


def main() -> int:
    errors = []
    errors.extend(validate_marketplace(ROOT / ".agents" / "plugins" / "marketplace.json"))
    errors.extend(validate_marketplace(ROOT / ".claude-plugin" / "marketplace.json"))
    errors.extend(validate_catalog_sources())
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(json.dumps({"status": "ok", "adapters": 2}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
