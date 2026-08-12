"""Selective acquisition: staging, security gates, quarantine, atomic cache.

Network access happens only inside `fetch_payload`, which is only reached from
explicit `fetch`/`install` commands. Nothing in this module ever executes
fetched content; fetched trees are treated strictly as data.
"""
from __future__ import annotations

import os
import json
import re
import shutil
import stat
import subprocess
import uuid
from pathlib import Path
from typing import Any

from .library import (
    PERMITTED_REDISTRIBUTION,
    REDISTRIBUTION_VALUES,
    SECRET_PATTERNS,
    WINDOWS_DEVICE_NAMES,
    contains_privacy_token,
    directory_checksum,
    is_reparse_point,
    json_dump,
    read_json,
    run_git,
    normalize_redistribution,
    utc_now_iso,
    write_json,
)


MAX_FILES = 4000
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 60 * 1024 * 1024
QUARANTINE_HISTORY_LIMIT = 100
BINARY_SUFFIXES = {
    ".exe", ".dll", ".so", ".dylib", ".bin", ".msi", ".com", ".scr", ".pif",
    ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".whl",
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".woff", ".woff2",
    ".ttf", ".otf", ".hwp", ".hwpx", ".docx", ".xlsx", ".pptx", ".class",
    ".jar", ".wasm",
}

GIT_FETCH_TIMEOUT = 600


class AcquisitionError(RuntimeError):
    """Machine-readable acquisition failure."""

    def __init__(self, code: str, detail: str):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


def license_gate(item: dict[str, Any]) -> tuple[bool, str]:
    archive = item.get("archive", {})
    license_info = archive.get("license", {}) if isinstance(archive, dict) else {}
    declared = str(license_info.get("declared", "unknown")).strip()
    raw_redistribution = str(license_info.get("redistribution", "unknown")).strip().casefold()
    redistribution = normalize_redistribution(raw_redistribution)
    if declared.casefold() in {"unknown", "unclassified", "not-stated", ""}:
        return False, "license-gate: declared license is unknown"
    if raw_redistribution != redistribution or redistribution not in REDISTRIBUTION_VALUES:
        return False, f"license-gate: redistribution status '{raw_redistribution}' is not normalized"
    if redistribution not in PERMITTED_REDISTRIBUTION:
        return False, f"license-gate: redistribution status '{redistribution}' does not permit acquisition"
    return True, ""


def acquisition_plan(item: dict[str, Any]) -> dict[str, Any]:
    """Return the catalog's acquisition block or raise with the exact reason."""
    plan = item.get("acquisition")
    if not isinstance(plan, dict):
        raise AcquisitionError("no-acquisition", f"{item.get('catalog_id')}: catalog record has no acquisition metadata")
    if plan.get("status") != "available":
        reason = plan.get("reason") or "catalog record is not acquirable"
        status = item.get("archive", {}).get("status", "unknown")
        raise AcquisitionError("not-acquirable", f"{item.get('catalog_id')}: {status}; {reason}")
    method = plan.get("method")
    if method not in {"packaged", "git-sparse"}:
        raise AcquisitionError("bad-acquisition", f"{item.get('catalog_id')}: unsupported acquisition method {method!r}")
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    source_path = str(source.get("path") or "")
    expected = item.get("verification", {}).get("checksum")
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise AcquisitionError("no-expected-identity", f"{item.get('catalog_id')}: catalog record has no expected checksum")
    if plan.get("expected_checksum") != expected:
        raise AcquisitionError("bad-acquisition", f"{item.get('catalog_id')}: acquisition checksum does not match catalog verification")
    archive_license = item.get("archive", {}).get("license", {})
    expected_license = {
        "declared": archive_license.get("declared", "unknown"),
        "redistribution": archive_license.get("redistribution", "unknown"),
    }
    if plan.get("license_gate") != expected_license:
        raise AcquisitionError("bad-acquisition", f"{item.get('catalog_id')}: acquisition license metadata does not match archive license metadata")
    allowed, reason = license_gate(item)
    if not allowed:
        raise AcquisitionError("license-gate", f"{item.get('catalog_id')}: {reason}")
    if unsafe_rel_path(source_path):
        raise AcquisitionError("bad-subdirectory", f"{item.get('catalog_id')}: unsafe source path {source_path!r}")
    if method == "packaged":
        if plan.get("path") != source_path:
            raise AcquisitionError("bad-acquisition", f"{item.get('catalog_id')}: packaged path does not match source path")
    else:
        revision = str(source.get("commit") or "")
        if plan.get("revision") != revision or not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise AcquisitionError("bad-revision", f"{item.get('catalog_id')}: acquisition revision does not match source commit")
        repository = str(plan.get("repository") or "")
        if not repository.startswith("https://"):
            raise AcquisitionError("bad-acquisition", f"{item.get('catalog_id')}: public acquisition repository must use HTTPS")
        if plan.get("repository") != source.get("repository"):
            raise AcquisitionError("bad-acquisition", f"{item.get('catalog_id')}: acquisition repository does not match source repository")
        if plan.get("subdirectory") != source_path:
            raise AcquisitionError(f"bad-acquisition", f"{item.get('catalog_id')}: acquisition subtree does not match source path")
    return plan


def _git_env() -> dict[str, str]:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_CONFIG_NOSYSTEM"] = "1"
    env["GIT_CONFIG_GLOBAL"] = os.devnull
    env.pop("GIT_ASKPASS", None)
    env.pop("SSH_ASKPASS", None)
    return env


def _git(staging: Path, *args: str, timeout: int = GIT_FETCH_TIMEOUT) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["git", "-C", str(staging), *args],
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=timeout,
            env=_git_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise AcquisitionError("git-timeout", f"git {' '.join(args[:2])} exceeded {timeout} seconds") from exc


def _git_must(staging: Path, *args: str) -> str:
    proc = _git(staging, *args)
    if proc.returncode:
        raise AcquisitionError("git-failed", f"git {' '.join(args[:2])}: {proc.stderr.strip()[:400]}")
    return proc.stdout


def fetch_git_sparse(repository: str, revision: str, subdirectory: str, workdir: Path) -> Path:
    """Sparse/partial checkout of exactly one subdirectory at an exact SHA.

    Returns the payload directory (workdir/subdirectory). Unrelated subtrees
    are never materialized; with server support, unrelated blobs are not even
    downloaded (blob-less partial fetch).
    """
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise AcquisitionError("bad-revision", f"revision is not a 40-character SHA: {revision!r}")
    subdir = subdirectory.strip("/")
    if unsafe_rel_path(subdir):
        raise AcquisitionError("bad-subdirectory", f"unsafe subdirectory: {subdirectory!r}")
    if subdir in {"", "."}:
        raise AcquisitionError("bad-subdirectory", f"unsafe subdirectory: {subdirectory!r}")
    if repository.startswith("-"):
        raise AcquisitionError("bad-repository", "repository argument may not begin with '-' ")
    if "://" in repository and not repository.startswith("https://"):
        raise AcquisitionError("bad-repository", "only HTTPS upstreams or explicit local mirrors are supported")
    workdir.mkdir(parents=True, exist_ok=False)
    _git_must(workdir, "init", "--quiet")
    _git_must(workdir, "config", "core.symlinks", "false")
    _git_must(workdir, "config", "core.autocrlf", "false")
    _git_must(workdir, "sparse-checkout", "init", "--no-cone")
    _git_must(workdir, "sparse-checkout", "set", "--no-cone", f"/{subdir}/**")
    _git_must(workdir, "remote", "add", "origin", repository)
    fetched = False
    for attempt in (
        ["fetch", "--quiet", "--no-progress", "--no-tags", "--depth", "1", "--filter=blob:none", "origin", revision],
        ["fetch", "--quiet", "--no-progress", "--no-tags", "--depth", "1", "origin", revision],
        ["fetch", "--quiet", "--no-progress", "--no-tags", "origin", revision],
    ):
        proc = _git(workdir, *attempt)
        if proc.returncode == 0:
            fetched = True
            break
    if not fetched:
        raise AcquisitionError("fetch-failed", f"unable to fetch revision {revision} from {repository}: {proc.stderr.strip()[:400]}")
    tree = _git_must(workdir, "ls-tree", "-r", revision, "--", subdir)
    for row in tree.splitlines():
        mode = row.split(None, 1)[0] if row.split(None, 1) else ""
        if mode in {"120000", "160000"}:
            raise AcquisitionError("link", f"pinned subtree contains a symlink or submodule: {row}")
    _git_must(workdir, "-c", "advice.detachedHead=false", "checkout", "--quiet", "--detach", "FETCH_HEAD")
    head = _git_must(workdir, "rev-parse", "HEAD").strip()
    if head != revision:
        raise AcquisitionError("revision-mismatch", f"checkout HEAD {head} != pinned revision {revision}")
    payload = workdir / subdir
    if not payload.is_dir():
        raise AcquisitionError("missing-subdirectory", f"revision {revision} has no subdirectory '{subdir}'")
    for path in workdir.rglob("*"):
        relative = path.relative_to(workdir)
        if ".git" in relative.parts:
            continue
        if path.is_file() and not path.is_relative_to(payload):
            raise AcquisitionError("unexpected-materialization", f"unrelated file materialized outside '{subdir}': {relative}")
    return payload


def copy_packaged(source_dir: Path, workdir: Path) -> Path:
    """Stage packaged first-party content (no network, no execution)."""
    if not source_dir.is_dir():
        raise AcquisitionError("packaged-missing", f"packaged content is missing: {source_dir}")
    workdir.mkdir(parents=True, exist_ok=False)
    payload = workdir / "payload"
    # pip may byte-compile Python files that intentionally live inside a skill
    # payload.  Those interpreter-generated files are neither catalog content
    # nor executable source and would otherwise make a verified wheel differ
    # from the release checksum.  Exclude only standard bytecode artifacts;
    # every authored source file still goes through the normal static scan.
    shutil.copytree(
        source_dir,
        payload,
        symlinks=True,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"),
    )
    return payload


def unsafe_rel_path(rel: str) -> str | None:
    """Reject traversal, absolute POSIX/Windows paths, UNC and device names."""
    if not rel or "\x00" in rel:
        return "empty path"
    posix = rel.replace("\\", "/")
    if posix.startswith("/") or posix.startswith("~/"):
        return f"absolute path: {rel}"
    if posix.startswith("//"):
        return f"UNC path: {rel}"
    if re.match(r"^[A-Za-z]:", rel):
        return f"drive or drive-relative path: {rel}"
    parts = posix.split("/")
    for part in parts:
        if not part:
            return f"empty path component: {rel}"
        if part in {"..", "."}:
            return f"traversal component: {rel}"
        if ":" in part:
            return f"unsafe component (colon): {rel}"
        if any(char in part for char in '<>"|?*'):
            return f"invalid Windows filename character: {rel}"
        stem = part.split(".")[0].upper()
        if stem in WINDOWS_DEVICE_NAMES:
            return f"device name: {rel}"
        if part.endswith((" ", ".")):
            return f"trailing dot/space component: {rel}"
    return None


def scan_payload(root: Path, *, allow_binaries: bool = False) -> list[dict[str, str]]:
    """Static safety scan of a staged payload. Never executes anything."""
    findings: list[dict[str, str]] = []
    if not root.is_dir() or is_reparse_point(root):
        return [{"code": "invalid-root", "path": str(root), "detail": "staging root must be a real directory"}]
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
            findings.append({"code": "path-escape", "path": rel, "detail": "resolves outside the staging root"})
            continue
        if ".git" in path.relative_to(root).parts:
            findings.append({"code": "nested-git", "path": rel, "detail": "nested repository metadata is not allowed"})
            continue
        if path.is_symlink() or is_reparse_point(path):
            findings.append({"code": "link", "path": rel, "detail": "symlink, junction, or reparse point is not allowed"})
            continue
        if path.is_dir():
            continue
        file_count += 1
        if file_count > MAX_FILES:
            findings.append({"code": "too-many-files", "path": rel, "detail": f"more than {MAX_FILES} files"})
            continue
        try:
            size = path.stat().st_size
        except OSError as exc:
            findings.append({"code": "unreadable", "path": rel, "detail": str(exc)})
            continue
        if size > MAX_FILE_BYTES:
            findings.append({"code": "file-too-large", "path": rel, "detail": f"{size} bytes exceeds {MAX_FILE_BYTES}"})
            continue
        total_bytes += size
        if total_bytes > MAX_TOTAL_BYTES:
            findings.append({"code": "payload-too-large", "path": rel, "detail": f"total exceeds {MAX_TOTAL_BYTES} bytes"})
            continue
        payload = path.read_bytes()
        suffix = path.suffix.lower()
        if not allow_binaries and (suffix in BINARY_SUFFIXES or b"\x00" in payload):
            findings.append({"code": "binary", "path": rel, "detail": "binary payload is not allowed by policy"})
            continue
        try:
            text = payload.decode("utf-8")
        except UnicodeDecodeError:
            if not allow_binaries:
                findings.append({"code": "binary", "path": rel, "detail": "non-UTF-8 payload is not allowed by policy"})
            continue
        for label, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append({"code": "secret-like", "path": rel, "detail": f"secret-like pattern: {label}"})
        if contains_privacy_token(text) or contains_privacy_token(rel):
            findings.append({"code": "privacy-token", "path": rel, "detail": "privacy denylist match"})
    return findings


def promote_to_cache(payload: Path, cache_root: Path) -> tuple[str, Path]:
    """Atomically promote a scanned payload into the content-addressed cache."""
    checksum = directory_checksum(payload)
    if not re.fullmatch(r"[0-9a-f]{64}", checksum):
        raise AcquisitionError("bad-cache-key", "computed cache identity is invalid")
    if cache_root.exists() and is_reparse_point(cache_root):
        raise AcquisitionError("cache-root-linked", f"cache root is a symlink or reparse point: {cache_root}")
    destination = cache_root / checksum
    if destination.exists() or destination.is_symlink():
        if not destination.is_dir() or is_reparse_point(destination):
            raise AcquisitionError("cache-collision", f"cache identity is occupied by a non-directory: {destination}")
        if directory_checksum(destination) != checksum:
            raise AcquisitionError("cache-corrupt", f"existing cache object does not match its identity: {destination}")
        _mark_readonly(destination)
        return checksum, destination
    cache_root.mkdir(parents=True, exist_ok=True)
    tmp = cache_root / f".incoming-{uuid.uuid4().hex}"
    shutil.move(str(payload), str(tmp))
    try:
        os.replace(tmp, destination)
    except OSError:
        if destination.is_dir() and not is_reparse_point(destination) and directory_checksum(destination) == checksum:
            shutil.rmtree(tmp, ignore_errors=True)
            return checksum, destination
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    _mark_readonly(destination)
    return checksum, destination


def _mark_readonly(directory: Path) -> None:
    for path in sorted(directory.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if path.is_file() or path.is_dir():
            try:
                os.chmod(path, stat.S_IREAD | stat.S_IRGRP | stat.S_IROTH | (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH if path.is_dir() else 0))
            except OSError:
                pass


def clear_readonly(directory: Path) -> None:
    for path in sorted(directory.rglob("*"), key=lambda p: len(p.parts)):
        try:
            os.chmod(path, stat.S_IREAD | stat.S_IWRITE | (stat.S_IEXEC if path.is_dir() else 0))
        except OSError:
            pass


def cache_path(state_dir: Path, cache_key: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{64}", cache_key):
        raise ValueError(f"invalid cache key: {cache_key!r}")
    return state_dir / "cache" / cache_key


def record_quarantine(state_dir: Path, record: dict[str, Any]) -> None:
    path = state_dir / "quarantine.jsonl"
    state_dir.mkdir(parents=True, exist_ok=True)
    record = dict(record)
    record.setdefault("when", utc_now_iso())
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def quarantine_history(state_dir: Path, limit: int = QUARANTINE_HISTORY_LIMIT) -> list[dict[str, Any]]:
    path = state_dir / "quarantine.jsonl"
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            import json as _json

            rows.append(_json.loads(line))
        except ValueError:
            continue
    return rows[-limit:]


def fetch_item(
    item: dict[str, Any],
    state_dir: Path,
    *,
    packaged_root: Path | None = None,
    checkout_root: Path | None = None,
    mirror_repo: str | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    """Fetch one catalog item into the immutable cache.

    Returns the acquisition record. Raises AcquisitionError with a
    machine-readable code on any failure; failed payloads are discarded and
    the failure is recorded in the quarantine log.
    """
    catalog_id = str(item.get("catalog_id"))
    state_dir = state_dir.resolve()
    plan: dict[str, Any] = {}
    method: str | None = None
    staging: Path | None = None
    try:
        plan = acquisition_plan(item)
        method = str(plan.get("method"))
        expected = item.get("verification", {}).get("checksum")
        if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise AcquisitionError("no-expected-identity", f"{catalog_id}: catalog record has no expected checksum")
        staging_root = state_dir / "staging"
        if staging_root.exists() and is_reparse_point(staging_root):
            raise AcquisitionError("staging-root-linked", f"staging root is a symlink or reparse point: {staging_root}")
        staging_root.mkdir(parents=True, exist_ok=True)
        staging = staging_root / uuid.uuid4().hex
        if method == "packaged":
            source_rel = str(plan.get("path") or "")
            candidates = []
            if packaged_root is not None:
                candidates.append(packaged_root / source_rel)
            if checkout_root is not None:
                candidates.append(checkout_root / source_rel)
            source_dir = next((candidate for candidate in candidates if candidate.is_dir() and not is_reparse_point(candidate)), None)
            if source_dir is None:
                raise AcquisitionError("packaged-missing", f"{catalog_id}: packaged content '{source_rel}' not found")
            payload = copy_packaged(source_dir, staging)
            repository = str(item.get("source", {}).get("repository", ""))
            subdirectory = source_rel
        elif method == "git-sparse":
            repository = mirror_repo or str(plan.get("repository") or "")
            if not repository:
                raise AcquisitionError("no-repository", f"{catalog_id}: acquisition has no repository")
            revision = str(plan.get("revision") or "")
            subdirectory = str(plan.get("subdirectory") or "")
            payload = fetch_git_sparse(repository, revision, subdirectory, staging)
        else:
            raise AcquisitionError("unknown-method", f"{catalog_id}: unknown acquisition method {method!r}")

        if not (payload / "SKILL.md").is_file():
            raise AcquisitionError("missing-skill-manifest", f"{catalog_id}: selected subtree has no SKILL.md")
        findings = scan_payload(payload)
        if findings:
            raise AcquisitionError(findings[0]["code"], f"{catalog_id}: staged payload rejected ({len(findings)} finding(s)); first: {findings[0]}")
        actual = directory_checksum(payload)
        if actual != expected:
            raise AcquisitionError("checksum-mismatch", f"{catalog_id}: fetched checksum {actual} != expected {expected}")
        checksum, cache_dir = promote_to_cache(payload, state_dir / "cache")
        record = {
            "catalog_id": catalog_id,
            "method": method,
            "repository": repository,
            "revision": str(plan.get("revision") or item.get("revision") or ""),
            "subdirectory": subdirectory,
            "mirror": mirror_repo if method == "git-sparse" and mirror_repo else None,
            "expected_checksum": expected,
            "cache_key": checksum,
            "fetched": utc_now_iso(),
            "license": item.get("archive", {}).get("license", {}),
            "update_policy": item.get("update_policy", "pinned"),
            "status": "verified",
        }
        return record
    except AcquisitionError as exc:
        record_quarantine(state_dir, {
            "catalog_id": catalog_id,
            "code": exc.code,
            "detail": exc.detail,
            "method": method,
            "repository": mirror_repo or str(plan.get("repository", "")),
            "revision": str(plan.get("revision", "")),
        })
        raise
    finally:
        if staging is not None:
            shutil.rmtree(staging, ignore_errors=True)


def verify_cached(item: dict[str, Any], state_dir: Path, state: dict[str, Any] | None = None) -> dict[str, Any]:
    """Offline verification of cached content against the catalog identity."""
    catalog_id = str(item.get("catalog_id"))
    expected = item.get("verification", {}).get("checksum")
    if state is None:
        state = read_json(state_dir / "state.json") if (state_dir / "state.json").is_file() else {}
    acquisition = state.get("acquisitions", {}).get(catalog_id)
    if not acquisition:
        return {"status": "not-fetched", "catalog_id": catalog_id, "expected": expected, "actual": None}
    cache_dir = cache_path(state_dir, str(acquisition.get("cache_key", "")))
    if not cache_dir.is_dir() or is_reparse_point(cache_dir):
        return {"status": "cache-missing", "catalog_id": catalog_id, "expected": expected, "actual": None, "cache_key": acquisition.get("cache_key")}
    findings = scan_payload(cache_dir)
    if findings:
        return {
            "status": "unsafe",
            "catalog_id": catalog_id,
            "expected": expected,
            "actual": None,
            "cache_key": acquisition.get("cache_key"),
            "findings": findings,
        }
    actual = directory_checksum(cache_dir)
    recorded_expected = acquisition.get("expected_checksum")
    ok = actual == acquisition.get("cache_key") and (expected is None or expected == actual) and (recorded_expected in (None, expected, actual))
    return {
        "status": "verified" if ok else "mismatch",
        "catalog_id": catalog_id,
        "expected": expected,
        "actual": actual,
        "cache_key": acquisition.get("cache_key"),
        "cache_path": str(cache_dir),
        "method": acquisition.get("method"),
        "repository": acquisition.get("repository"),
        "revision": acquisition.get("revision"),
    }
