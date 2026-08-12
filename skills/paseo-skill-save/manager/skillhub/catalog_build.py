#!/usr/bin/env python3
"""Compile reviewable source/item JSON into deterministic runtime indexes."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

try:
    from .library import (
        PERMITTED_REDISTRIBUTION,
        REDISTRIBUTION_VALUES,
        REGISTRY_SCHEMA_VERSION,
        ROOT,
        VERSION,
        directory_checksum,
        is_reparse_point,
        json_dump,
        normalize_redistribution,
        read_json,
    )
    from .schema import normalize_item_license
    from .taxonomy import (
        ROUTING_TREE_NAME,
        compile_routing_tree,
        derive_routing_metadata,
        load_routing_taxonomy,
        runtime_routing_taxonomy,
    )
except ImportError:  # pragma: no cover - direct script execution
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from skillhub.library import (  # type: ignore
        PERMITTED_REDISTRIBUTION,
        REDISTRIBUTION_VALUES,
        REGISTRY_SCHEMA_VERSION,
        ROOT,
        VERSION,
        directory_checksum,
        is_reparse_point,
        json_dump,
        normalize_redistribution,
        read_json,
    )
    from skillhub.schema import normalize_item_license  # type: ignore
    from skillhub.taxonomy import (  # type: ignore
        ROUTING_TREE_NAME,
        compile_routing_tree,
        derive_routing_metadata,
        load_routing_taxonomy,
        runtime_routing_taxonomy,
    )


STATUSES = {"archived", "metadata-only", "blocked", "deprecated"}
RISKS = {"instructions-only", "local-management", "scripts", "external-write", "destructive"}
ACQUISITION_METHODS = {"packaged", "git-sparse"}


def source_files(root: Path) -> list[Path]:
    return sorted((root / "catalog" / "sources").glob("*.json"), key=lambda p: p.name)


def item_files(root: Path) -> list[Path]:
    return sorted((root / "catalog" / "items").glob("*.json"), key=lambda p: p.name)


def validate_item(item: dict[str, Any], root: Path) -> list[str]:
    errors: list[str] = []
    catalog_id = item.get("catalog_id")
    if not isinstance(catalog_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._/-]+", catalog_id):
        errors.append("invalid catalog_id")
    for key in ("kind", "name", "description", "source", "archive", "risk", "activation_policy"):
        if key not in item:
            errors.append(f"missing {key}")
    try:
        dt.datetime.fromisoformat(str(item.get("added_at", "")))
    except ValueError:
        errors.append("added_at is not an ISO-8601 timestamp")
    source = item.get("source", {})
    commit = source.get("commit") if isinstance(source, dict) else None
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        errors.append("source commit is not a 40-character lowercase SHA")
    archive = item.get("archive", {})
    status = archive.get("status") if isinstance(archive, dict) else None
    if status not in STATUSES:
        errors.append("invalid archive status")
    risk = item.get("risk")
    if risk not in RISKS:
        errors.append("invalid risk")
    if item.get("activation_policy") == "blocked" and status not in {"blocked", "metadata-only", "deprecated"}:
        errors.append("blocked activation policy requires non-archived status")
    if status == "archived":
        path = archive.get("path")
        checksum = item.get("verification", {}).get("checksum")
        resolved: Path | None = None
        if not isinstance(path, str) or not path:
            errors.append("archived item has no archive path")
        else:
            raw_path = root / path
            if is_reparse_point(raw_path):
                errors.append("archived item path is linked")
            resolved = raw_path.resolve()
            try:
                resolved.relative_to(root.resolve())
            except ValueError:
                errors.append("archive path escapes repository")
            if not resolved.is_dir():
                errors.append("archived item path is missing")
            elif is_reparse_point(resolved):
                errors.append("archived item path is linked")
        if not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-f]{64}", checksum):
            errors.append("archived item has no checksum")
        elif resolved is not None and resolved.is_dir() and not is_reparse_point(resolved) and directory_checksum(resolved) != checksum:
            errors.append("archived item checksum does not match its payload")
        license_info = archive.get("license", {})
        declared = str(license_info.get("declared", "unknown"))
        redistribution = str(license_info.get("redistribution", "unknown"))
        if declared.casefold() in {"", "unknown", "unclassified", "not-stated"}:
            errors.append("archived item has no normalized declared license")
        if redistribution not in REDISTRIBUTION_VALUES:
            errors.append("archived item has an unknown redistribution decision")
    else:
        if archive.get("path") not in (None, ""):
            errors.append("non-archived item must not have an archive path")
        if archive.get("blocker") is None and status in {"blocked", "metadata-only"}:
            errors.append("non-archived item needs a blocker or explanation")
    return errors


def derive_acquisition(item: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    archive = item.get("archive", {})
    status = archive.get("status")
    license_gate = {
        "declared": archive.get("license", {}).get("declared", "unknown"),
        "redistribution": normalize_redistribution(archive.get("license", {}).get("redistribution")),
    }
    if status != "archived":
        reasons = {
            "blocked": archive.get("blocker") or "blocked records cannot be acquired",
            "deprecated": "deprecated records cannot be acquired",
            "metadata-only": archive.get("blocker") or "metadata-only records do not redistribute a payload",
        }
        return {"status": "unavailable", "reason": reasons.get(status, "record cannot be acquired")}
    if license_gate["declared"].casefold() in {"", "unknown", "unclassified", "not-stated"}:
        return {"status": "unavailable", "reason": "license is unknown; acquisition requires a verified package license"}
    if license_gate["redistribution"] not in PERMITTED_REDISTRIBUTION:
        return {"status": "unavailable", "reason": f"redistribution decision '{license_gate['redistribution']}' is not affirmatively permitted"}
    method = (source.get("acquisition") or {}).get("method")
    if method not in ACQUISITION_METHODS:
        return {"status": "unavailable", "reason": "source has no acquisition method; archived payload is checkout-bound"}
    checksum = item.get("verification", {}).get("checksum")
    item_source = item.get("source", {})
    plan: dict[str, Any] = {
        "status": "available",
        "method": method,
        "revision": item_source.get("commit"),
        "expected_checksum": checksum,
        "license_gate": license_gate,
        "update_policy": item.get("update_policy", "pinned"),
    }
    if method == "packaged":
        plan["path"] = item_source.get("path")
    else:
        plan["repository"] = item_source.get("repository")
        plan["subdirectory"] = item_source.get("path")
    return plan


def compile_catalog(root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    taxonomy = load_routing_taxonomy(root)
    sources = [dict(read_json(path)) for path in source_files(root)]
    source_ids = [str(source.get("source_id")) for source in sources]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("duplicate source_id")
    for source in sources:
        try:
            dt.datetime.fromisoformat(str(source.get("added_at", "")))
        except ValueError as exc:
            raise ValueError(f"invalid added_at in source {source.get('source_id')}") from exc
        if source.get("catalog_role") not in {"add-on", "internal"}:
            raise ValueError(f"invalid catalog_role in source {source.get('source_id')}")
        if "redistribution" in source:
            source["redistribution"] = normalize_redistribution(source.get("redistribution"))
        acquisition = source.get("acquisition")
        if acquisition is not None:
            if not isinstance(acquisition, dict) or acquisition.get("method") not in ACQUISITION_METHODS:
                raise ValueError(f"invalid acquisition method in source {source.get('source_id')}")
    sources_by_id = {str(source.get("source_id")): source for source in sources}
    items: list[dict[str, Any]] = []
    for path in item_files(root):
        data = read_json(path)
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            raise ValueError(f"invalid item file: {path}")
        file_source_id = data.get("source_id")
        for item in data["items"]:
            if not isinstance(item, dict):
                raise ValueError(f"non-object item in {path}")
            item = normalize_item_license(item)
            item.setdefault("source_id", file_source_id)
            source = sources_by_id.get(str(item.get("source_id")), {})
            item.setdefault("added_at", source.get("added_at"))
            errors = validate_item(item, root)
            if errors:
                raise ValueError(f"{item.get('catalog_id', path)}: " + "; ".join(errors))
            if item.get("source_id") not in source_ids:
                raise ValueError(f"unknown source_id in {item['catalog_id']}")
            item["acquisition"] = derive_acquisition(item, sources_by_id[str(item["source_id"])])
            item["routing"] = derive_routing_metadata(item, taxonomy)
            item["description_ko"] = item["routing"]["description_ko"]
            items.append(item)
    ids = [item["catalog_id"] for item in items]
    if len(ids) != len(set(ids)):
        duplicates = [key for key, count in Counter(ids).items() if count > 1]
        raise ValueError("duplicate catalog_id: " + ", ".join(duplicates))
    items.sort(key=lambda row: row["catalog_id"])
    sources.sort(key=lambda row: str(row.get("source_id", "")))
    routing_tree = compile_routing_tree(items, taxonomy)
    registry = {
        "schema_version": REGISTRY_SCHEMA_VERSION,
        "library_version": VERSION,
        "generated_by": "scripts/build_catalog.py",
        "routing_taxonomy": runtime_routing_taxonomy(taxonomy),
        "routing_tree": routing_tree,
        "sources": sources,
        "skills": items,
    }
    counts = {
        "total": len(items),
        "by_source": dict(sorted(Counter(str(item.get("source_id")) for item in items).items())),
        "by_status": dict(sorted(Counter(str(item.get("archive", {}).get("status")) for item in items).items())),
        "by_kind": dict(sorted(Counter(str(item.get("kind")) for item in items).items())),
        "by_risk": dict(sorted(Counter(str(item.get("risk")) for item in items).items())),
        "acquirable": sum(1 for item in items if item["acquisition"]["status"] == "available"),
    }
    index = {
        "schema_version": REGISTRY_SCHEMA_VERSION,
        "library_version": VERSION,
        "generated_by": "scripts/build_catalog.py",
        "counts": counts,
        "sources": [
            {"source_id": source.get("source_id"), "repository": source.get("repository"), "commit": source.get("commit"), "status": source.get("status"), "added_at": source.get("added_at"), "catalog_role": source.get("catalog_role")}
            for source in sources
        ],
        "items": [
            {
                "catalog_id": item["catalog_id"],
                "name": item["name"],
                "source_id": item.get("source_id"),
                "status": item["archive"]["status"],
                "kind": item["kind"],
                "acquirable": item["acquisition"]["status"] == "available",
                "added_at": item["added_at"],
                "primary_path": item["routing"]["primary_path"],
            }
            for item in items
        ],
    }
    return registry, index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(ROOT))
    parser.add_argument("--check", action="store_true", help="compare generated files without writing")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    registry, index = compile_catalog(root)
    expected = {
        root / "registry.json": json_dump(registry),
        root / "catalog" / "index.json": json_dump(index),
        root / "catalog" / ROUTING_TREE_NAME: json_dump(registry["routing_tree"]),
    }
    mismatches = []
    for path, content in expected.items():
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != content:
                mismatches.append(str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    if mismatches:
        print("generated catalog is stale: " + ", ".join(mismatches), file=sys.stderr)
        return 1
    if args.check:
        print(json.dumps({"status": "ok", "counts": index["counts"]}, ensure_ascii=False, sort_keys=True))
    else:
        print(json.dumps({"status": "written", "counts": index["counts"]}, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
