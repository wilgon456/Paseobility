"""Phase 6 trust evidence: per-file manifests, bounded static scan, verdicts.

Every primitive here treats skill payloads strictly as data. Nothing is ever
executed, and every report states that pins, checksums, publisher identity,
archives, and clean static scans are evidence, never runtime-safety
guarantees.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

try:
    from .acquire import MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, scan_payload
    from .library import is_reparse_point, normalize_bytes
except ImportError:  # pragma: no cover - direct script execution
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from skillhub.acquire import MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, scan_payload  # type: ignore
    from skillhub.library import is_reparse_point, normalize_bytes  # type: ignore


MANIFEST_SCHEMA_VERSION = 1
SCAN_SCHEMA_VERSION = 1
VERDICT_SCHEMA_VERSION = 1
SCAN_DISCLAIMER = (
    "Bounded static scan: heuristic, non-exhaustive, and never executes content. "
    "A clean result is evidence, not a runtime-safety guarantee."
)
REVIEW_PATTERNS = (
    ("remote-script-execution", re.compile(r"(?i)\b(?:curl|wget)\b[^\n]{0,160}\|\s*(?:ba|z|da|k)?sh\b")),
    ("remote-script-execution", re.compile(r"(?i)invoke-(?:expression|webrequest|restmethod)[^\n]{0,160}\|\s*iex\b")),
    ("obfuscated-execution", re.compile(r"(?i)(?:base64(?:\.b64decode|_-d)|frombase64string)[^\n]{0,120}(?:exec|eval|invoke|sh\b|python)")),
    ("credential-path-access", re.compile(r"(?i)(?:\.ssh/|\.aws/credentials|\.netrc|id_rsa|id_ed25519|keychain|credential[-_ ]?store)")),
    ("destructive-shell", re.compile(r"(?i)\brm\s+(?:-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[^\n]{0,80}[/~$]")),
    ("disk-overwrite", re.compile(r"(?i)\b(?:dd\s+if=|format\s+[a-z]:\s|diskpart)\b")),
    ("persistence-hook", re.compile(r"(?i)(?:crontab\s+-|schtasks\s+/create|launchctl\s+load|run\s?key|startup\s+folder)")),
)
REVIEW_PATTERN_SCOPE = {".md", ".txt", ".sh", ".bash", ".ps1", ".bat", ".py", ".js", ".ts", ".json", ".yaml", ".yml", ".toml"}


def file_manifest(root: Path) -> dict[str, Any]:
    """Deterministic per-file manifest of a payload tree.

    File hashes cover newline-normalized bytes (the same normalization used by
    the directory checksum), so the manifest is stable across checkouts.
    Symlinks and reparse points are recorded as links and never followed.
    """
    if not root.is_dir() or is_reparse_point(root):
        raise ValueError("manifest root must be a real directory")
    root_resolved = root.resolve()
    rows: list[dict[str, Any]] = []
    total_bytes = 0
    for path in sorted(root.rglob("*"), key=lambda p: p.as_posix()):
        rel = path.relative_to(root).as_posix()
        if ".git" in path.relative_to(root).parts:
            continue
        if path.is_symlink() or is_reparse_point(path):
            rows.append({"path": rel, "kind": "link", "size": 0, "sha256": None, "link_target": str(path.readlink())})
            continue
        if path.is_dir():
            continue
        try:
            path.resolve().relative_to(root_resolved)
        except ValueError:
            rows.append({"path": rel, "kind": "escape", "size": 0, "sha256": None, "link_target": None})
            continue
        payload = path.read_bytes()
        normalized = normalize_bytes(payload, path.suffix)
        total_bytes += len(normalized)
        rows.append({
            "path": rel,
            "kind": "file",
            "size": len(normalized),
            "sha256": hashlib.sha256(normalized).hexdigest(),
            "link_target": None,
        })
    rows.sort(key=lambda row: row["path"])
    digest = hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "root": str(root),
        "file_count": sum(1 for row in rows if row["kind"] == "file"),
        "link_count": sum(1 for row in rows if row["kind"] == "link"),
        "total_bytes": total_bytes,
        "digest": digest,
        "files": rows,
    }


def policy_scan(root: Path) -> dict[str, Any]:
    """Bounded static policy scan with severity levels.

    ``block`` findings are the enforceable acquisition gates (unsafe paths,
    links, binaries, secrets, size limits). ``review`` findings are heuristic
    instruction-level observations that never block on their own and never
    claim runtime safety.
    """
    findings: list[dict[str, str]] = []
    for row in scan_payload(root):
        findings.append({"severity": "block", **row})
    blocked = bool(findings)
    if not blocked and root.is_dir() and not is_reparse_point(root):
        reviewed = 0
        for path in sorted(root.rglob("*"), key=lambda p: p.as_posix()):
            if path.is_symlink() or is_reparse_point(path) or not path.is_file():
                continue
            if path.suffix.lower() not in REVIEW_PATTERN_SCOPE:
                continue
            reviewed += 1
            if reviewed > MAX_FILES:
                break
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if size > MAX_FILE_BYTES or size > MAX_TOTAL_BYTES:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            rel = path.relative_to(root).as_posix()
            for label, pattern in REVIEW_PATTERNS:
                if pattern.search(text):
                    findings.append({"severity": "review", "code": label, "path": rel, "detail": "heuristic instruction-level observation; not a runtime judgment"})
    counts = {"block": 0, "review": 0}
    for row in findings:
        counts[row["severity"]] = counts.get(row["severity"], 0) + 1
    return {
        "schema_version": SCAN_SCHEMA_VERSION,
        "root": str(root),
        "scope": {
            "max_files": MAX_FILES,
            "max_file_bytes": MAX_FILE_BYTES,
            "max_total_bytes": MAX_TOTAL_BYTES,
            "follows_symlinks": False,
            "executes_nothing": True,
        },
        "findings": sorted(findings, key=lambda row: (row["severity"], row["code"], row["path"])),
        "counts": counts,
        "blocked": blocked,
        "disclaimer": SCAN_DISCLAIMER,
    }


def trust_verdict(
    item: dict[str, Any],
    *,
    integrity_status: str | None = None,
    scan_blocked: bool | None = None,
    local_state: str | None = None,
) -> dict[str, Any]:
    """Deterministic trust verdict with explicit reasons and limitations."""
    reasons: list[str] = []
    archive = item.get("archive", {})
    status = archive.get("status")
    license_info = archive.get("license", {})
    trust = item.get("trust", {}) if isinstance(item.get("trust"), dict) else {}
    risk = str(item.get("risk", "destructive"))
    verdict = "review-required"
    if status == "blocked":
        verdict = "blocked"
        reasons.append(f"catalog status is blocked: {archive.get('blocker') or 'policy review required'}")
    elif status in {"metadata-only", "deprecated"}:
        verdict = "unavailable"
        reasons.append(f"catalog status is {status}: {archive.get('blocker') or 'no verified package boundary'}")
    elif status != "archived":
        verdict = "unavailable"
        reasons.append(f"catalog status {status} is not acquirable")
    else:
        redistribution = license_info.get("redistribution")
        personal_overlay = item.get("source_id") == "personal-overlay"
        if personal_overlay:
            verdict = "installable-caution"
            reasons.append("user-added local overlay; available only in this personal library")
        elif redistribution not in {"permitted-with-notice", "permitted-by-root-license"}:
            verdict = "unavailable"
            reasons.append(f"redistribution decision '{redistribution}' does not permit acquisition")
        elif trust.get("tier") == "project-authored":
            verdict = "installable-reviewed"
            reasons.append("first-party project-authored content with repository checksum")
        else:
            verdict = "installable-caution"
            reasons.append(f"{trust.get('tier') or 'unknown-tier'} source; review before trusting runtime behavior")
        reasons.append(f"license declared {license_info.get('declared')}, redistribution {redistribution}")
        source = item.get("source", {})
        if source.get("commit"):
            reasons.append(f"source pinned to commit {str(source['commit'])[:12]} of {source.get('repository')}")
        if item.get("verification", {}).get("checksum"):
            reasons.append("expected SHA-256 directory checksum recorded")
        reasons.append(f"risk level: {risk}")
        if trust.get("security_review") in {"not-reviewed", "not-a-certification"}:
            reasons.append(f"security review: {trust['security_review']}")
        if integrity_status == "mismatch":
            verdict = "review-required"
            reasons.append("local integrity mismatch; content does not match the recorded checksum")
        if integrity_status == "verified":
            reasons.append("local content verifies against the recorded checksum")
        if scan_blocked is True:
            verdict = "review-required"
            reasons.append("static scan found an enforceable policy violation")
        elif scan_blocked is False:
            reasons.append("bounded static scan found no enforceable violation (heuristic, not a runtime judgment)")
        if local_state:
            reasons.append(f"local state: {local_state}")
    return {
        "schema_version": VERDICT_SCHEMA_VERSION,
        "verdict": verdict,
        "reasons": reasons,
        "limitations": [
            "A pin, checksum, official publisher identity, archive, or clean static scan is evidence, never a runtime-safety guarantee.",
            "The manager never executes fetched content; runtime behavior depends on the skill text and the agent's own approvals.",
            "Bounded static scanning is heuristic and cannot detect all malicious or ambiguous instructions.",
        ],
    }
