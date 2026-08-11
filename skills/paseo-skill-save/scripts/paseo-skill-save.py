#!/usr/bin/env python3
"""Save a user-selected skill through Paseobility's pinned routing engine."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
from typing import Any, Sequence


MANAGER_REPOSITORY = "https://github.com/wilgon456/skillNload.git"
MANAGER_REVISION = "c9f5b6e0a0273639abe8ddbf4dc8a5f1abfc73cd"
MANAGER_TREE = "ed9f00aab7539774402e62e22b19a33e565e023b"


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


def _run_json(command: Sequence[str], timeout: int) -> dict[str, Any]:
    process = _run_process(command, timeout)

    if process.returncode:
        stderr = process.stderr.strip()
        if "No module named skillhub" in stderr:
            raise SaveError(
                "manager-runtime-unavailable",
                "The pinned routing engine failed to load",
                stderr,
            )
        raise SaveError(
            "manager-command-failed",
            "The routing engine rejected the request",
            stderr or process.stdout.strip(),
        )
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


def _build_add_command(args: argparse.Namespace, prefix: list[str]) -> list[str]:
    command = prefix + ["add", args.source]
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
    command.append("--json")
    return command


def _primary_target(router_target: str) -> str:
    target = router_target.split(",", maxsplit=1)[0].strip()
    if not target:
        raise SaveError("missing-router-target", "router target cannot be empty")
    return target


def _match_record(
    prefix: list[str],
    target: str,
    query: str,
    catalog_id: str,
    timeout: int,
) -> dict[str, Any]:
    matched = _run_json(
        prefix
        + ["match", query, "--target", target, "--agent-packet", "--json"],
        timeout,
    )
    decision = matched.get("decision") if isinstance(matched.get("decision"), dict) else {}
    selected_ids = [str(value) for value in decision.get("selected_ids", [])]
    packet_candidates = matched.get("agent_packet", {}).get("candidates", [])
    adjudication_candidates = matched.get("agent_adjudication", {}).get(
        "candidate_contracts", []
    )
    candidates = (
        adjudication_candidates
        if isinstance(adjudication_candidates, list) and adjudication_candidates
        else packet_candidates
    )
    body_available = False
    for candidate in candidates if isinstance(candidates, list) else []:
        if not isinstance(candidate, dict) or str(candidate.get("id")) != catalog_id:
            continue
        contract = candidate.get("application_contract", {})
        evidence = candidate.get("skill_body_evidence", {})
        if not evidence and isinstance(contract, dict):
            evidence = contract.get("skill_body_evidence", {})
        body_available = bool(evidence.get("available")) if isinstance(evidence, dict) else False
        break
    return {
        "catalog_id": catalog_id,
        "query": query,
        "status": decision.get("status"),
        "selected": catalog_id in selected_ids,
        "selected_ids": selected_ids,
        "requires_user_confirmation": bool(decision.get("requires_user_confirmation")),
        "skill_body_evidence_available": body_available,
    }


def save_skill(args: argparse.Namespace) -> dict[str, Any]:
    runtime = _bootstrap_manager(args)
    prefix = _manager_prefix(args, runtime)
    router = _run_json(
        prefix + ["init", "--target", args.router_target, "--json"],
        args.timeout,
    )
    if router.get("status") != "initialized":
        raise SaveError(
            "router-init-failed",
            "The routing engine did not initialize the natural-language router",
        )

    added = _run_json(_build_add_command(args, prefix), args.timeout)
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

    verified: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    discovered: list[dict[str, Any]] = []
    matches: list[dict[str, Any]] = []
    match_target = _primary_target(args.router_target)
    for item in items:
        catalog_id = str(item.get("catalog_id", ""))
        if not catalog_id:
            raise SaveError("missing-catalog-id", "saved item has no catalog ID")
        verification = _run_json(
            prefix + ["verify", catalog_id, "--json"], args.timeout
        )
        if verification.get("status") != "verified":
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
            "trust_verdict": inspection.get("trust_verdict", {}).get("verdict"),
        }
        records.append(record)

        query = str(item.get("routing", {}).get("description_ko") or catalog_id)
        search = _run_json(
            prefix + ["search", query, "--available-only", "--json"],
            args.timeout,
        )
        result_ids = [
            str(row.get("catalog_id"))
            for row in search.get("results", [])
            if isinstance(row, dict)
        ]
        discovered.append(
            {"catalog_id": catalog_id, "found": catalog_id in result_ids, "query": query}
        )
        matches.append(
            _match_record(prefix, match_target, query, catalog_id, args.timeout)
        )

    automatic_use_ready = all(
        record["risk"] != "instructions-only"
        or (
            record["activation_policy"] == "on-demand"
            and match["status"] == "select"
            and not match["requires_user_confirmation"]
            and match["skill_body_evidence_available"]
        )
        for record, match in zip(records, matches)
    )
    natural_language_ready = all(
        match["selected"] and match["status"] in {"select", "confirm"}
        for match in matches
    )
    return {
        "status": "saved-and-verified",
        "source": args.source,
        "manager": runtime.details,
        "router": router,
        "items": items,
        "records": records,
        "verification": verified,
        "discovery": discovered,
        "matches": matches,
        "automatic_discovery_ready": all(row["found"] for row in discovered),
        "natural_language_ready": natural_language_ready,
        "automatic_use_ready": automatic_use_ready,
        "activation": "not-installed; available for router-selected ephemeral use",
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inspect and save a skill to a private local library"
    )
    parser.add_argument(
        "source", help="GitHub skill URL, repository URL, or local skill directory"
    )
    parser.add_argument("--description-ko")
    parser.add_argument("--tag-ko", action="append", default=[])
    parser.add_argument("--domain", action="append", default=[])
    parser.add_argument("--action", action="append", default=[])
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
        "--router-target",
        default="codex",
        help="comma-separated router targets (default: codex for .agents/skills)",
    )
    parser.add_argument(
        "--repo", help="advanced: use an explicit routing engine checkout instead of the pinned runtime"
    )
    parser.add_argument(
        "--manager-dir", help="advanced: alternate parent directory for the pinned runtime"
    )
    parser.add_argument("--home", help="alternate home used only for isolated tests")
    parser.add_argument(
        "--state-dir", help="alternate state directory used only for isolated tests"
    )
    parser.add_argument(
        "--python", default=sys.executable, help="Python interpreter used by the pinned routing engine"
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
    ready = (
        result["automatic_discovery_ready"]
        and result["natural_language_ready"]
        and result["automatic_use_ready"]
    )
    return 0 if ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
