"""Schema helpers: registry migrations v0 -> v1 -> v2 (standard library only)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    from .library import REGISTRY_SCHEMA_VERSION, ROOT, directory_checksum, is_reparse_point, json_dump, normalize_redistribution
except ImportError:  # pragma: no cover - direct script execution
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from skillhub.library import REGISTRY_SCHEMA_VERSION, ROOT, directory_checksum, is_reparse_point, json_dump, normalize_redistribution  # type: ignore


def _migrate_v0_to_v1(value: dict[str, Any], root: Path | None) -> dict[str, Any]:
    migrated: list[dict[str, Any]] = []
    for old in value.get("skills", value.get("items", [])):
        if not isinstance(old, dict):
            raise ValueError("legacy item is not an object")
        path = old.get("path")
        checksum = None
        if root is not None and isinstance(path, str):
            raw_candidate = root / path
            candidate = raw_candidate.resolve()
            try:
                candidate.relative_to(root.resolve())
            except ValueError:
                candidate = None
            if candidate is not None and not is_reparse_point(raw_candidate) and candidate.is_dir() and not is_reparse_point(candidate):
                checksum = directory_checksum(candidate)
        source = old.get("source") if isinstance(old.get("source"), dict) else {}
        migrated.append({
            "catalog_id": f"migrated.legacy/{old.get('name', 'unnamed')}",
            "kind": "skill",
            "name": str(old.get("name", "unnamed")),
            "description": str(old.get("description", "")),
            "source_id": "migrated-legacy",
            "source": {
                "repository": str(source.get("repository", "https://invalid.example/legacy")),
                "commit": "0000000000000000000000000000000000000000",
                "path": str(path or ""),
                "url": str(source.get("url", "https://invalid.example/legacy")),
                "status": "metadata-only",
            },
            "archive": {"status": "metadata-only", "path": None, "blocker": "migrated legacy provenance requires review", "license": {"declared": "unclassified", "redistribution": "unknown"}},
            "trust": {"tier": "unclassified", "security_review": "not-reviewed"},
            "verification": {"status": "needs-review", "checksum": checksum, "source_commit": "0000000000000000000000000000000000000000"},
            "version": "0.0.0",
            "revision": "legacy",
            "compatibility": ["generic-agent"],
            "oses": ["unknown"],
            "dependencies": [],
            "risk": "destructive" if old.get("risk") == "destructive" else "scripts" if old.get("risk") == "scripts" else "instructions-only",
            "activation_policy": "blocked",
            "update_policy": "manual",
            "aliases": [],
            "tags": ["migrated", "needs-review"],
            "adapters": {},
        })
    return {
        "schema_version": 1,
        "library_version": "0.1.0",
        "generated_by": "scripts/schema.py",
        "sources": [{"source_id": "migrated-legacy", "status": "metadata-only"}],
        "skills": migrated,
    }


def derive_acquisition(item: dict[str, Any], source: dict[str, Any] | None) -> dict[str, Any]:
    """Conservative acquisition block for migrated (non-compiled) registries."""
    status = item.get("archive", {}).get("status")
    if status != "archived":
        return {"status": "unavailable", "reason": f"{status} records cannot be acquired"}
    return {"status": "unavailable", "reason": "migrated registry requires acquisition review before install"}


def normalize_item_license(item: dict[str, Any]) -> dict[str, Any]:
    """Canonicalize historical license decision spellings conservatively."""
    normalized = dict(item)
    archive = dict(normalized.get("archive", {}))
    license_info = dict(archive.get("license", {}))
    declared = str(license_info.get("declared", "unknown") or "unknown").strip()
    if declared.casefold() in {"", "unknown", "unclassified", "not-stated"}:
        declared = "unknown"
    license_info["declared"] = declared
    license_info["redistribution"] = normalize_redistribution(license_info.get("redistribution"))
    archive["license"] = license_info
    normalized["archive"] = archive
    acquisition = normalized.get("acquisition")
    if isinstance(acquisition, dict):
        plan = dict(acquisition)
        gate = plan.get("license_gate")
        if isinstance(gate, dict):
            gate_declared = str(gate.get("declared", "unknown") or "unknown").strip()
            if gate_declared.casefold() in {"", "unknown", "unclassified", "not-stated"}:
                gate_declared = "unknown"
            gate_redistribution = normalize_redistribution(gate.get("redistribution"))
            if gate_declared == declared and gate_redistribution == license_info["redistribution"]:
                plan["license_gate"] = {"declared": declared, "redistribution": gate_redistribution}
            else:
                plan["status"] = "unavailable"
                plan["reason"] = "migration found an inconsistent acquisition license gate; catalog review required"
        elif plan.get("status") == "available":
            plan["status"] = "unavailable"
            plan["reason"] = "migration found no acquisition license gate; catalog review required"
        normalized["acquisition"] = plan
    return normalized


def _migrate_v1_to_v2(value: dict[str, Any]) -> dict[str, Any]:
    sources = {str(source.get("source_id")): source for source in value.get("sources", []) if isinstance(source, dict)}
    skills = []
    for item in value.get("skills", []):
        if not isinstance(item, dict):
            raise ValueError("registry item is not an object")
        item = normalize_item_license(item)
        if "acquisition" not in item:
            item["acquisition"] = derive_acquisition(item, sources.get(str(item.get("source_id"))))
        skills.append(item)
    migrated = dict(value)
    migrated["schema_version"] = 2
    migrated["skills"] = skills
    return migrated


def migrate_registry(value: dict[str, Any], root: Path | None = None) -> dict[str, Any]:
    """Migrate legacy registry shapes without claiming unverified provenance."""
    if value.get("schema_version") == REGISTRY_SCHEMA_VERSION:
        return value
    if value.get("schema_version") == 1:
        return _migrate_v1_to_v2(value)
    if value.get("schema_version") in (None, 0):
        return _migrate_v1_to_v2(_migrate_v0_to_v1(value, root))
    raise ValueError("unsupported registry schema")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--output")
    parser.add_argument("--root", default=str(ROOT))
    args = parser.parse_args(argv)
    value = json.loads(Path(args.input).read_text(encoding="utf-8"))
    result = migrate_registry(value, Path(args.root).resolve())
    text = json_dump(result)
    if args.output:
        Path(args.output).write_text(text, encoding="utf-8", newline="\n")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
