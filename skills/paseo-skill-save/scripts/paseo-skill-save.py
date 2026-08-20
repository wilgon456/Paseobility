#!/usr/bin/env python3
"""Save a user-selected skill through Paseobility's verified routing manager."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from typing import Any, Sequence


MANAGER_REPOSITORY = "https://github.com/wilgon456/skillNload_private.git"
MANAGER_REVISION = "4c290e82422fd35d8501c28c7f5b4ca45ee47bbb"
MANAGER_TREE = "19c654fa9efc302d1679b7ba111a68f33efa4006"
MANAGER_COPY_DIRECTORIES = (
    "skillhub",
    "scripts",
    "catalog",
    "profiles",
    "schemas",
    "skills/skill-hub-router",
)
MANAGER_COPY_FILES = ("registry.json", "LICENSE", "NOTICE")
MANAGER_SKIP_NAMES = {".git", "__pycache__", ".pytest_cache", "build", "dist"}


class SaveError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = "") -> None:
        super().__init__(message)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class ManagerRuntime:
    command: tuple[str, ...]
    details: dict[str, Any]


def _json_output(payload: dict[str, Any]) -> None:
    # Keep stdout machine-readable even in Windows PowerShell 5.1 code pages.
    print(json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True))


def _utf8_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["PYTHONUTF8"] = "1"
    return environment


def _run_process(command: Sequence[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            list(command),
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            env=_utf8_environment(),
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise SaveError(
            "command-not-found", f"Required executable not found: {command[0]}"
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise SaveError("command-timeout", f"Command timed out: {command[0]}") from exc


def _run_checked_text(
    command: Sequence[str], timeout: int, code: str, message: str
) -> str:
    process = _run_process(command, timeout)
    if process.returncode:
        raise SaveError(code, message, process.stderr.strip() or process.stdout.strip())
    return process.stdout.strip()


def _is_link_or_reparse(path: Path) -> bool:
    if path.is_symlink():
        return True
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except OSError:
        return True
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def _path_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve(strict=False).relative_to(parent.resolve(strict=False))
        return True
    except ValueError:
        return False


def _manager_payload_files(root: Path) -> Sequence[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    for relative in MANAGER_COPY_FILES:
        path = root / relative
        if path.is_file():
            files.append((relative, path))
    for relative in MANAGER_COPY_DIRECTORIES:
        directory = root / relative
        if not directory.is_dir():
            continue
        if _is_link_or_reparse(directory):
            raise SaveError(
                "manager-verification-failed",
                "Routing engine contains a linked manager directory",
                relative,
            )
        for path in sorted(directory.rglob("*"), key=lambda item: item.as_posix()):
            child = path.relative_to(root)
            if any(part in MANAGER_SKIP_NAMES for part in child.parts):
                continue
            if _is_link_or_reparse(path):
                raise SaveError(
                    "manager-verification-failed",
                    "Routing engine contains a link or reparse point",
                    child.as_posix(),
                )
            if path.is_file():
                files.append((child.as_posix(), path))
    return files


def _manager_payload_digest(root: Path) -> str:
    digest = hashlib.sha256()
    found = False
    for relative, path in _manager_payload_files(root):
        found = True
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
        digest.update(b"\0")
    if not found:
        raise SaveError("manager-checkout-invalid", "Routing engine payload is empty")
    return digest.hexdigest()


def _manager_ready(root: Path) -> bool:
    required_files = (root / "registry.json", root / "scripts" / "skillhub.py")
    required_dirs = (
        root / "skillhub",
        root / "catalog",
        root / "skills" / "skill-hub-router",
    )
    return (
        root.is_dir()
        and not _is_link_or_reparse(root)
        and all(path.is_file() and not _is_link_or_reparse(path) for path in required_files)
        and all(path.is_dir() and not _is_link_or_reparse(path) for path in required_dirs)
    )


def _manager_state_dir(args: argparse.Namespace) -> Path:
    if args.state_dir:
        return Path(args.state_dir).expanduser().resolve()
    override = os.environ.get("SKILLHUB_STATE_DIR")
    if override:
        return Path(override).expanduser().resolve()
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        return (Path(base) / "ai-skill-library").resolve()
    base = os.environ.get("XDG_STATE_HOME")
    return ((Path(base) if base else Path.home() / ".local" / "state") / "ai-skill-library").resolve()


def _private_catalog_count(root: Path) -> int:
    try:
        registry = json.loads((root / "registry.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SaveError(
            "manager-verification-failed", "Managed routing engine registry is invalid"
        ) from exc
    return sum(
        1
        for item in registry.get("skills", [])
        if isinstance(item, dict) and item.get("source_id") == "private-library"
    )


def _installed_private_manager(args: argparse.Namespace) -> ManagerRuntime | None:
    state_dir = _manager_state_dir(args)
    runtime_root = (state_dir / "runtime").resolve()
    record_path = runtime_root / "manager.json"
    if not record_path.is_file():
        return None
    try:
        record = json.loads(record_path.read_text(encoding="utf-8"))
        root = Path(str(record["path"])).expanduser().resolve()
        expected_digest = str(record["content_digest"])
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise SaveError(
            "manager-verification-failed", "Managed routing engine record is invalid"
        ) from exc
    if not _path_within(root, runtime_root) or not _manager_ready(root):
        raise SaveError(
            "manager-verification-failed",
            "Managed routing engine is missing or outside manager-owned state",
        )
    actual_digest = _manager_payload_digest(root)
    if actual_digest != expected_digest:
        raise SaveError(
            "manager-verification-failed",
            "Managed routing engine content changed",
            f"expected={expected_digest}; actual={actual_digest}",
        )
    # A manager-only runtime intentionally has no bundled personal catalog.
    # It still owns the overlay-aware registry loader and must be preferred so
    # that save/load uses paseo_skill_save rather than falling back to the
    # historical public bundle.  Returning None for zero preloaded items made
    # the wrapper silently select the legacy manager and could produce a
    # successful local mutation followed by a false receipt/reporting error.
    private_items = _private_catalog_count(root)
    launcher = root / "scripts" / "skillhub.py"
    return ManagerRuntime(
        command=(args.python, str(launcher), "--repo", str(root)),
        details={
            "mode": "installed-private-runtime",
            "path": str(root),
            "state_dir": str(state_dir),
            "content_digest": actual_digest,
            "revision": record.get("revision"),
            "private_catalog_items": private_items,
            "personal_library": "paseo_skill_save",
        },
    )


def _bundled_manager(args: argparse.Namespace) -> ManagerRuntime | None:
    root = Path(__file__).resolve().parents[1] / "manager"
    manifest_path = root / "manager-manifest.json"
    if not manifest_path.is_file():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        expected_digest = str(manifest["content_digest"])
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise SaveError(
            "manager-verification-failed", "Bundled routing engine manifest is invalid"
        ) from exc
    if manifest.get("schema_version") != 1 or not _manager_ready(root):
        raise SaveError(
            "manager-verification-failed", "Bundled routing engine is incomplete"
        )
    actual_digest = _manager_payload_digest(root)
    if actual_digest != expected_digest:
        raise SaveError(
            "manager-verification-failed",
            "Bundled routing engine content changed",
            f"expected={expected_digest}; actual={actual_digest}",
        )
    launcher = root / "scripts" / "skillhub.py"
    return ManagerRuntime(
        command=(args.python, str(launcher), "--repo", str(root)),
        details={
            "mode": "bundled-public-fallback",
            "repository": manifest.get("repository"),
            "revision": manifest.get("revision"),
            "tree": manifest.get("tree"),
            "content_digest": actual_digest,
            "path": str(root),
        },
    )


def _validate_manager_checkout(path: Path, timeout: int) -> tuple[str, str]:
    if not path.is_dir() or _is_link_or_reparse(path):
        raise SaveError(
            "manager-checkout-invalid", "Pinned routing engine path is not a safe directory"
        )
    revision = _run_checked_text(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        timeout,
        "manager-verification-failed",
        "Could not verify the pinned routing engine commit",
    )
    tree = _run_checked_text(
        ["git", "-C", str(path), "rev-parse", "HEAD^{tree}"],
        timeout,
        "manager-verification-failed",
        "Could not verify the pinned routing engine tree",
    )
    if revision != MANAGER_REVISION or tree != MANAGER_TREE:
        raise SaveError(
            "manager-verification-failed",
            "Pinned routing engine commit or tree does not match",
            f"revision={revision}; tree={tree}",
        )
    status_output = _run_checked_text(
        ["git", "-C", str(path), "status", "--porcelain", "--untracked-files=all"],
        timeout,
        "manager-verification-failed",
        "Could not verify the pinned routing engine working tree",
    )
    if status_output:
        raise SaveError(
            "manager-verification-failed",
            "Pinned routing engine working tree was modified",
            status_output[:500],
        )
    launcher = path / "scripts" / "skillhub.py"
    if not launcher.is_file() or _is_link_or_reparse(launcher):
        raise SaveError(
            "manager-launcher-missing",
            "Pinned routing engine has no safe scripts/skillhub.py launcher",
        )
    for candidate in path.rglob("*"):
        if _is_link_or_reparse(candidate):
            raise SaveError(
                "manager-checkout-invalid",
                "Pinned routing engine contains a link or reparse point",
                str(candidate.relative_to(path)),
            )
    return revision, tree


def _manager_cache_root(args: argparse.Namespace) -> Path:
    if args.manager_dir:
        return Path(args.manager_dir).expanduser().resolve()
    base = Path(args.home).expanduser().resolve() if args.home else Path.home()
    return base / ".paseo" / "skill-save" / "manager"


def _provided_manager(args: argparse.Namespace) -> ManagerRuntime:
    root = Path(args.repo).expanduser().resolve()
    launcher = root / "scripts" / "skillhub.py"
    if not root.is_dir() or _is_link_or_reparse(root):
        raise SaveError("manager-checkout-invalid", "Provided routing engine checkout is invalid")
    if not launcher.is_file() or _is_link_or_reparse(launcher):
        raise SaveError(
            "manager-launcher-missing",
            "Provided routing engine checkout has no safe scripts/skillhub.py launcher",
        )
    return ManagerRuntime(
        command=(args.python, str(launcher), "--repo", str(root)),
        details={"mode": "provided-checkout", "path": str(root)},
    )


def _bootstrap_manager(args: argparse.Namespace) -> ManagerRuntime:
    if args.repo:
        return _provided_manager(args)

    installed = _installed_private_manager(args)
    if installed is not None:
        return installed

    bundled = _bundled_manager(args)
    if bundled is not None:
        return bundled

    cache_root = _manager_cache_root(args)
    cache_root.mkdir(parents=True, exist_ok=True)
    if _is_link_or_reparse(cache_root):
        raise SaveError(
            "manager-cache-invalid", "Routing engine cache is a link or reparse point"
        )
    checkout = cache_root / MANAGER_REVISION
    if not checkout.exists():
        temporary = Path(tempfile.mkdtemp(prefix=".bootstrap-", dir=cache_root))
        try:
            _run_checked_text(
                ["git", "init", str(temporary)],
                args.timeout,
                "manager-bootstrap-failed",
                "Could not initialize the routing engine cache",
            )
            _run_checked_text(
                ["git", "-C", str(temporary), "remote", "add", "origin", MANAGER_REPOSITORY],
                args.timeout,
                "manager-bootstrap-failed",
                "Could not configure the routing engine source",
            )
            _run_checked_text(
                [
                    "git",
                    "-C",
                    str(temporary),
                    "fetch",
                    "--depth",
                    "1",
                    "origin",
                    MANAGER_REVISION,
                ],
                args.timeout,
                "manager-bootstrap-failed",
                "Could not fetch the pinned routing engine",
            )
            _run_checked_text(
                ["git", "-C", str(temporary), "checkout", "--detach", "FETCH_HEAD"],
                args.timeout,
                "manager-bootstrap-failed",
                "Could not check out the pinned routing engine",
            )
            _validate_manager_checkout(temporary, args.timeout)
            try:
                temporary.replace(checkout)
            except OSError:
                # Another invocation can win the atomic directory rename. On
                # Windows that race is not consistently reported as
                # FileExistsError, so only accept it when the final checkout
                # now exists and independently passes every pin check.
                if not checkout.exists():
                    raise
                _validate_manager_checkout(checkout, args.timeout)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)

    revision, tree = _validate_manager_checkout(checkout, args.timeout)
    launcher = checkout / "scripts" / "skillhub.py"
    return ManagerRuntime(
        command=(args.python, str(launcher), "--repo", str(checkout)),
        details={
            "mode": "auto-pinned",
            "repository": MANAGER_REPOSITORY.removesuffix(".git"),
            "revision": revision,
            "tree": tree,
            "path": str(checkout),
        },
    )


def _manager_prefix(args: argparse.Namespace, runtime: ManagerRuntime) -> list[str]:
    command = list(runtime.command)
    if args.home:
        command += ["--home", str(Path(args.home).expanduser())]
    if args.state_dir:
        command += ["--state-dir", str(Path(args.state_dir).expanduser())]
    return command


def _manager_failure_detail(process: subprocess.CompletedProcess[str]) -> str:
    return (process.stderr or "").strip() or (process.stdout or "").strip()


def _is_invalid_routing_metadata_failure(detail: str) -> bool:
    """Detect invented or out-of-taxonomy --domain/--action values from the engine."""
    lowered = detail.lower()
    markers = (
        "unknown routing domain",
        "unknown routing action",
        "routing.domains is invalid",
        "routing.actions is invalid",
        "routing.behavior_classes is invalid",
    )
    return any(marker in lowered for marker in markers)


def _raise_manager_failure(process: subprocess.CompletedProcess[str]) -> None:
    detail = _manager_failure_detail(process)
    if "No module named skillhub" in detail:
        raise SaveError(
            "manager-runtime-unavailable",
            "The active routing manager failed to load",
            detail,
        )
    if _is_invalid_routing_metadata_failure(detail):
        raise SaveError(
            "invalid-routing-metadata",
            (
                "Controlled --domain/--action values are invalid for the active "
                "routing manager. Retry without --domain/--action (description and "
                "Korean tags are enough), or supply verified taxonomy IDs from the "
                "active manager. Do not invent domain or action identifiers."
            ),
            detail,
        )
    raise SaveError(
        "manager-command-failed",
        "The routing engine rejected the request",
        detail,
    )


def _run_json(command: Sequence[str], timeout: int) -> dict[str, Any]:
    process = _run_process(command, timeout)

    if process.returncode:
        _raise_manager_failure(process)
    try:
        payload = json.loads(process.stdout)
    except json.JSONDecodeError as exc:
        raise SaveError(
            "invalid-manager-output",
            "The routing engine did not return valid JSON",
            process.stdout[:500],
        ) from exc
    if not isinstance(payload, dict):
        raise SaveError(
            "invalid-manager-output", "The routing engine returned a non-object JSON result"
        )
    return payload


def _build_add_command(
    args: argparse.Namespace, prefix: list[str], source: str | None = None
) -> list[str]:
    command = prefix + ["add", source or args.source]
    if args.description_ko:
        command += ["--description-ko", args.description_ko]
    for tag in args.tag_ko:
        command += ["--tag-ko", tag]
    for domain in args.domain:
        command += ["--domain", domain]
    for action in args.action:
        command += ["--action", action]
    if args.name:
        command += ["--name", args.name]
    if args.risk:
        command += ["--risk", args.risk]
    if args.overlay_dir:
        command += ["--overlay-dir", str(Path(args.overlay_dir).expanduser())]
    if getattr(args, "approve_medium", False):
        command.append("--approve-medium")
    if getattr(args, "local_only", False):
        command.append("--local-only")
    command.append("--json")
    return command


def _spyware_scanner_path() -> Path:
    return (
        Path(__file__).resolve().parents[2]
        / "paseo-spyware-check"
        / "scripts"
        / "spyware-check.py"
    )


def _load_spyware_scanner() -> Any:
    scanner = _spyware_scanner_path()
    if not scanner.is_file() or _is_link_or_reparse(scanner):
        raise SaveError(
            "spyware-check-unavailable",
            "The bundled spyware scanner is missing or unsafe",
            str(scanner),
        )
    spec = importlib.util.spec_from_file_location("paseo_bundled_spyware_check", scanner)
    if spec is None or spec.loader is None:
        raise SaveError(
            "spyware-check-unavailable", "The bundled spyware scanner could not be loaded"
        )
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        raise SaveError(
            "spyware-check-unavailable",
            "The bundled spyware scanner could not be loaded",
            str(exc),
        ) from exc
    if not callable(getattr(module, "scan_target", None)):
        raise SaveError(
            "spyware-check-unavailable", "The bundled spyware scanner has no scan entrypoint"
        )
    return module


def _load_policy_contract() -> Any:
    contract = Path(__file__).resolve().parents[2] / "paseo-spyware-check" / "scripts" / "security_policy.py"
    spec = importlib.util.spec_from_file_location("paseo_skill_save_policy", contract)
    if spec is None or spec.loader is None:
        raise SaveError("spyware-check-unavailable", "The bundled security policy contract is missing")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        raise SaveError("spyware-check-unavailable", "The bundled security policy contract could not be loaded", str(exc)) from exc
    return module


def _validate_scan_receipt(receipt: Any) -> dict[str, Any]:
    if not isinstance(receipt, dict):
        raise SaveError("spyware-check-invalid", "Spyware scan returned no valid receipt")
    scanner = receipt.get("scanner")
    counts = receipt.get("counts")
    findings = receipt.get("findings")
    source = receipt.get("source")
    supplied_digest = receipt.get("receipt_sha256")
    if (
        receipt.get("status") != "scan-complete"
        or not isinstance(scanner, dict)
        or scanner.get("name") != "paseo-spyware-check"
        or scanner.get("schema_version") != 2
        or not isinstance(counts, dict)
        or not isinstance(findings, list)
        or not isinstance(source, dict)
        or source.get("kind") not in {"github", "local"}
        or not isinstance(receipt.get("content_checksum"), str)
        or not re.fullmatch(r"[0-9a-f]{64}", receipt["content_checksum"])
        or not isinstance(supplied_digest, str)
        or not re.fullmatch(r"[0-9a-f]{64}", supplied_digest)
    ):
        raise SaveError("spyware-check-invalid", "Spyware scan receipt is incomplete")
    for severity in ("critical", "high", "medium", "info"):
        value = counts.get(severity)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise SaveError(
                "spyware-check-invalid", "Spyware scan receipt has invalid finding counts"
            )
    calculated = {severity: 0 for severity in ("critical", "high", "medium", "info")}
    contract = _load_policy_contract()
    finding_ids: list[str] = []
    for finding in findings:
        if not isinstance(finding, dict):
            raise SaveError("spyware-check-invalid", "Spyware scan finding is invalid")
        severity = str(finding.get("severity", "")).casefold()
        if severity not in calculated:
            raise SaveError("spyware-check-invalid", "Spyware scan severity is invalid")
        for field in ("finding_id", "rule_id", "confidence", "evidence", "mitigation", "path", "source_role"):
            if not isinstance(finding.get(field), (str, int)) or finding.get(field) in {"", None}:
                raise SaveError("spyware-check-invalid", f"Spyware scan finding is missing {field}")
        if not isinstance(finding.get("capabilities"), list) or not isinstance(finding.get("blocks"), bool) or not isinstance(finding.get("review"), bool):
            raise SaveError("spyware-check-invalid", "Spyware scan finding has invalid policy metadata")
        if finding.get("finding_id") != contract.finding_id(finding):
            raise SaveError("spyware-check-invalid", "Spyware finding ID is not stable for its rule/evidence")
        finding_ids.append(str(finding["finding_id"]))
        calculated[severity] += 1
    if counts != calculated:
        raise SaveError(
            "spyware-check-invalid", "Spyware scan counts do not match its findings"
        )
    expected_verdict = (
        "high"
        if counts["critical"] or counts["high"]
        else ("medium" if counts["medium"] else "low")
    )
    if receipt.get("verdict") != expected_verdict:
        raise SaveError("spyware-check-invalid", "Spyware scan verdict is inconsistent")
    scan = receipt.get("scan")
    if (
        not isinstance(scan, dict)
        or scan.get("schema_version") != 2
        or not all(isinstance(scan.get(field), int) and not isinstance(scan.get(field), bool) and scan.get(field) >= 0 for field in ("files_considered", "files_scanned", "max_findings", "max_scan_bytes_per_file"))
        or scan.get("files_scanned") > scan.get("files_considered")
        or not isinstance(scan.get("truncated"), bool)
        or not isinstance(scan.get("truncation_reasons"), list)
        or not all(isinstance(reason, str) and reason for reason in scan.get("truncation_reasons", []))
        or scan.get("target_code_executed") is not False
    ):
        raise SaveError("spyware-check-invalid", "Spyware scan truncation metadata is invalid")
    try:
        contract.validate_policy(
            receipt.get("policy"),
            expected_source=source,
            expected_checksum=receipt["content_checksum"],
            expected_finding_ids=finding_ids,
        )
    except Exception as exc:
        raise SaveError("spyware-check-invalid", "Spyware scan policy binding is invalid", str(exc)) from exc
    unsigned = dict(receipt)
    unsigned.pop("receipt_sha256", None)
    canonical = json.dumps(
        unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    expected_digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if supplied_digest != expected_digest:
        raise SaveError("spyware-check-invalid", "Spyware scan receipt digest does not match")
    return receipt


def _run_spyware_gate(
    args: argparse.Namespace, workspace: Path
) -> tuple[dict[str, Any], str]:
    module = _load_spyware_scanner()
    try:
        raw_receipt, add_source = module.scan_target(
            args.source, workspace, args.timeout
        )
    except Exception as exc:
        raise SaveError(
            "spyware-check-failed",
            "The source could not be acquired and statically inspected",
            getattr(exc, "detail", "") or str(exc),
        ) from exc
    receipt = _validate_scan_receipt(raw_receipt)
    # The wrapper's first scan is an immutable archive receipt.  It is not an
    # activation approval: High/Critical records may be preserved as blocked
    # or redacted quarantine metadata, while the manager remains strict when
    # fetch/enable/use/install is requested.  Medium/capability approval is
    # artifact-scoped and belongs to activation, not registration.
    if not isinstance(add_source, str) or not add_source:
        raise SaveError("spyware-check-invalid", "Spyware scan returned no immutable source")
    return receipt, add_source


def _bind_record_to_scan(receipt: dict[str, Any], record: dict[str, Any]) -> None:
    # A bulk add has one outer receipt and one manager-scoped receipt per
    # selected SKILL.md.  Bind to the latter when available; requiring the
    # outer repository checksum to equal every child was a false error that
    # occurred after the manager had already atomically saved the item.
    scoped = record.get("security_receipt")
    candidate = scoped if isinstance(scoped, dict) else receipt
    scanned = candidate.get("source")
    if not isinstance(scanned, dict):
        raise SaveError("scan-receipt-mismatch", "Saved skill has no security receipt source")
    contract = _load_policy_contract()
    security_policy = record.get("security_policy")
    if not isinstance(security_policy, dict):
        raise SaveError("scan-receipt-mismatch", "Saved skill has no versioned security policy")
    try:
        contract.validate_policy(
            security_policy,
            expected_source=scanned,
            expected_checksum=candidate.get("content_checksum"),
            expected_finding_ids=[str(row["finding_id"]) for row in candidate.get("findings", [])],
        )
    except Exception as exc:
        raise SaveError("scan-receipt-mismatch", "Saved security policy does not match the scan receipt", str(exc)) from exc
    expected_policy_digest = record.get("security_policy_sha256")
    if not isinstance(expected_policy_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_policy_digest):
        raise SaveError("scan-receipt-mismatch", "Saved skill has no valid security policy digest")
    if expected_policy_digest != contract.policy_digest(security_policy):
        raise SaveError("scan-receipt-mismatch", "Saved security policy digest does not match its policy")
    if scanned.get("kind") == "local":
        if record.get("checksum") != candidate.get("content_checksum"):
            raise SaveError(
                "scan-receipt-mismatch",
                "Saved local skill checksum does not match the spyware scan receipt",
            )
        return
    if scanned.get("kind") != "github":
        raise SaveError(
            "spyware-check-invalid", "Spyware scan receipt has an unknown source kind"
        )
    actual = record.get("source")
    if not isinstance(actual, dict) or actual.get("commit") != scanned.get("commit"):
        raise SaveError(
            "scan-receipt-mismatch",
            "Saved skill commit does not match the spyware scan receipt",
            json.dumps({"scanned": scanned, "saved": actual}, sort_keys=True),
        )
    scanned_path = str(scanned.get("path") or "").strip("/")
    actual_path = str(actual.get("path") or "").strip("/")
    if scanned_path and not (
        actual_path == scanned_path or actual_path.startswith(scanned_path + "/")
    ):
        raise SaveError(
            "scan-receipt-mismatch",
            "Saved skill path is outside the spyware-scanned subtree",
            json.dumps({"scanned": scanned_path, "saved": actual_path}, sort_keys=True),
        )
    if actual_path == scanned_path and record.get("checksum") != candidate.get("content_checksum"):
        raise SaveError(
            "scan-receipt-mismatch",
            "Saved skill checksum does not match the spyware scan receipt",
        )


def save_skill(args: argparse.Namespace) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="paseo-skill-save-scan-") as temporary:
        scan_receipt, scanned_source = _run_spyware_gate(args, Path(temporary))
        runtime = _bootstrap_manager(args)
        prefix = _manager_prefix(args, runtime)
        added = _run_json(
            _build_add_command(args, prefix, scanned_source), args.timeout
        )
        items = added.get("items")
        if (
            added.get("status") != "added-to-personal-library"
            or not isinstance(items, list)
            or not items
        ):
            raise SaveError(
                "unexpected-add-result",
                "The routing engine did not report a saved personal-library item",
            )
        sync_status = added.get("sync")
        if sync_status is None:
            sync_status = "manager-sync-api-unavailable"

    verified: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    discovered: list[dict[str, Any]] = []
    for item in items:
        catalog_id = str(item.get("catalog_id", ""))
        if not catalog_id:
            raise SaveError("missing-catalog-id", "saved item has no catalog ID")
        verification = _run_json(
            prefix + ["verify", catalog_id, "--json"], args.timeout
        )
        if verification.get("status") not in {"verified", "metadata-only"}:
            raise SaveError(
                "verification-failed",
                f"saved item did not verify: {catalog_id}",
                json.dumps(verification),
            )
        verified.append(
            {"catalog_id": catalog_id, "status": verification.get("status")}
        )

        inspection = _run_json(
            prefix + ["inspect", catalog_id, "--json"], args.timeout
        )
        record = {
            "catalog_id": catalog_id,
            "source": inspection.get("source"),
            "revision": inspection.get("revision"),
            "checksum": inspection.get("verification", {}).get("checksum"),
            "risk": inspection.get("risk"),
            "activation_policy": inspection.get("activation_policy"),
            "license": inspection.get("archive", {}).get("license"),
            "archive_status": inspection.get("archive", {}).get("status"),
            "archive_storage": inspection.get("archive", {}).get("storage", "payload"),
            "archive_blocker": inspection.get("archive", {}).get("blocker"),
            "quarantine": inspection.get("archive", {}).get("quarantine"),
            "trust_verdict": inspection.get("trust_verdict", {}).get("verdict"),
            "security_policy": inspection.get("security_policy"),
            "security_policy_sha256": inspection.get("verification", {}).get("security_policy_sha256"),
            "security_receipt": inspection.get("security_receipt"),
        }
        records.append(record)
        _bind_record_to_scan(scan_receipt, record)

        routing_record = item.get("routing", {}) if isinstance(item.get("routing"), dict) else {}
        actions = routing_record.get("actions", []) if isinstance(routing_record.get("actions"), list) else []
        action = str(actions[0]) if actions else "read"
        portable_name = catalog_id.removeprefix("overlay.")
        description = str(routing_record.get("description_ko") or "")
        query = " ".join(part for part in (action, portable_name, description) if part)
        search = _run_json(prefix + ["search", query, "--json"], args.timeout)
        search_rows = [row for row in search.get("results", []) if isinstance(row, dict)]
        result_row = next((row for row in search_rows if str(row.get("catalog_id")) == catalog_id), None)
        discovered.append(
            {
                "catalog_id": catalog_id,
                "found": result_row is not None,
                "query": query,
                "archive_status": (result_row or {}).get("archive_status"),
                "storage": (result_row or {}).get("archive_storage"),
                "activation_policy": (result_row or {}).get("activation_policy"),
                "available": bool((result_row or {}).get("acquirable")),
                "activation_blocked": (result_row or {}).get("activation_policy") == "blocked",
            }
        )
    archive_only = [
        record["catalog_id"]
        for record in records
        if record.get("archive_status") in {"blocked", "metadata-only"}
        or record.get("activation_policy") == "blocked"
    ]
    return {
        "status": "saved-and-verified",
        "source": args.source,
        "spyware_check": {
            "receipt": scan_receipt,
            "medium_approved": bool(args.approve_medium),
            "policy": scan_receipt.get("policy"),
            "approval_scope": (scan_receipt.get("policy") or {}).get("approval", {}).get("scope"),
        },
        "manager": runtime.details,
        "library_sync": {
            "status": sync_status,
            "detail": added.get("sync_detail"),
            "retry": added.get("sync_retry"),
            "onboarding_error": added.get("onboarding_error"),
            "local_only": bool(args.local_only),
        },
        "router": {
            "status": "not-installed",
            "mode": "explicit-only",
            "reason": "automatic routing was removed from Paseobility",
        },
        "items": items,
        "records": records,
        "verification": verified,
        "discovery": discovered,
        "search_discovery_ready": all(row["found"] for row in discovered),
        "automatic_discovery_ready": False,
        "natural_language_ready": False,
        "automatic_use_ready": False,
        "archive_only": archive_only,
        "partial_archive": bool(archive_only) and len(archive_only) < len(records),
        "activation": "not-installed; explicit skillNload setup is required for lookup or use",
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inspect and save a skill to a private local library"
    )
    parser.add_argument(
        "source", help="GitHub skill URL, repository URL, or local skill directory"
    )
    parser.add_argument(
        "--description-ko",
        help="one natural Korean sentence describing the skill outcome (preferred)",
    )
    parser.add_argument(
        "--tag-ko",
        action="append",
        default=[],
        help="repeatable Korean routing tag; preferred over inventing domain/action",
    )
    parser.add_argument(
        "--domain",
        action="append",
        default=[],
        help=(
            "optional controlled taxonomy domain ID from the verified active manager only; "
            "omit unless the exact ID is known"
        ),
    )
    parser.add_argument(
        "--action",
        action="append",
        default=[],
        help=(
            "optional controlled taxonomy action ID from the verified active manager only; "
            "omit unless the exact ID is known"
        ),
    )
    parser.add_argument("--name")
    parser.add_argument(
        "--risk",
        choices=(
            "instructions-only",
            "local-management",
            "scripts",
            "external-write",
            "destructive",
        ),
    )
    parser.add_argument("--overlay-dir")
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="save only to this computer and skip paseo_skill_save onboarding/sync",
    )
    parser.add_argument(
        "--approve-medium", "--approve-policy", dest="approve_medium",
        action="store_true",
        help="register after explicit approval of a review-required local policy",
    )
    parser.add_argument(
        "--router-target",
        dest="_deprecated_router_target",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--repo", help="advanced: use an explicit routing manager checkout instead of auto-selection"
    )
    parser.add_argument(
        "--manager-dir", help="advanced: alternate parent directory for the pinned runtime"
    )
    parser.add_argument("--home", help="alternate home used only for isolated tests")
    parser.add_argument(
        "--state-dir", help="alternate state directory used only for isolated tests"
    )
    parser.add_argument(
        "--python", default=sys.executable, help="Python interpreter used by the selected routing manager"
    )
    parser.add_argument("--timeout", type=int, default=180)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = save_skill(args)
    except SaveError as exc:
        _json_output(
            {
                "status": "error",
                "code": exc.code,
                "message": str(exc),
                "detail": exc.detail,
            }
        )
        return 2
    _json_output(result)
    # Archive success is a successful save even when activation is deliberately
    # unavailable.  The structured flags above tell callers whether a later
    # activation confirmation is possible; they are not registration failure.
    saved = result.get("status") == "saved-and-verified"
    sync_available = result.get("library_sync", {}).get("status") != "manager-sync-api-unavailable"
    return 0 if saved and sync_available else 1


if __name__ == "__main__":
    raise SystemExit(main())
