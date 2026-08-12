"""Portable remote format for paseo_skill_save private-library synchronization.

This module never makes network calls. It serializes/deserializes the portable
remote layout, validates markers and schemas, and manages Git-based push/pull
through the local Git client. GitHub onboarding is handled separately in
``github_onboard.py``.

Validation is fail-closed: symlinks, junctions, nested .git, unsafe/traversal
paths, privacy/secret markers, incomplete records, and policy scan findings all
raise RemoteError. Imports are transactional (stage-all, promote on success).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .acquire import MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, BINARY_SUFFIXES, unsafe_rel_path
from .library import (
    SECRET_PATTERNS,
    WINDOWS_DEVICE_NAMES,
    contains_privacy_token,
    directory_checksum,
    is_reparse_point,
    json_dump,
    read_json,
    run_git,
    safe_name,
    utc_now_iso,
    write_json,
)

REMOTE_REPO_NAME = "paseo_skill_save"
REMOTE_MARKER = "paseo_skill_save_v1"
REMOTE_SCHEMA_VERSION = 1

_REQUIRED_ITEM_FIELDS = {
    "catalog_id", "name", "description", "source_id", "risk", "activation_policy",
    "verification", "routing",
}
_VALID_RISKS = {"instructions-only", "local-management", "scripts", "external-write", "destructive"}
_VALID_ACTIVATION_POLICIES = {"on-demand", "manual", "blocked"}
_VALID_SOURCE_IDS = {"personal-overlay"}
_VALID_ORIGIN_CATEGORIES = {"user-owned-private"}
_VALID_COMPATIBILITY = {"codex", "claude-code", "opencode", "paseo", "generic-agent"}
_VALID_OSES = {"any", "windows", "macos", "linux"}


class RemoteError(RuntimeError):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


def _git_env() -> dict[str, str]:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_CONFIG_NOSYSTEM"] = "1"
    env["GIT_CONFIG_GLOBAL"] = os.devnull
    env.pop("GIT_ASKPASS", None)
    env.pop("SSH_ASKPASS", None)
    return env


def validate_remote_url(url: str) -> str | None:
    """Validate and canonicalize a remote URL.

    Accepts: https://host/owner/repo.git (no credentials, query, fragment)
             git@host:owner/repo.git (SSH alias form only)
             file:///absolute/path (local bare repos, testing only)

    Rejects: credentials, query, fragment, control chars, unsupported schemes,
             path traversal, option-like input.
    Returns canonical URL on success, None on rejection.
    """
    url = str(url).strip()
    if any(ord(c) < 32 for c in url):
        return None
    if url.startswith("-") or url.startswith("--"):
        return None

    if url.startswith("file://"):
        if ".." in url or "?" in url or "#" in url:
            return None
        return url

    if "://" in url:
        parsed = urlparse_remote(url)
        if parsed is None:
            return None
        scheme, netloc, path, qs, frag = parsed
        if scheme != "https":
            return None
        if "@" in netloc:
            return None
        if qs or frag:
            return None
        if not netloc or ".." in path or path.startswith("/-"):
            return None
        host = netloc.split(":")[0] if ":" in netloc else netloc
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?:\.[A-Za-z]{2,})+", host):
            return None
        return f"https://{netloc}{path}"

    if url.startswith("git@"):
        if ":" not in url:
            return None
        host, path = url.split(":", 1)
        host = host[4:]
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?:\.[A-Za-z]{2,})+", host):
            return None
        if not path.endswith(".git") or ".." in path:
            return None
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\.git", path):
            return None
        return url

    return None


def urlparse_remote(url: str) -> tuple[str, str, str, str, str] | None:
    """Parse a URL into (scheme, netloc, path, query, fragment)."""
    m = re.match(
        r'^([a-z][a-z0-9+.-]*)://'
        r'([^/?#@]+)'
        r'(/[^?#]*)?'
        r'(?:\?([^#]*))?'
        r'(?:#(.*))?$',
        url,
    )
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3) or "", m.group(4) or "", m.group(5) or ""


def validate_portable_item(item: dict[str, Any]) -> list[str]:
    """Validate a portable catalog item. Returns list of issue codes (empty=valid).

    Checks: required fields, valid enums/types, valid checksum, no absolute
    paths, no credential URL fields, no privacy/secret markers in metadata.
    """
    issues: list[str] = []

    if not isinstance(item, dict):
        return ["item-not-object"]

    for field in _REQUIRED_ITEM_FIELDS:
        if field not in item:
            issues.append(f"missing-field:{field}")
            continue
        val = item[field]
        if field == "catalog_id" and (not isinstance(val, str) or not val.strip()):
            issues.append("invalid-catalog-id")
        if field == "name" and (not isinstance(val, str) or not val.strip()):
            issues.append("invalid-name")
        if field == "description" and not isinstance(val, str):
            issues.append("invalid-description")
        if field == "source_id" and val not in _VALID_SOURCE_IDS:
            issues.append(f"invalid-source-id:{val}")
        if field == "risk" and val not in _VALID_RISKS:
            issues.append(f"invalid-risk:{val}")
        if field == "activation_policy" and val not in _VALID_ACTIVATION_POLICIES:
            issues.append(f"invalid-activation-policy:{val}")

    verification = item.get("verification", {})
    if isinstance(verification, dict):
        cs = verification.get("checksum", "")
        if not isinstance(cs, str) or not re.fullmatch(r"[0-9a-f]{64}", cs):
            issues.append("invalid-checksum")
    else:
        issues.append("invalid-verification")

    if not isinstance(item.get("routing"), dict):
        issues.append("invalid-routing")

    origin = item.get("origin_category", "")
    if origin not in _VALID_ORIGIN_CATEGORIES:
        issues.append(f"invalid-origin-category:{origin}")

    compatibility = item.get("compatibility", [])
    if isinstance(compatibility, list):
        for c in compatibility:
            if c not in _VALID_COMPATIBILITY:
                issues.append(f"invalid-compatibility:{c}")
    else:
        issues.append("invalid-compatibility")

    oses = item.get("oses", [])
    if isinstance(oses, list):
        for o in oses:
            if o not in _VALID_OSES:
                issues.append(f"invalid-os:{o}")
    else:
        issues.append("invalid-os")

    source = item.get("source", {}) if isinstance(item.get("source"), dict) else {}
    repo = source.get("repository", "")
    if isinstance(repo, str) and repo:
        if "://token@" in repo or "://user:" in repo or "://user@" in repo:
            issues.append("credential-in-source-repository")

    all_text = json.dumps(item, ensure_ascii=False)
    if contains_privacy_token(all_text):
        issues.append("privacy-token-in-metadata")

    unwanted_patterns = [
        (re.compile(r'[A-Za-z]:[\\/](?![\\/])[^\r\n\"\']{3,}'), "absolute-windows-path"),
        (re.compile(r'/(?:home|Users|root)/[^\r\n\"\']{3,}'), "absolute-unix-path"),
        (re.compile(r'gh[pousr]_[A-Za-z0-9]{20,}'), "secret-like-token"),
        (re.compile(r'-----BEGIN.*PRIVATE KEY-----'), "private-key"),
    ]
    for pattern, code in unwanted_patterns:
        if pattern.search(all_text):
            issues.append(f"forbidden-pattern:{code}")

    return issues


def scan_portable_payload(root: Path) -> list[dict[str, str]]:
    """Deep-scan a portable payload directory.

    Rejects: symlinks, junctions/.git/.hg/.svn, unsafe/traversal paths,
             binary files, secrets/privacy markers, file/byte limits.

    Never executes any content.
    """
    findings: list[dict[str, str]] = []
    if not root.is_dir() or is_reparse_point(root):
        return [{"code": "invalid-root", "path": str(root),
                 "detail": "payload root must be a real directory"}]
    root_resolved = root.resolve()

    file_count = 0
    total_bytes = 0
    for path in sorted(root.rglob("*"), key=lambda p: p.as_posix()):
        rel = path.relative_to(root).as_posix()

        reason = unsafe_rel_path(rel)
        if reason:
            findings.append({"code": "unsafe-path", "path": rel, "detail": reason})
            continue

        try:
            path.resolve().relative_to(root_resolved)
        except ValueError:
            findings.append({"code": "path-escape", "path": rel,
                             "detail": "resolves outside the payload root"})
            continue

        if any(part in {".git", ".hg", ".svn"} for part in path.relative_to(root).parts):
            findings.append({"code": "nested-vcs", "path": rel,
                             "detail": "nested repository metadata is not allowed"})
            continue

        if path.is_symlink() or is_reparse_point(path):
            findings.append({"code": "link", "path": rel,
                             "detail": "symlink, junction, or reparse point is not allowed"})
            continue

        if path.is_dir():
            continue

        file_count += 1
        if file_count > MAX_FILES:
            findings.append({"code": "too-many-files", "path": rel,
                             "detail": f"more than {MAX_FILES} files"})
            continue

        try:
            size = path.stat().st_size
        except OSError as exc:
            findings.append({"code": "unreadable", "path": rel, "detail": str(exc)})
            continue

        if size > MAX_FILE_BYTES:
            findings.append({"code": "file-too-large", "path": rel,
                             "detail": f"{size} bytes exceeds {MAX_FILE_BYTES}"})
            continue

        total_bytes += size
        if total_bytes > MAX_TOTAL_BYTES:
            findings.append({"code": "payload-too-large", "path": rel,
                             "detail": f"total exceeds {MAX_TOTAL_BYTES} bytes"})
            continue

        payload = path.read_bytes()
        suffix = path.suffix.lower()
        if suffix in BINARY_SUFFIXES or b"\x00" in payload:
            findings.append({"code": "binary", "path": rel,
                             "detail": "binary payload is not allowed by policy"})
            continue

        try:
            text = payload.decode("utf-8")
        except UnicodeDecodeError:
            findings.append({"code": "binary", "path": rel,
                             "detail": "non-UTF-8 payload is not allowed by policy"})
            continue

        for label, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append({"code": "secret-like", "path": rel,
                                 "detail": f"secret-like pattern: {label}"})

        if contains_privacy_token(text) or contains_privacy_token(rel):
            findings.append({"code": "privacy-token", "path": rel,
                             "detail": "privacy denylist match"})

    return findings


def make_portable_item(item: dict[str, Any]) -> dict[str, Any]:
    """Strip local-only fields from a catalog item for remote storage."""
    source = item.get("source", {}) if isinstance(item.get("source"), dict) else {}
    archive = item.get("archive", {}) if isinstance(item.get("archive"), dict) else {}
    verification = item.get("verification", {}) if isinstance(item.get("verification"), dict) else {}
    trust = item.get("trust", {}) if isinstance(item.get("trust"), dict) else {}
    routing = item.get("routing", {}) if isinstance(item.get("routing"), dict) else {}
    acquisition = item.get("acquisition", {}) if isinstance(item.get("acquisition"), dict) else {}

    portable = {
        "catalog_id": item.get("catalog_id", ""),
        "kind": item.get("kind", "skill"),
        "name": item.get("name", ""),
        "runtime_name": item.get("runtime_name", item.get("name", "")),
        "description": item.get("description", ""),
        "description_ko": item.get("description_ko", ""),
        "source_id": item.get("source_id", "personal-overlay"),
        "source": {
            "repository": source.get("repository", ""),
            "commit": source.get("commit", ""),
            "path": source.get("path", ""),
            "status": source.get("status", ""),
            "publisher": source.get("publisher", ""),
        },
        "archive": {
            "status": archive.get("status", "archived"),
            "license": {
                "declared": archive.get("license", {}).get("declared", "user-supplied"),
                "redistribution": archive.get("license", {}).get("redistribution", "personal-local-use-only"),
            },
        },
        "acquisition": {
            "status": acquisition.get("status", "available"),
            "method": acquisition.get("method", "personal-overlay"),
            "expected_checksum": acquisition.get("expected_checksum", ""),
        },
        "trust": {
            "tier": trust.get("tier", "user-selected"),
            "publisher_identity": trust.get("publisher_identity", "not-verified"),
            "security_review": trust.get("security_review", "static-scan-only"),
        },
        "verification": {
            "status": verification.get("status", ""),
            "checksum": verification.get("checksum", ""),
        },
        "version": item.get("version", "personal"),
        "revision": item.get("revision", ""),
        "compatibility": item.get("compatibility", ["codex", "claude-code", "opencode", "paseo", "generic-agent"]),
        "oses": item.get("oses", ["any"]),
        "dependencies": item.get("dependencies", []),
        "risk": item.get("risk", "instructions-only"),
        "activation_policy": item.get("activation_policy", "on-demand"),
        "update_policy": item.get("update_policy", "pinned"),
        "aliases": item.get("aliases", []),
        "tags": item.get("tags", []),
        "routing": {
            "description_ko": routing.get("description_ko", ""),
            "description_source": routing.get("description_source", ""),
            "tags_ko": routing.get("tags_ko", []),
            "actions": routing.get("actions", []),
            "behavior_classes": routing.get("behavior_classes", []),
            "domains": routing.get("domains", []),
            "input_formats": routing.get("input_formats", []),
            "primary_path": routing.get("primary_path", []),
            "library_paths": routing.get("library_paths", []),
        },
        "adapters": item.get("adapters", {}),
        "origin_category": "user-owned-private",
    }
    return portable


def portable_catalog_id(item: dict[str, Any]) -> str:
    catalog_id = str(item.get("catalog_id", ""))
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", catalog_id).strip(".-")
    if not safe:
        raise RemoteError("bad-catalog-id", "catalog_id is empty or invalid")
    return safe


def make_library_json(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "marker": REMOTE_MARKER,
        "schema_version": REMOTE_SCHEMA_VERSION,
        "generated_at": utc_now_iso(),
        "item_count": len(items),
        "catalog_ids": sorted(item["catalog_id"] for item in items),
    }


def write_portable_repo(repo_dir: Path, items: list[dict[str, Any]], payload_roots: dict[str, Path]) -> None:
    """Write a full portable remote repository layout (union-only).

    Existing catalog/object files are preserved (additive union).
    library.json is regenerated to exactly reflect the set on disk.
    Payload objects are scanned before writing.
    """
    repo_dir.mkdir(parents=True, exist_ok=True)

    catalog_items_dir = repo_dir / "catalog" / "items"
    catalog_items_dir.mkdir(parents=True, exist_ok=True)
    objects_dir = repo_dir / "objects"
    objects_dir.mkdir(parents=True, exist_ok=True)

    for item in items:
        issues = validate_portable_item(item)
        if issues:
            raise RemoteError("invalid-item", f"item {item.get('catalog_id')}: {issues[0]}",
                              {"catalog_id": item.get("catalog_id"), "issues": issues})

        catalog_id = portable_catalog_id(item)
        catalog_path = catalog_items_dir / f"{catalog_id}.json"

        checksum = item.get("verification", {}).get("checksum", "")
        if catalog_path.exists():
            if catalog_path.is_symlink() or is_reparse_point(catalog_path):
                raise RemoteError("unsafe-catalog-path", f"catalog entry is a link: {catalog_path.name}")
            try:
                existing = read_json(catalog_path)
            except (json.JSONDecodeError, OSError) as exc:
                raise RemoteError("invalid-existing-catalog", f"cannot read {catalog_path.name}: {exc}") from exc
            existing_issues = validate_portable_item(existing)
            if existing_issues:
                raise RemoteError("invalid-existing-catalog", f"{catalog_path.name}: {existing_issues[0]}")
            if existing.get("catalog_id") != item.get("catalog_id"):
                raise RemoteError("catalog-id-collision", f"portable catalog path collision for {item.get('catalog_id')}")
            existing_checksum = existing.get("verification", {}).get("checksum")
            if existing_checksum != checksum:
                raise RemoteError("review-required", f"catalog id {item.get('catalog_id')} has a different checksum",
                                  {"catalog_id": item.get("catalog_id"), "local_checksum": checksum,
                                   "remote_checksum": existing_checksum})
            if existing != item:
                raise RemoteError("metadata-mismatch", f"catalog id {item.get('catalog_id')} has different metadata")
        else:
            write_json(catalog_path, item)

        source_root = payload_roots.get(item.get("catalog_id", ""))

        obj_dir = objects_dir / checksum
        if obj_dir.exists():
            findings = scan_portable_payload(obj_dir)
            if findings or directory_checksum(obj_dir) != checksum:
                raise RemoteError("invalid-existing-object", f"object {checksum} is unsafe or has a mismatched checksum")
        else:
            if source_root is None or not source_root.is_dir():
                raise RemoteError("missing-payload", f"no payload available for {item.get('catalog_id')}")
            findings = scan_portable_payload(source_root)
            if findings:
                raise RemoteError("unsafe-payload", f"payload scan failed: {findings[0]}",
                                  {"catalog_id": item.get("catalog_id"), "findings": findings})

            obj_dir.mkdir(parents=True, exist_ok=True)
            for src_path in sorted(source_root.rglob("*"), key=lambda p: p.as_posix()):
                if is_reparse_point(src_path):
                    continue
                if any(part in {".git", ".hg", ".svn"} for part in src_path.relative_to(source_root).parts):
                    continue
                if src_path.is_file():
                    rel = src_path.relative_to(source_root)
                    dst = obj_dir / rel
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src_path, dst)

    all_items: dict[str, dict[str, Any]] = {}
    for catalog_file in sorted(catalog_items_dir.glob("*.json")):
        try:
            existing = read_json(catalog_file)
            cid = existing.get("catalog_id")
            if cid:
                all_items[cid] = existing
        except (json.JSONDecodeError, OSError):
            pass

    library = make_library_json(list(all_items.values()))
    write_json(repo_dir / "library.json", library)


def verify_portable_repo(repo_dir: Path) -> dict[str, Any]:
    """Fail-closed validation of the entire remote repo structure.

    Checks: marker, schema, every catalog item field/type/enum validity,
    every object checksum, every payload file for symlinks/junctions/unsafe
    paths/nested git/privacy/secrets/binary, and exact library.json index.
    library.json stale/mismatched index is an error, not a warning.
    """
    issues: list[dict[str, str]] = []
    lib_path = repo_dir / "library.json"
    if not lib_path.is_file():
        raise RemoteError("invalid-remote", "missing library.json")

    library = read_json(lib_path)
    if library.get("marker") != REMOTE_MARKER:
        raise RemoteError(
            "invalid-remote",
            f"marker mismatch: expected {REMOTE_MARKER!r}, got {library.get('marker')!r}",
        )
    if library.get("schema_version") != REMOTE_SCHEMA_VERSION:
        issues.append({
            "severity": "error",
            "code": "schema-version",
            "detail": f"unsupported schema version: {library.get('schema_version')}",
        })

    catalog_items_dir = repo_dir / "catalog" / "items"
    objects_dir = repo_dir / "objects"
    empty_library = library.get("item_count") == 0 and library.get("catalog_ids") == []

    if ((not catalog_items_dir.is_dir() and not empty_library)
            or (catalog_items_dir.exists() and is_reparse_point(catalog_items_dir))):
        issues.append({"severity": "error", "code": "missing-catalog",
                        "detail": "no catalog/items directory"})

    catalog_items: list[dict[str, Any]] = []
    seen_catalog_ids: set[str] = set()
    if catalog_items_dir.is_dir():
        for catalog_file in sorted(catalog_items_dir.iterdir(), key=lambda p: p.name):
            if catalog_file.is_symlink() or is_reparse_point(catalog_file) or not catalog_file.is_file() or catalog_file.suffix != ".json":
                issues.append({"severity": "error", "code": "unsafe-catalog-entry",
                               "detail": f"catalog/items/{catalog_file.name}"})
                continue
            try:
                item = read_json(catalog_file)
            except (json.JSONDecodeError, OSError) as exc:
                issues.append({"severity": "error", "code": "bad-catalog-item",
                               "detail": f"{catalog_file.name}: {exc}"})
                continue

            item_issues = validate_portable_item(item)
            if item_issues:
                issues.append({"severity": "error", "code": "invalid-catalog-item",
                               "detail": f"{item.get('catalog_id', catalog_file.name)}: {item_issues[0]}"})
                continue

            if not item.get("catalog_id"):
                issues.append({"severity": "error", "code": "no-catalog-id",
                               "detail": f"{catalog_file.name}"})
                continue
            if catalog_file.name != f"{portable_catalog_id(item)}.json":
                issues.append({"severity": "error", "code": "catalog-filename-mismatch",
                               "detail": f"catalog/items/{catalog_file.name}"})
                continue
            if item["catalog_id"] in seen_catalog_ids:
                issues.append({"severity": "error", "code": "duplicate-catalog-id",
                               "detail": item["catalog_id"]})
                continue
            seen_catalog_ids.add(item["catalog_id"])
            catalog_items.append(item)

    object_checks: list[dict[str, Any]] = []
    if not objects_dir.is_dir():
        if not empty_library:
            issues.append({"severity": "error", "code": "missing-objects", "detail": "no objects directory"})
    elif is_reparse_point(objects_dir):
        issues.append({"severity": "error", "code": "missing-objects", "detail": "no objects directory"})
    else:
        for obj_dir in sorted(objects_dir.iterdir()):
            if obj_dir.is_symlink() or is_reparse_point(obj_dir) or not obj_dir.is_dir():
                issues.append({"severity": "error", "code": "unsafe-object-entry",
                               "detail": f"objects/{obj_dir.name}"})
                continue
            checksum_dir = obj_dir.name
            if not re.fullmatch(r"[0-9a-f]{64}", checksum_dir):
                issues.append({"severity": "error", "code": "bad-object-dir",
                               "detail": f"objects/{checksum_dir}"})
                continue

            payload_findings = scan_portable_payload(obj_dir)
            if payload_findings:
                issues.append({"severity": "error", "code": "unsafe-payload-object",
                               "detail": f"objects/{checksum_dir}: {payload_findings[0]}"})

            actual = directory_checksum(obj_dir)
            match = actual == checksum_dir
            object_checks.append({
                "checksum": checksum_dir,
                "actual": actual,
                "match": match,
                "payload_scan": "clean" if not payload_findings else "unsafe",
            })
            if not match:
                issues.append({"severity": "error", "code": "object-checksum-mismatch",
                               "detail": f"objects/{checksum_dir}: expected {checksum_dir}, got {actual}"})

    referenced_checksums: set[str] = set()
    for item in catalog_items:
        cs = item.get("verification", {}).get("checksum")
        if cs and re.fullmatch(r"[0-9a-f]{64}", cs):
            referenced_checksums.add(cs)

    for obj_check in object_checks:
        if obj_check["checksum"] not in referenced_checksums:
            issues.append({"severity": "error", "code": "orphan-object",
                           "detail": f"objects/{obj_check['checksum']} not referenced by any catalog item"})

    for cs in referenced_checksums:
        if not any(oc["checksum"] == cs for oc in object_checks):
            issues.append({"severity": "error", "code": "missing-object",
                           "detail": f"objects/{cs} referenced but missing"})

    disk_catalog_ids = sorted(item["catalog_id"] for item in catalog_items)
    library_ids = sorted(library.get("catalog_ids", []))
    if library_ids != disk_catalog_ids:
        issues.append({"severity": "error", "code": "library-index-stale",
                       "detail": f"library.json catalog_ids ({len(library_ids)}) do not match disk ({len(disk_catalog_ids)})"})

    if library.get("item_count") != len(catalog_items):
        issues.append({"severity": "error", "code": "library-item-count-stale",
                       "detail": f"library.json item_count={library.get('item_count')} != disk count={len(catalog_items)}"})

    return {
        "valid": not any(i["severity"] == "error" for i in issues),
        "marker": library.get("marker"),
        "schema_version": library.get("schema_version"),
        "catalog_ids": disk_catalog_ids,
        "item_count": len(catalog_items),
        "object_checks": object_checks,
        "issues": issues,
    }


def import_from_portable(
    repo_dir: Path,
    overlay_root: Path,
    state: dict[str, Any],
) -> list[dict[str, Any]]:
    """Import validated catalog items and payloads from a portable remote repo.

    Transactional: preflight validates every catalog item and payload object
    before any mutation. All destinations are staged and only promoted to
    state after every row succeeds.

    Requires valid 64-char checksum and matching object (no empty fallback).
    Destination checksum must equal item checksum before state mutation.
    """
    diag = verify_portable_repo(repo_dir)
    if not diag["valid"]:
        raise RemoteError("import-failed", "remote repo validation failed",
                          {"diagnostics": diag})

    items_dir = repo_dir / "catalog" / "items"
    objects_dir = repo_dir / "objects"

    overlay_root.mkdir(parents=True, exist_ok=True)
    if not overlay_root.is_dir() or is_reparse_point(overlay_root):
        raise RemoteError("bad-overlay-root", "overlay root must be a real directory")

    staged: list[tuple[dict[str, Any], Path, Path]] = []
    new_ids: set[str] = set()

    for catalog_file in sorted(items_dir.glob("*.json")):
        item = read_json(catalog_file)
        catalog_id = item["catalog_id"]

        if catalog_id in state.get("overlays", {}):
            existing = state["overlays"][catalog_id]
            existing_cs = existing.get("checksum", "")
            new_cs = item.get("verification", {}).get("checksum", "")
            if existing_cs != new_cs:
                raise RemoteError(
                    "review-required",
                    f"local overlay {catalog_id} has checksum {existing_cs}; remote has {new_cs}",
                    {"catalog_id": catalog_id, "local_checksum": existing_cs,
                     "remote_checksum": new_cs},
                )
            continue

        if catalog_id in new_ids:
            continue

        checksum = item.get("verification", {}).get("checksum", "")
        if not checksum or not re.fullmatch(r"[0-9a-f]{64}", checksum):
            raise RemoteError("missing-checksum",
                              f"catalog item {catalog_id} has no valid verification checksum")
        obj_dir = objects_dir / checksum
        if not obj_dir.is_dir():
            raise RemoteError("missing-object",
                              f"required object {checksum} not found for {catalog_id}")

        actual_obj = directory_checksum(obj_dir)
        if actual_obj != checksum:
            raise RemoteError("checksum-mismatch",
                              f"object checksum mismatch for {catalog_id}: expected {checksum}, got {actual_obj}")

        dest_dir = overlay_root / safe_name(item.get("name", catalog_id))
        if dest_dir.exists() or dest_dir.is_symlink():
            raise RemoteError(
                "unmanaged-destination",
                f"overlay destination already exists: {dest_dir}",
            )

        staged.append((item, obj_dir, dest_dir))
        new_ids.add(catalog_id)

    imported: list[dict[str, Any]] = []
    created_dirs: list[Path] = []

    try:
        for item, obj_dir, dest_dir in staged:
            shutil.copytree(obj_dir, dest_dir, symlinks=False)
            created_dirs.append(dest_dir)

            dest_checksum = directory_checksum(dest_dir)
            expected = item.get("verification", {}).get("checksum", "")
            if dest_checksum != expected:
                raise RemoteError("copy-checksum-mismatch",
                                  f"copied destination checksum {dest_checksum} != expected {expected}")

            state.setdefault("overlays", {})[item["catalog_id"]] = {
                "catalog_id": item["catalog_id"],
                "name": item.get("name", item["catalog_id"]),
                "path": str(dest_dir),
                "root": str(overlay_root),
                "checksum": dest_checksum,
                "added": utc_now_iso(),
                "activation": item.get("activation_policy", "on-demand"),
                "item": item,
            }
            imported.append({
                "catalog_id": item["catalog_id"],
                "name": item.get("name", ""),
                "path": str(dest_dir),
                "checksum": dest_checksum,
                "risk": item.get("risk", ""),
            })
    except Exception:
        for d in reversed(created_dirs):
            if d.is_dir() and not is_reparse_point(d):
                shutil.rmtree(str(d), ignore_errors=True)
            for cid, record in list(state.get("overlays", {}).items()):
                if record.get("path") == str(d):
                    del state["overlays"][cid]
        raise

    return imported


def detect_conflicts(
    local_items: list[dict[str, Any]],
    remote_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compare local and remote catalog items and report conflicts."""
    conflicts: list[dict[str, Any]] = []
    local_by_id = {item.get("catalog_id"): item for item in local_items}
    remote_by_id = {item.get("catalog_id"): item for item in remote_items}

    for catalog_id in sorted(set(local_by_id) | set(remote_by_id)):
        local = local_by_id.get(catalog_id)
        remote = remote_by_id.get(catalog_id)
        local_cs = local.get("verification", {}).get("checksum") if local else None
        remote_cs = remote.get("verification", {}).get("checksum") if remote else None

        if local and remote:
            if local_cs == remote_cs:
                continue
            else:
                conflicts.append({
                    "catalog_id": catalog_id,
                    "type": "checksum-conflict",
                    "local_checksum": local_cs,
                    "remote_checksum": remote_cs,
                    "resolution": "review-required",
                })
        elif local and not remote:
            conflicts.append({
                "catalog_id": catalog_id,
                "type": "local-only",
                "resolution": "push-would-add",
            })
        elif remote and not local:
            conflicts.append({
                "catalog_id": catalog_id,
                "type": "remote-only",
                "resolution": "pull-would-add",
            })

    return conflicts


def push_to_remote(remote_url: str, local_repo: Path, branch: str = "main") -> dict[str, Any]:
    """Push the local portable repo to a remote."""
    validated = validate_remote_url(remote_url)
    if validated is None:
        raise RemoteError("bad-remote-url", f"invalid remote URL: {remote_url}")

    try:
        run_git(local_repo, "remote", "remove", "skill-save", check=False)
    except RuntimeError:
        pass
    run_git(local_repo, "remote", "add", "skill-save", validated)
    run_git(local_repo, "push", "--quiet", "-u", "skill-save", branch)
    return {"status": "pushed", "remote": validated, "branch": branch}


def _git_has_changes(repo_dir: Path) -> bool:
    try:
        status = run_git(repo_dir, "status", "--porcelain").strip()
        return bool(status)
    except RuntimeError:
        return True


def _commit_head(repo_dir: Path) -> str:
    try:
        return run_git(repo_dir, "rev-parse", "HEAD").strip()
    except RuntimeError:
        return ""


def pull_from_remote(remote_url: str, local_repo: Path, branch: str = "main") -> dict[str, Any]:
    """Pull from a remote into the local portable repo via atomic promotion.

    Uses a staged temp clone (safe, no destructive checkout -B) and promotes
    only after successful validation and ownership check.
    """
    validated = validate_remote_url(remote_url)
    if validated is None:
        raise RemoteError("bad-remote-url", f"invalid remote URL: {remote_url}")

    if local_repo.exists() and (not local_repo.is_dir() or not (local_repo / ".git").is_dir()):
        raise RemoteError("unmanaged-local-repo", f"local portable path is not a managed Git repo: {local_repo}")
    has_existing = local_repo.is_dir() and (local_repo / ".git").is_dir()

    with tempfile.TemporaryDirectory(prefix="paseo-pull-") as tmp_name:
        tmp_dir = Path(tmp_name)
        proc = subprocess.run(
            ["git", "clone", "--quiet", "--branch", branch, validated, str(tmp_dir)],
            text=True, encoding="utf-8", errors="replace", capture_output=True,
            timeout=120, env=_git_env(),
        )
        if proc.returncode != 0:
            raise RemoteError("pull-failed", f"clone failed: {proc.stderr.strip()[:400]}")

        diag = verify_portable_repo(tmp_dir)
        if not diag.get("valid"):
            raise RemoteError("invalid-remote", "pulled remote failed validation",
                              {"diagnostics": diag})

        if has_existing:
            # The staged clone has already been fully verified.  Only now may
            # the managed checkout fetch and fast-forward to it.  A failed
            # merge leaves its worktree and payloads untouched.
            try:
                run_git(local_repo, "fetch", "--quiet", validated, branch)
                run_git(local_repo, "merge", "--quiet", "--ff-only", "FETCH_HEAD")
            except RuntimeError as exc:
                raise RemoteError("merge-conflict", "cannot fast-forward; local and remote have diverged",
                                  {"resolve": "resolve conflicts manually or clone fresh"}) from exc
            remotes = run_git(local_repo, "remote").splitlines()
            if "skill-save" in remotes:
                run_git(local_repo, "remote", "set-url", "skill-save", validated)
            else:
                run_git(local_repo, "remote", "add", "skill-save", validated)
        else:
            local_repo.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(tmp_dir), str(local_repo))
            subprocess.run(
                ["git", "-C", str(local_repo), "remote", "add", "skill-save", validated],
                capture_output=True, env=_git_env(),
            )

    return {"status": "pulled", "remote": validated, "branch": branch}


def sync_status(remote_url: str | None, local_repo: Path | None) -> dict[str, Any]:
    """Report sync status between local and remote (deterministic, never mutates)."""
    result: dict[str, Any] = {
        "remote_configured": remote_url is not None,
        "local_repo_exists": local_repo is not None and local_repo.is_dir() and (local_repo / "library.json").is_file(),
    }
    if not result["remote_configured"]:
        result["status"] = "no-remote"
        return result
    if not result["local_repo_exists"]:
        result["status"] = "no-local-repo"
        return result

    validated = validate_remote_url(remote_url)
    if validated is None:
        result["status"] = "invalid-remote-url"
        return result

    try:
        proc = subprocess.run(
            ["git", "-C", str(local_repo), "fetch", "--quiet", "skill-save", "main"],
            text=True, encoding="utf-8", errors="replace", capture_output=True,
            timeout=60, env=_git_env(),
        )
        if proc.returncode != 0:
            result["status"] = "remote-unreachable"
            result["detail"] = proc.stderr.strip()[:200]
            return result
    except Exception:
        result["status"] = "remote-unreachable"
        return result

    try:
        behind = run_git(local_repo, "rev-list", "--count", "main..skill-save/main").strip()
        ahead = run_git(local_repo, "rev-list", "--count", "skill-save/main..main").strip()
    except RuntimeError:
        result["status"] = "unknown"
        return result

    behind_int = int(behind) if behind.isdigit() else 0
    ahead_int = int(ahead) if ahead.isdigit() else 0

    try:
        local_head = run_git(local_repo, "rev-parse", "--short", "HEAD").strip()
        remote_head = run_git(local_repo, "rev-parse", "--short", "skill-save/main").strip()
    except RuntimeError:
        local_head = None
        remote_head = None

    if behind_int == 0 and ahead_int == 0:
        result["status"] = "synced"
    elif behind_int > 0 and ahead_int == 0:
        result["status"] = "behind"
        result["commits_behind"] = behind_int
    elif behind_int == 0 and ahead_int > 0:
        result["status"] = "ahead"
        result["commits_ahead"] = ahead_int
    else:
        result["status"] = "diverged"
        result["commits_behind"] = behind_int
        result["commits_ahead"] = ahead_int

    if local_head:
        result["local_head"] = local_head
    if remote_head:
        result["remote_head"] = remote_head

    return result
