#!/usr/bin/env python3
"""Offline source drift and catalog policy checks used by CI."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    from .library import PERMITTED_REDISTRIBUTION, REDISTRIBUTION_VALUES, ROOT, VERSION, read_json
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from library import PERMITTED_REDISTRIBUTION, REDISTRIBUTION_VALUES, ROOT, VERSION, read_json  # type: ignore


def main() -> int:
    registry = read_json(ROOT / "registry.json")
    errors: list[str] = []
    if registry.get("library_version") != VERSION:
        errors.append("library version drift")
    if registry.get("schema_version") != 2:
        errors.append("registry schema drift")
    source_ids = {source.get("source_id") for source in registry.get("sources", [])}
    private_bundle = "private-library" in source_ids
    required = {"core-router", "private-library"} if private_bundle else {"core-router"}
    allowed = required
    errors.extend(f"missing source: {source_id}" for source_id in sorted(required - source_ids))
    errors.extend(f"unexpected bundled source: {source_id}" for source_id in sorted(source_ids - allowed))
    skills = registry.get("skills", [])
    if not private_bundle and [item.get("catalog_id") for item in skills] != ["core.skill-hub-router"]:
        errors.append("public registry must contain only the router infrastructure skill")
    if private_bundle:
        ids = {item.get("catalog_id") for item in skills}
        if "core.skill-hub-router" not in ids or len(ids) < 2:
            errors.append("private registry must contain the public router and preloaded library items")
    for source in registry.get("sources", []):
        if source.get("catalog_role") not in {"add-on", "internal"}:
            errors.append(f"invalid catalog_role: {source.get('source_id')}")
    for item in registry.get("skills", []):
        if not item.get("added_at"):
            errors.append(f"missing added_at: {item.get('catalog_id')}")
        source = item.get("source", {})
        if not re.fullmatch(r"[0-9a-f]{40}", str(source.get("commit", ""))):
            errors.append(f"invalid source pin: {item.get('catalog_id')}")
        status = item.get("archive", {}).get("status")
        license_info = item.get("archive", {}).get("license", {})
        redistribution = license_info.get("redistribution")
        if redistribution not in REDISTRIBUTION_VALUES:
            errors.append(f"non-canonical redistribution decision: {item.get('catalog_id')}")
        if status == "archived" and item.get("acquisition", {}).get("status") == "available" and redistribution not in PERMITTED_REDISTRIBUTION:
            errors.append(f"archived item has a non-permitting acquisition gate: {item.get('catalog_id')}")
        if status in {"metadata-only", "blocked", "deprecated"} and item.get("activation_policy") != "blocked":
            errors.append(f"non-archived item can activate: {item.get('catalog_id')}")
        acquisition = item.get("acquisition", {})
        if acquisition.get("status") == "available" and acquisition.get("license_gate") != {
            "declared": license_info.get("declared", "unknown"),
            "redistribution": redistribution,
        }:
            errors.append(f"acquisition license drift: {item.get('catalog_id')}")
        if status == "archived" and acquisition.get("status") == "available" and acquisition.get("method") == "git-sparse":
            if acquisition.get("revision") != source.get("commit"):
                errors.append(f"acquisition revision drift: {item.get('catalog_id')}")
            if acquisition.get("expected_checksum") != item.get("verification", {}).get("checksum"):
                errors.append(f"acquisition identity drift: {item.get('catalog_id')}")
        if status != "archived" and acquisition.get("status") == "available":
            errors.append(f"non-archived item claims acquisition: {item.get('catalog_id')}")
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(json.dumps({"status": "ok", "items": len(registry.get("skills", []))}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
