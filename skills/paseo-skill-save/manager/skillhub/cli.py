#!/usr/bin/env python3
"""Portable, conservative command line manager for skillNload."""
from __future__ import annotations

import argparse
import copy
from contextlib import ExitStack
import datetime as dt
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    from . import acquire, matching, remote, routing, spyware, trust
    from .github_onboarding import clone_remote, onboard_github
    from .library import (
        KNOWN_TARGETS,
        PERMITTED_REDISTRIBUTION,
        RISK_ORDER,
        ROOT,
        TARGET_ALIASES,
        VERSION,
        atomic_write,
        catalog_root,
        contains_privacy_token,
        copy_tree_checked,
        directory_checksum,
        display_target,
        expose,
        is_checkout_root,
        is_reparse_point,
        json_dump,
        load_state,
        normalize_bytes,
        normalize_target,
        packaged_data_root,
        parse_frontmatter,
        path_within,
        read_json,
        remove_managed_destination,
        risk_allowed,
        run_git,
        safe_name,
        save_state,
        state_default_dir,
        target_roots,
    )
    from .schema import migrate_registry
    from .taxonomy import compile_routing_tree
except ImportError:  # pragma: no cover - direct script execution
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from skillhub import acquire, matching, remote, routing, spyware, trust  # type: ignore
    from skillhub.github_onboarding import clone_remote, onboard_github  # type: ignore
    from skillhub.library import (  # type: ignore
        KNOWN_TARGETS,
        PERMITTED_REDISTRIBUTION,
        RISK_ORDER,
        ROOT,
        TARGET_ALIASES,
        VERSION,
        atomic_write,
        catalog_root,
        contains_privacy_token,
        copy_tree_checked,
        directory_checksum,
        display_target,
        expose,
        is_checkout_root,
        is_reparse_point,
        json_dump,
        load_state,
        normalize_bytes,
        normalize_target,
        packaged_data_root,
        parse_frontmatter,
        path_within,
        read_json,
        remove_managed_destination,
        risk_allowed,
        run_git,
        safe_name,
        save_state,
        state_default_dir,
        target_roots,
    )
    from skillhub.schema import migrate_registry  # type: ignore
    from skillhub.taxonomy import compile_routing_tree  # type: ignore


DEFAULT_ONE_SHOT_TTL_MINUTES = 60
MAX_ONE_SHOT_TTL_MINUTES = 24 * 60
DEFAULT_CACHE_MAX_AGE_DAYS = 30


class UserError(RuntimeError):
    def __init__(self, message: str, *, code: str = "user-error", details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class ApprovalRequired(UserError):
    def __init__(self, message: str, summary: dict[str, Any]):
        super().__init__(message, code="approval-required", details={"summary": summary})


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def parse_iso(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value)


def load_registry(repo: Path, state_dir: Path | None = None) -> dict[str, Any]:
    path = repo / "registry.json"
    if not path.is_file():
        raise UserError(f"missing generated registry: {path}")
    data = read_json(path)
    if data.get("schema_version") not in (1, 2):
        raise UserError("unsupported registry schema")
    if data.get("schema_version") == 1:
        data = migrate_registry(data)
    if state_dir is not None:
        state = load_state(state_dir)
        known = {str(item.get("catalog_id")) for item in data.get("skills", [])}
        overlays = []
        for catalog_id, record in sorted(state.get("overlays", {}).items()):
            item = record.get("item") if isinstance(record, dict) else None
            if not isinstance(item, dict) or item.get("catalog_id") != catalog_id:
                continue
            if catalog_id in known:
                raise UserError(f"personal overlay collides with the bundled registry: {catalog_id}")
            overlay_item = dict(item)
            overlay_item["_local_payload_path"] = str(record.get("path", ""))
            overlays.append(overlay_item)
            known.add(catalog_id)
        data["skills"] = [*data.get("skills", []), *overlays]
        if overlays:
            data["routing_tree"] = compile_routing_tree(data["skills"], data.get("routing_taxonomy", {}))
    return data


def find_item(registry: dict[str, Any], query: str) -> dict[str, Any]:
    rows = registry.get("skills", [])
    exact = [row for row in rows if row.get("catalog_id") == query or row.get("name") == query]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        raise UserError(f"portable name is ambiguous; use catalog_id: {query}")
    partial = [row for row in rows if query.casefold() in str(row.get("catalog_id", "")).casefold()]
    if len(partial) == 1:
        return partial[0]
    if not partial:
        raise UserError(f"catalog item not found: {query}")
    raise UserError("catalog query is ambiguous: " + ", ".join(row["catalog_id"] for row in partial[:8]))


def item_path(repo: Path, item: dict[str, Any]) -> Path | None:
    value = item.get("archive", {}).get("path")
    if not value:
        return None
    raw_path = repo / value
    if is_reparse_point(raw_path):
        raise UserError(f"archive path is linked: {value}")
    path = raw_path.resolve()
    if not path_within(path, repo):
        raise UserError(f"archive path is outside the checkout or linked: {value}")
    return path


def integrity(repo: Path, item: dict[str, Any]) -> dict[str, Any]:
    path = item_path(repo, item)
    expected = item.get("verification", {}).get("checksum")
    if path is None:
        return {"status": "not-archived", "expected": expected, "actual": None}
    if not path.is_dir():
        return {"status": "missing", "expected": expected, "actual": None, "path": str(path)}
    actual = directory_checksum(path)
    return {"status": "verified" if expected == actual else "mismatch", "expected": expected, "actual": actual, "path": str(path)}


def emit(value: Any, as_json: bool = False) -> None:
    if as_json:
        print(json_dump(value), end="")
        return
    if isinstance(value, str):
        print(value)
    elif isinstance(value, list):
        for row in value:
            if isinstance(row, dict):
                print(f"{row.get('catalog_id', row.get('id', 'item'))}: {row.get('name', row.get('status', ''))}")
            else:
                print(row)
    elif isinstance(value, dict):
        for key, val in value.items():
            print(f"{key}: {val}")
    else:
        print(value)


def parse_target_list(value: str, allow_all: bool = True) -> list[str]:
    parts = [part.strip() for part in str(value).split(",") if part.strip()]
    if not parts:
        raise UserError("no target given")
    if allow_all and len(parts) == 1 and parts[0].casefold() == "all":
        return list(KNOWN_TARGETS)
    try:
        resolved = [normalize_target(part) for part in parts]
    except ValueError as exc:
        raise UserError(f"{exc}; known targets: " + ", ".join(sorted(TARGET_ALIASES))) from exc
    return list(dict.fromkeys(resolved))


def local_lifecycle(state: dict[str, Any], item: dict[str, Any], state_dir: Path) -> str:
    catalog_id = item["catalog_id"]
    status = item.get("archive", {}).get("status")
    if status in {"blocked", "deprecated"}:
        return "blocked"
    activation = state.get("activations", {}).get(catalog_id)
    if activation and activation.get("targets"):
        if all(record.get("one_shot") for record in activation["targets"].values()):
            return "one-shot"
        return "enabled"
    acquisition = state.get("acquisitions", {}).get(catalog_id)
    if acquisition:
        verification = acquire.verify_cached(item, state_dir, state)
        return str(verification.get("status"))
    if any(row.get("catalog_id") == catalog_id for row in acquire.quarantine_history(state_dir)):
        return "quarantined"
    if status == "metadata-only":
        return "indexed-metadata-only"
    return "indexed"


def cmd_search(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    signals = routing.task_routing_signals(registry, args.query)
    query_tokens = routing.task_tokens(args.query)
    results: list[dict[str, Any]] = []
    filtered: list[dict[str, Any]] = []
    for item in registry.get("skills", []):
        score, reasons = routing.score_item(item, args.query, query_tokens, signals)
        if not score:
            continue
        if args.client and args.client not in item.get("compatibility", []):
            filtered.append({"catalog_id": item["catalog_id"], "reason": f"client unsupported: {args.client}"})
            continue
        if args.os and args.os not in item.get("oses", []) and "any" not in item.get("oses", []):
            filtered.append({"catalog_id": item["catalog_id"], "reason": f"OS unsupported: {args.os}"})
            continue
        if args.available_only and item.get("acquisition", {}).get("status") != "available":
            filtered.append({"catalog_id": item["catalog_id"], "reason": "not acquirable"})
            continue
        row = {
            "catalog_id": item["catalog_id"],
            "name": item["name"],
            "description": item.get("description", ""),
            "availability": item.get("archive", {}).get("status"),
            "acquirable": item.get("acquisition", {}).get("status") == "available",
            "risk": item.get("risk"),
            "score": score,
            "routing": {
                "description_ko": item.get("routing", {}).get("description_ko"),
                "primary_path": item.get("routing", {}).get("primary_path"),
                "library_paths": item.get("routing", {}).get("library_paths", []),
            },
        }
        if args.explain:
            row["match_reasons"] = reasons
        results.append(row)
    results.sort(key=lambda row: (-row["score"], row["catalog_id"]))
    output: Any = {
        "query": args.query,
        "intent": signals,
        "recommendation": routing.recommendation_assessment(results),
        "results": results,
    }
    if args.explain:
        output["filtered"] = sorted(filtered, key=lambda row: row["catalog_id"])
    emit(output if args.json or args.explain else results, args.json or args.explain)
    return 0


def cmd_tree(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    source_tree = registry.get("routing_tree", {})
    groups = []
    for source_group in source_tree.get("groups", []):
        if args.group and source_group.get("id") != args.group:
            continue
        domains = []
        for source_domain in source_group.get("domains", []):
            if args.domain and source_domain.get("id") != args.domain:
                continue
            domain = dict(source_domain)
            if not args.skills:
                domain.pop("skills", None)
            domains.append(domain)
        if args.domain and not domains:
            continue
        group = dict(source_group)
        group["domains"] = domains
        group["skill_count"] = sum(domain.get("skill_count", 0) for domain in domains)
        groups.append(group)
    result = {
        "schema_version": 1,
        "skill_count": sum(group["skill_count"] for group in groups),
        "group_count": len(groups),
        "domain_count": sum(len(group["domains"]) for group in groups),
        "groups": groups,
    }
    if args.json:
        emit(result, True)
        return 0
    for group in groups:
        print(f"{group['label_ko']} [{group['id']}] ({group['skill_count']})")
        for domain in group["domains"]:
            print(f"  {domain['label_ko']} [{domain['id']}] ({domain['skill_count']})")
            for skill in domain.get("skills", []):
                print(f"    {skill['catalog_id']}")
    return 0


def cmd_route(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    state = load_state(state_dir)
    targets = parse_target_list(args.target, allow_all=False)
    if len(targets) != 1:
        raise UserError("route takes exactly one target")
    target = targets[0]
    client = args.client or routing.TARGET_COMPATIBILITY[target]
    if client not in routing.TARGET_COMPATIBILITY.values():
        raise UserError(f"unknown client: {client}; known clients: " + ", ".join(sorted(set(routing.TARGET_COMPATIBILITY.values()))))
    os_name = args.os or routing.default_os_name()
    if os_name not in routing.KNOWN_OSES:
        raise UserError(f"unknown OS: {os_name}; known OS values: " + ", ".join(routing.KNOWN_OSES))
    allow_risk = args.allow_risk or "instructions-only"
    if args.limit < 1:
        raise UserError("--limit must be at least 1")
    output = routing.route_task(
        registry,
        state,
        args.task,
        target,
        client=client,
        os_name=os_name,
        allow_risk=allow_risk,
        limit=args.limit,
    )
    if args.json:
        emit(output, True)
        return 0
    print(f"route status: {output['status']} (target={target}, client={client}, os={os_name}, allow-risk={allow_risk})")
    print(f"recommendation: {output['recommendation']['status']} confidence={output['recommendation']['confidence']}")
    for row in output["candidates"]:
        print(f"  candidate {row['score']:>4}  {row['catalog_id']}  risk={row['risk']}")
        for reason in row["match_reasons"]:
            print(f"      match: {reason}")
    for row in output["risk_gated"]:
        print(f"  risk-gated {row['score']:>4}  {row['catalog_id']}  risk={row['risk']}  needs {row['required_authorization']}")
    print(f"  filtered: {output['filtered_count']} incompatible row(s); first {len(output['filtered'])} listed with reasons in --json output")
    print("  approval required before any download; route never fetches or activates")
    for step in output["next_steps"]:
        print(f"  next: {step}")
    return 0


def cmd_match(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    """Select or safely decline skills for an unstructured user request."""
    registry = load_registry(repo, state_dir)
    state = load_state(state_dir)
    targets = parse_target_list(args.target, allow_all=False)
    if len(targets) != 1:
        raise UserError("match takes exactly one target")
    target = targets[0]
    client = args.client or routing.TARGET_COMPATIBILITY[target]
    os_name = args.os or routing.default_os_name()
    output = matching.match_request(
        args.request,
        client=client,
        operating_system=os_name,
        max_risk=args.max_risk,
        trust_tier=args.trust_tier,
        limit=args.limit,
        include_agent_packet=args.agent_packet,
        completed_actions=args.completed_action,
        satisfied_anchors=args.satisfied_anchor,
        catalog_records=registry["skills"],
        feedback_rules=(state.get("feedback", {}) or {}).values() if isinstance(state.get("feedback"), dict) else state.get("feedback", []),
    )
    output["target"] = target
    output["client"] = client
    output["os"] = os_name
    if args.json:
        emit(output, True)
    else:
        print(matching.format_match_result(output))
    return 0


def local_payload(repo: Path, mode: str, item: dict[str, Any], state: dict[str, Any], state_dir: Path) -> Path:
    """Resolve verified local payload content without fetching anything."""
    return resolve_content(repo, mode, item, state, state_dir)


def scan_summary_for(source: Path | None) -> dict[str, Any] | None:
    if source is None or not source.is_dir() or is_reparse_point(source):
        return None
    report = trust.policy_scan(source)
    return {
        "available": True,
        "counts": report["counts"],
        "blocked": report["blocked"],
        "disclaimer": report["disclaimer"],
    }


def cmd_inspect(args: argparse.Namespace, repo: Path, mode: str, state_dir: Path) -> int:
    item = find_item(load_registry(repo, state_dir), args.item)
    result = dict(item)
    result["integrity"] = integrity(repo, item)
    state = load_state(state_dir)
    result["local_state"] = local_lifecycle(state, item, state_dir)
    acquisition = state.get("acquisitions", {}).get(item["catalog_id"])
    if acquisition:
        result["local_acquisition"] = acquisition
    source: Path | None = None
    try:
        source = resolve_content(repo, mode, item, state, state_dir)
    except UserError:
        source = None
    if source is not None:
        result["skill_path"] = str(source)
    summary = scan_summary_for(source)
    if summary is not None:
        result["scan_summary"] = summary
    result["trust_verdict"] = trust.trust_verdict(
        item,
        integrity_status=result["integrity"].get("status"),
        scan_blocked=summary["blocked"] if summary else None,
        local_state=result["local_state"],
    )
    emit(result, args.json)
    return 0


def cmd_manifest(args: argparse.Namespace, repo: Path, mode: str, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    state = load_state(state_dir)
    source = local_payload(repo, mode, item, state, state_dir)
    manifest = trust.file_manifest(source)
    manifest["catalog_id"] = item["catalog_id"]
    expected = item.get("verification", {}).get("checksum")
    manifest["expected_directory_checksum"] = expected
    manifest["directory_checksum_match"] = (directory_checksum(source) == expected) if expected else None
    emit(manifest, args.json)
    return 0


def cmd_scan(args: argparse.Namespace, repo: Path, mode: str, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    state = load_state(state_dir)
    source = local_payload(repo, mode, item, state, state_dir)
    report = trust.policy_scan(source)
    report["catalog_id"] = item["catalog_id"]
    emit(report, args.json)
    return 1 if report["blocked"] else 0


def cmd_trust(args: argparse.Namespace, repo: Path, mode: str, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    state = load_state(state_dir)
    integrity_status: str | None = None
    if mode == "checkout" and item_path(repo, item) is not None:
        integrity_status = integrity(repo, item).get("status")
    acquisition = state.get("acquisitions", {}).get(item["catalog_id"])
    if acquisition:
        cached = acquire.verify_cached(item, state_dir, state)
        if integrity_status is None or integrity_status == "not-archived":
            integrity_status = "verified" if cached.get("status") == "verified" else cached.get("status")
    source: Path | None = None
    try:
        source = resolve_content(repo, mode, item, state, state_dir)
    except UserError:
        source = None
    summary = scan_summary_for(source)
    verdict = trust.trust_verdict(
        item,
        integrity_status=integrity_status,
        scan_blocked=summary["blocked"] if summary else None,
        local_state=local_lifecycle(state, item, state_dir),
    )
    verdict["catalog_id"] = item["catalog_id"]
    emit(verdict, args.json)
    return 0


def profile(args: argparse.Namespace, repo: Path) -> dict[str, Any]:
    path = repo / "profiles" / f"{args.profile}.json"
    if not path.is_file():
        raise UserError(f"profile not found: {args.profile}")
    data = read_json(path)
    if data.get("schema_version") != 1:
        raise UserError("unsupported profile schema")
    return data


def selected_targets(args: argparse.Namespace, profile_data: dict[str, Any] | None = None) -> list[str]:
    requested = args.target
    if requested == "all":
        values = (profile_data or {}).get("targets") or list(KNOWN_TARGETS)
    else:
        values = requested if isinstance(requested, str) else ",".join(requested)
    return parse_target_list(",".join(str(value) for value in values) if isinstance(values, (list, tuple)) else str(values))


def make_snapshot(repo: Path, state_dir: Path, item: dict[str, Any], source: Path) -> dict[str, Any]:
    findings = acquire.scan_payload(source)
    if findings:
        raise UserError(f"cannot snapshot unsafe content: {findings[0]}", code="unsafe-payload")
    stamp = utc_now().replace(":", "").replace("+00:00", "Z")
    snapshot_dir = state_dir / "snapshots" / safe_name(item["catalog_id"]) / stamp
    suffix = 1
    while snapshot_dir.exists():
        snapshot_dir = snapshot_dir.parent / f"{stamp}-{suffix}"
        suffix += 1
    snapshot_dir.parent.mkdir(parents=True, exist_ok=True)
    copy_tree_checked(source, snapshot_dir)
    record = {
        "path": str(snapshot_dir),
        "created": utc_now(),
        "checksum": directory_checksum(snapshot_dir),
        "identity": lock_identity(item),
    }
    return record


def cleanup_one_shot(state: dict[str, Any], home: Path) -> list[str]:
    """Remove expired one-shot exposures predictably. Returns removed ids."""
    removed: list[str] = []
    now = dt.datetime.now(dt.timezone.utc)
    roots = target_roots(home)
    for catalog_id in sorted(state.get("activations", {})):
        activation = state["activations"][catalog_id]
        targets = activation.get("targets", {})
        for target in sorted(targets):
            record = targets[target]
            if not record.get("one_shot"):
                continue
            expires = record.get("expires")
            try:
                expired = expires is not None and parse_iso(expires) <= now
            except ValueError:
                expired = True
            if not expired:
                continue
            destination = Path(record.get("destination", ""))
            root = roots.get(target)
            if root is None or not path_within_lexical(destination, root):
                # A corrupted state file must never turn expiry cleanup into a
                # delete primitive for an arbitrary user path.
                continue
            try:
                remove_managed_destination(destination, record)
            except RuntimeError:
                continue
            targets.pop(target, None)
            removed.append(f"{catalog_id}@{target}")
        if not targets:
            state["activations"].pop(catalog_id, None)
    return removed


def gate_item_for_acquisition(item: dict[str, Any]) -> None:
    archive = item.get("archive", {})
    status = archive.get("status")
    if status != "archived":
        blocker = archive.get("blocker")
        raise UserError(
            f"{item['catalog_id']} is {status} and cannot be fetched or installed"
            + (f": {blocker}" if blocker else "")
        )
    if item.get("activation_policy") == "blocked":
        raise UserError(f"{item['catalog_id']} is blocked: {archive.get('blocker')}")
    if item.get("source_id") != "personal-overlay":
        ok, reason = acquire.license_gate(item)
        if not ok:
            raise UserError(f"{item['catalog_id']}: {reason}")
    else:
        return
    acquire.acquisition_plan(item)


def gate_risk(item: dict[str, Any], allow_risk: str | None, confirm_destructive: bool = False) -> None:
    risk = item.get("risk", "destructive")
    if risk == "destructive":
        if not confirm_destructive:
            raise UserError(
                f"risk gate: {item['catalog_id']} is destructive; --allow-risk destructive and "
                "--confirm-destructive are both required"
            )
        if not allow_risk or RISK_ORDER.get(allow_risk, -1) < RISK_ORDER["destructive"]:
            raise UserError(f"risk gate: {item['catalog_id']} is destructive; explicit --allow-risk destructive is required")
        return
    if risk in {"scripts", "external-write"}:
        if not allow_risk or not risk_allowed(risk, allow_risk):
            raise UserError(f"risk gate: {item['catalog_id']} is {risk}; explicit --allow-risk {risk} is required")
        return
    if allow_risk and not risk_allowed(risk, allow_risk):
        raise UserError(f"risk gate: allowance {allow_risk} is below item risk {risk}")


def confirm_action(args: argparse.Namespace, summary: dict[str, Any]) -> None:
    """Require a machine-readable approval or a reliable interactive prompt."""
    machine_output = bool(getattr(args, "json", False))
    if not machine_output:
        print("approval required for:", file=sys.stderr)
        print(json_dump(summary), file=sys.stderr, end="")
    if getattr(args, "approved", False):
        return
    if sys.stdin.isatty() and sys.stderr.isatty():
        if machine_output:
            print("approval required for:", file=sys.stderr)
            print(json_dump(summary), file=sys.stderr, end="")
        answer = input("Proceed with this fetch/install/use operation? [y/N] ")
        if answer.strip().casefold() in {"y", "yes"}:
            return
        raise UserError("operation cancelled", code="approval-cancelled")
    raise ApprovalRequired(
        "non-interactive activation requires --yes/--approve after human approval",
        summary,
    )


def run_spyware_receipt_gate(
    args: argparse.Namespace, workspace: Path
) -> tuple[dict[str, Any], str, Path]:
    """Acquire and validate the canonical registration receipt before mutation."""
    try:
        raw_receipt, add_source, selected = spyware.scan_target_with_path(
            args.source, workspace
        )
        receipt = spyware.validate_receipt(raw_receipt)
    except spyware.ScanError as exc:
        raise UserError(
            str(exc), code=getattr(exc, "code", "spyware-check-failed"),
            details={"detail": getattr(exc, "detail", "")},
        ) from exc
    detail = json_dump(receipt)
    counts = receipt["counts"]
    if counts["critical"] or counts["high"]:
        if not getattr(args, "json", False):
            print(detail, file=sys.stderr, end="")
        raise UserError(
            "registration blocked by Critical or High spyware findings",
            code="spyware-check-blocked",
            details={"receipt": receipt},
        )
    if counts["medium"] and not getattr(args, "approve_medium", False):
        if not getattr(args, "json", False):
            print(detail, file=sys.stderr, end="")
        raise UserError(
            "Medium findings require explicit --approve-medium after reviewing the receipt",
            code="spyware-check-approval-required",
            details={"receipt": receipt},
        )
    if not isinstance(add_source, str) or not add_source:
        raise UserError(
            "spyware scanner returned no immutable source", code="spyware-check-invalid",
            details={"receipt": receipt},
        )
    return receipt, add_source, selected


def bind_item_to_spyware_receipt(
    receipt: dict[str, Any], item: dict[str, Any]
) -> None:
    """Bind an overlay record's source identity to the accepted receipt."""
    scanned = receipt.get("source")
    if not isinstance(scanned, dict):
        raise UserError("spyware receipt has no source", code="spyware-check-invalid")
    verification = item.setdefault("verification", {})
    verification["spyware_receipt_sha256"] = receipt["receipt_sha256"]
    verification["spyware_content_checksum"] = receipt["content_checksum"]
    verification["spyware_verdict"] = receipt["verdict"]
    if scanned.get("kind") == "local":
        if scanned.get("skill_manifest") and item.get("verification", {}).get("checksum") != receipt.get("content_checksum"):
            raise UserError(
                "saved local skill checksum does not match the spyware scan receipt",
                code="scan-receipt-mismatch",
            )
        return
    if scanned.get("kind") != "github":
        raise UserError("spyware receipt has an unknown source kind", code="spyware-check-invalid")
    actual = item.get("source")
    if not isinstance(actual, dict) or actual.get("commit") != scanned.get("commit"):
        raise UserError(
            "saved skill commit does not match the spyware scan receipt",
            code="scan-receipt-mismatch",
            details={"scanned": scanned, "saved": actual},
        )
    scanned_path = str(scanned.get("path") or "").strip("/")
    actual_path = str(actual.get("path") or "").strip("/")
    if scanned_path and not (actual_path == scanned_path or actual_path.startswith(scanned_path + "/")):
        raise UserError(
            "saved skill path is outside the spyware-scanned subtree",
            code="scan-receipt-mismatch",
            details={"scanned_path": scanned_path, "saved_path": actual_path},
        )
    if actual_path == scanned_path and item.get("verification", {}).get("checksum") != receipt.get("content_checksum"):
        raise UserError(
            "saved skill checksum does not match the spyware scan receipt",
            code="scan-receipt-mismatch",
        )


def _overlay_file_digests(root: Path) -> dict[str, str]:
    if not root.is_dir() or is_reparse_point(root):
        raise UserError("overlay payload must be a real directory", code="overlay-integrity")
    result: dict[str, str] = {}
    root_resolved = root.resolve()
    for path in sorted(root.rglob("*"), key=lambda value: value.as_posix()):
        relative = path.relative_to(root)
        if any(part in acquire.SKIP_PARTS if hasattr(acquire, "SKIP_PARTS") else part in {".git", "__pycache__", "node_modules"} for part in relative.parts):
            continue
        if path.is_symlink() or is_reparse_point(path):
            raise UserError(f"overlay contains a link: {relative}", code="overlay-integrity")
        if not path.is_file():
            continue
        try:
            path.resolve().relative_to(root_resolved)
        except ValueError as exc:
            raise UserError(f"overlay path escapes its root: {relative}", code="overlay-integrity") from exc
        payload = normalize_bytes(path.read_bytes(), path.suffix)
        result[relative.as_posix()] = hashlib.sha256(payload).hexdigest()
    return result


def _overlay_diff(
    old_root: Path,
    new_root: Path,
    old_item: dict[str, Any],
    new_item: dict[str, Any],
) -> dict[str, Any]:
    old_files = _overlay_file_digests(old_root)
    new_files = _overlay_file_digests(new_root)
    added = sorted(set(new_files) - set(old_files))
    deleted = sorted(set(old_files) - set(new_files))
    modified = sorted(path for path in set(old_files) & set(new_files) if old_files[path] != new_files[path])
    old_license = (old_item.get("archive") or {}).get("license", {})
    new_license = (new_item.get("archive") or {}).get("license", {})
    old_source = old_item.get("source") if isinstance(old_item.get("source"), dict) else {}
    new_source = new_item.get("source") if isinstance(new_item.get("source"), dict) else {}
    old_routing = old_item.get("routing") if isinstance(old_item.get("routing"), dict) else {}
    new_routing = new_item.get("routing") if isinstance(new_item.get("routing"), dict) else {}
    changes: dict[str, Any] = {
        "files": {"added": added, "modified": modified, "deleted": deleted},
        "source": {
            "old_commit": old_source.get("commit") or None,
            "new_commit": new_source.get("commit") or None,
            "old_path": old_source.get("path") or None,
            "new_path": new_source.get("path") or None,
            "old_checksum": (old_item.get("verification") or {}).get("checksum"),
            "new_checksum": (new_item.get("verification") or {}).get("checksum"),
        },
        "risk": {"old": old_item.get("risk"), "new": new_item.get("risk")},
        "routing": {"old": old_routing, "new": new_routing, "changed": old_routing != new_routing},
        "license": {"old": old_license, "new": new_license, "changed": old_license != new_license},
    }
    changes["risk"]["changed"] = changes["risk"]["old"] != changes["risk"]["new"]
    changes["source"]["changed"] = any(
        changes["source"]["old_" + key] != changes["source"]["new_" + key]
        for key in ("commit", "path", "checksum")
    )
    changes["file_count"] = len(added) + len(modified) + len(deleted)
    return changes


def _state_fingerprint(state_dir: Path) -> tuple[bool, str | None, str | None]:
    path = state_dir / "state.json"
    if not path.is_file():
        return False, None, None
    payload = path.read_bytes()
    return True, hashlib.sha256(payload).hexdigest(), payload.decode("utf-8")


def _state_token(fingerprint: tuple[bool, str | None, str | None]) -> str:
    """Return the stable token users can carry from preview to approval."""
    return fingerprint[1] or "absent"


def _overlay_record_destination(record: dict[str, Any], state_dir: Path) -> tuple[Path, Path]:
    raw = str(record.get("path") or "")
    if not raw:
        raise UserError("overlay record has no payload path", code="overlay-ownership")
    destination = Path(raw).expanduser().resolve()
    root = Path(str(record.get("root") or destination.parent)).expanduser().resolve()
    if not path_within_lexical(destination, root) or destination.parent != root and not path_within_lexical(destination, root):
        raise UserError("overlay payload is outside its recorded owner root", code="overlay-ownership")
    if destination.name != safe_name(str(record.get("name") or destination.name)):
        raise UserError("overlay payload name does not match its ownership record", code="overlay-ownership")
    if destination.is_symlink() or is_reparse_point(destination):
        raise UserError("overlay payload is linked or reparse-backed", code="overlay-ownership")
    if not destination.is_dir():
        raise UserError("overlay payload is missing", code="overlay-ownership")
    expected = record.get("checksum")
    if expected and directory_checksum(destination) != expected:
        raise UserError("overlay payload changed outside the manager", code="overlay-ownership")
    return destination, root


def recover_overlay_transactions(state_dir: Path) -> None:
    """Recover interrupted overlay promotions conservatively on next startup."""
    journal_root = state_dir / "overlay-transactions"
    if not journal_root.is_dir() or is_reparse_point(journal_root):
        return
    try:
        state = load_state(state_dir)
    except Exception:
        return
    for journal in sorted(journal_root.glob("*.json")):
        try:
            record = read_json(journal)
            catalog_id = str(record.get("catalog_id"))
            overlay = state.get("overlays", {}).get(catalog_id)
            if not isinstance(overlay, dict):
                continue
            destination = Path(str(record.get("destination"))).expanduser().resolve()
            if Path(str(overlay.get("path"))).expanduser().resolve() != destination:
                continue
            backup = Path(str(record.get("backup"))).expanduser().resolve()
            stage = Path(str(record.get("stage"))).expanduser().resolve()
            sibling_prefix = f".{destination.name}."
            allowed_sibling = lambda path: path.parent == destination.parent and path.name.startswith(sibling_prefix)
            if not (
                (path_within(backup, state_dir) or allowed_sibling(backup))
                and (path_within(stage, state_dir) or allowed_sibling(stage))
            ):
                continue
            new_checksum = str(record.get("new_checksum") or "")
            current_checksum = str(overlay.get("checksum") or "")
            if current_checksum == new_checksum and destination.is_dir() and directory_checksum(destination) == new_checksum:
                if backup.is_dir() and not is_reparse_point(backup):
                    shutil.rmtree(backup)
                if stage.is_dir() and not is_reparse_point(stage):
                    shutil.rmtree(stage)
                journal.unlink(missing_ok=True)
                continue
            if backup.is_dir() and not is_reparse_point(backup):
                if destination.is_dir() and not is_reparse_point(destination):
                    if new_checksum and directory_checksum(destination) == new_checksum:
                        shutil.rmtree(destination)
                    else:
                        continue
                if not destination.exists() and not destination.is_symlink():
                    os.replace(backup, destination)
                if stage.is_dir() and not is_reparse_point(stage):
                    shutil.rmtree(stage)
                journal.unlink(missing_ok=True)
            elif stage.is_dir() and not is_reparse_point(stage) and destination.is_dir():
                shutil.rmtree(stage)
                journal.unlink(missing_ok=True)
        except (OSError, ValueError, TypeError):
            continue


def _write_overlay_transaction(
    state_dir: Path,
    *,
    catalog_id: str,
    destination: Path,
    backup: Path,
    stage: Path,
    old_checksum: str,
    new_checksum: str,
) -> Path:
    journal_root = state_dir / "overlay-transactions"
    journal_root.mkdir(parents=True, exist_ok=True)
    journal = journal_root / f"{safe_name(catalog_id)}-{uuid.uuid4().hex}.json"
    atomic_write(
        journal,
        json_dump({
            "schema_version": 1,
            "catalog_id": catalog_id,
            "destination": str(destination),
            "backup": str(backup),
            "stage": str(stage),
            "old_checksum": old_checksum,
            "new_checksum": new_checksum,
        }),
    )
    return journal


def _promote_overlay_transaction(
    state_dir: Path,
    state: dict[str, Any],
    new_state: dict[str, Any],
    *,
    catalog_id: str,
    destination: Path,
    stage: Path,
    old_checksum: str,
    new_checksum: str,
    expected_state: tuple[bool, str | None, str | None],
) -> None:
    if _state_fingerprint(state_dir)[:2] != expected_state[:2]:
        raise UserError("state changed while the overlay update was prepared; rerun preview", code="concurrent-state")
    backup = destination.parent / f".{destination.name}.backup-{uuid.uuid4().hex}"
    journal = _write_overlay_transaction(
        state_dir,
        catalog_id=catalog_id,
        destination=destination,
        backup=backup,
        stage=stage,
        old_checksum=old_checksum,
        new_checksum=new_checksum,
    )
    old_state_text = expected_state[2]
    try:
        os.replace(destination, backup)
        os.replace(stage, destination)
        if directory_checksum(destination) != new_checksum or acquire.scan_payload(destination):
            raise UserError("staged overlay failed final integrity validation", code="overlay-integrity")
        save_state(state_dir, new_state)
    except Exception:
        try:
            if destination.is_dir() and not is_reparse_point(destination):
                acquire.clear_readonly(destination)
                shutil.rmtree(destination)
            if backup.is_dir() and not is_reparse_point(backup):
                os.replace(backup, destination)
            if old_state_text is not None and (state_dir / "state.json").is_file():
                try:
                    current = load_state(state_dir).get("overlays", {}).get(catalog_id, {})
                    if isinstance(current, dict) and current.get("checksum") == new_checksum:
                        atomic_write(state_dir / "state.json", old_state_text)
                except Exception:
                    pass
        finally:
            if stage.is_dir() and not is_reparse_point(stage):
                shutil.rmtree(stage, ignore_errors=True)
            journal.unlink(missing_ok=True)
        raise
    else:
        if backup.is_dir() and not is_reparse_point(backup):
            shutil.rmtree(backup)
        journal.unlink(missing_ok=True)


def _overlay_source_context(
    args: argparse.Namespace,
    registry: dict[str, Any],
    state: dict[str, Any],
    state_dir: Path,
    stack: ExitStack,
) -> tuple[str, dict[str, Any], dict[str, Any], Path, Path, tuple[bool, str | None, str | None]]:
    scan_workspace = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="skillhub-overlay-scan-")))
    receipt, pinned_source, scanned_root = run_spyware_receipt_gate(args, scan_workspace)
    if receipt["source"]["kind"] == "local":
        root = scanned_root
        provenance = {"repository": "local-user-source", "commit": "", "path": ""}
    else:
        remote = _github_source(pinned_source, stack)
        if remote is None:
            raise UserError("spyware scanner returned an invalid pinned GitHub source", code="spyware-check-invalid")
        root, provenance = remote
    if not (root / "SKILL.md").is_file():
        raise UserError("overlay update requires a source directory containing exactly one SKILL.md", code="overlay-source")
    frontmatter = parse_frontmatter((root / "SKILL.md").read_text(encoding="utf-8"))
    source_name = str(getattr(args, "name", None) or frontmatter.get("name") or "")
    catalog_id = str(getattr(args, "item", None) or (f"overlay.{source_name}" if source_name else ""))
    if not catalog_id.startswith("overlay."):
        raise UserError("overlay update target must be a personal overlay catalog id", code="overlay-target")
    old_record = state.get("overlays", {}).get(catalog_id)
    if not isinstance(old_record, dict) or not isinstance(old_record.get("item"), dict):
        raise UserError(f"personal overlay not found: {catalog_id}", code="overlay-not-found")
    old_item = old_record["item"]
    old_name = str(old_item.get("name") or catalog_id.removeprefix("overlay."))
    if source_name and source_name != old_name:
        raise UserError("overlay updates cannot rename the catalog id; use --name with the existing name", code="overlay-rename")
    item_args = argparse.Namespace(**vars(args))
    item_args.name = old_name
    new_name, new_item = _personal_item(
        registry,
        root,
        _personal_provenance(provenance, root, root),
        item_args,
        single=True,
        receipt=receipt,
    )
    if new_name != old_name or new_item.get("catalog_id") != catalog_id:
        raise UserError("overlay update source name does not match the existing overlay", code="overlay-rename")
    destination, _ = _overlay_record_destination(old_record, state_dir)
    if directory_checksum(destination) != old_record.get("checksum"):
        raise UserError("overlay payload changed outside the manager", code="overlay-ownership")
    expected_state = _state_fingerprint(state_dir)
    return catalog_id, old_record, new_item, destination, root, expected_state


def cmd_overlay_update(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    recover_overlay_transactions(state_dir)
    state = load_state(state_dir)
    registry = load_registry(repo, state_dir)
    with ExitStack() as stack:
        catalog_id, old_record, new_item, destination, new_source, expected_state = _overlay_source_context(
            args, registry, state, state_dir, stack
        )
        expected_token = _state_token(expected_state)
        supplied_token = getattr(args, "expected_state", None)
        if supplied_token and supplied_token != expected_token:
            raise UserError(
                "state changed since the preview; rerun preview before approval",
                code="concurrent-state",
                details={"expected_state": supplied_token, "current_state": expected_token},
            )
        old_item = old_record["item"]
        old_source = destination
        changes = _overlay_diff(old_source, new_source, old_item, new_item)
        preview = {
            "status": "preview",
            "catalog_id": catalog_id,
            "requires_approval": True,
            "state_fingerprint": expected_token,
            "source": changes["source"],
            "changes": changes,
            "old": {"risk": old_item.get("risk"), "routing": old_item.get("routing"), "license": (old_item.get("archive") or {}).get("license")},
            "new": {"risk": new_item.get("risk"), "routing": new_item.get("routing"), "license": (new_item.get("archive") or {}).get("license")},
        }
        if args.dry_run:
            emit(preview, args.json)
            return 0
        if not args.yes:
            if not args.json:
                print(json_dump(preview), file=sys.stderr, end="")
            raise UserError(
                "overlay update requires explicit --yes after reviewing the preview",
                code="overlay-approval-required",
                details={"preview": preview},
            )
        stage = destination.parent / f".{destination.name}.incoming-{uuid.uuid4().hex}"
        try:
            checksum = copy_tree_checked(new_source, stage)
            if checksum != new_item["verification"]["checksum"] or acquire.scan_payload(stage):
                raise UserError("staged overlay failed validation", code="overlay-integrity")
            snapshot = make_snapshot(repo, state_dir, old_item, old_source)
            snapshot.update({"kind": "overlay-update", "catalog_id": catalog_id, "item": copy.deepcopy(old_item), "overlay_record": copy.deepcopy(old_record)})
            new_state = copy.deepcopy(state)
            new_state.setdefault("snapshots", {}).setdefault(catalog_id, []).append(snapshot)
            new_record = copy.deepcopy(old_record)
            new_record.update({"catalog_id": catalog_id, "name": new_item["name"], "path": str(destination), "root": old_record.get("root", str(destination.parent)), "checksum": checksum, "updated": utc_now(), "item": new_item, "last_update": preview})
            new_state.setdefault("overlays", {})[catalog_id] = new_record
            _promote_overlay_transaction(
                state_dir,
                state,
                new_state,
                catalog_id=catalog_id,
                destination=destination,
                stage=stage,
                old_checksum=str(old_record.get("checksum") or ""),
                new_checksum=checksum,
                expected_state=expected_state,
            )
        except Exception:
            if stage.is_dir() and not is_reparse_point(stage):
                shutil.rmtree(stage, ignore_errors=True)
            raise
    emit({"status": "overlay-updated", "catalog_id": catalog_id, "preview": preview, "checksum": new_item["verification"]["checksum"]}, args.json)
    return 0


def cmd_overlay_rollback(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    recover_overlay_transactions(state_dir)
    state = load_state(state_dir)
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    catalog_id = item["catalog_id"]
    current = state.get("overlays", {}).get(catalog_id)
    if not isinstance(current, dict) or current.get("item", {}).get("source_id") != "personal-overlay":
        raise UserError("item is not a personal overlay", code="overlay-target")
    snapshots = [row for row in state.get("snapshots", {}).get(catalog_id, []) if isinstance(row, dict) and row.get("kind") == "overlay-update" and isinstance(row.get("overlay_record"), dict)]
    if not snapshots:
        raise UserError("no overlay update snapshot exists", code="overlay-no-snapshot")
    snapshot = snapshots[-1]
    source = Path(str(snapshot.get("path") or "")).expanduser().resolve()
    if not source.is_dir() or not path_within(source, (state_dir / "snapshots").resolve()) or is_reparse_point(source):
        raise UserError("overlay snapshot is missing or outside manager-owned state", code="snapshot-ownership")
    if directory_checksum(source) != snapshot.get("checksum") or acquire.scan_payload(source):
        raise UserError("overlay snapshot integrity check failed", code="snapshot-mismatch")
    destination, _ = _overlay_record_destination(current, state_dir)
    expected_state = _state_fingerprint(state_dir)
    expected_token = _state_token(expected_state)
    supplied_token = getattr(args, "expected_state", None)
    if supplied_token and supplied_token != expected_token:
        raise UserError(
            "state changed since the preview; rerun preview before approval",
            code="concurrent-state",
            details={"expected_state": supplied_token, "current_state": expected_token},
        )
    preview = {"status": "preview", "catalog_id": catalog_id, "from_checksum": current.get("checksum"), "to_checksum": snapshot.get("checksum"), "state_fingerprint": expected_token, "snapshot": snapshot}
    if args.dry_run:
        emit(preview, args.json)
        return 0
    if not args.yes:
        if not args.json:
            print(json_dump(preview), file=sys.stderr, end="")
        raise UserError("overlay rollback requires explicit --yes", code="overlay-approval-required", details={"preview": preview})
    stage = destination.parent / f".{destination.name}.rollback-{uuid.uuid4().hex}"
    try:
        checksum = copy_tree_checked(source, stage)
        if checksum != snapshot.get("checksum") or acquire.scan_payload(stage):
            raise UserError("staged rollback failed validation", code="overlay-integrity")
        new_state = copy.deepcopy(state)
        restored = copy.deepcopy(snapshot["overlay_record"])
        restored["path"] = str(destination)
        restored["root"] = current.get("root", str(destination.parent))
        restored["checksum"] = checksum
        restored["rolled_back"] = utc_now()
        new_state.setdefault("overlays", {})[catalog_id] = restored
        _promote_overlay_transaction(
            state_dir,
            state,
            new_state,
            catalog_id=catalog_id,
            destination=destination,
            stage=stage,
            old_checksum=str(current.get("checksum") or ""),
            new_checksum=checksum,
            expected_state=expected_state,
        )
    except Exception:
        if stage.is_dir() and not is_reparse_point(stage):
            shutil.rmtree(stage, ignore_errors=True)
        raise
    emit({"status": "overlay-rolled-back", "catalog_id": catalog_id, "checksum": checksum, "snapshot": snapshot}, args.json)
    return 0


def path_within_lexical(path: Path, parent: Path) -> bool:
    """Containment check that does not follow a final symlink."""
    try:
        child = os.path.normcase(os.path.abspath(os.fspath(path)))
        base = os.path.normcase(os.path.abspath(os.fspath(parent)))
        return os.path.commonpath([child, base]) == base
    except (OSError, ValueError):
        return False


def expected_destination(home: Path, item: dict[str, Any], target: str) -> Path:
    return target_roots(home)[target] / safe_name(item.get("runtime_name", item["name"]))


def remove_owned_destination(home: Path, item: dict[str, Any], target: str, record: dict[str, Any]) -> None:
    destination = Path(record.get("destination", ""))
    expected = expected_destination(home, item, target)
    if os.path.normcase(os.path.abspath(os.fspath(destination))) != os.path.normcase(os.path.abspath(os.fspath(expected))):
        raise UserError(
            f"manager ownership check failed for {item['catalog_id']} at target {target}",
            code="ownership-mismatch",
        )
    remove_managed_destination(destination, record)


def resolve_content(repo: Path, mode: str, item: dict[str, Any], state: dict[str, Any], state_dir: Path, prefer_cache: bool = False) -> Path:
    """Resolve the verified content directory for enable-style commands."""
    catalog_id = item["catalog_id"]
    overlay = state.get("overlays", {}).get(catalog_id)
    if isinstance(overlay, dict):
        raw_overlay = Path(str(overlay.get("path", "")))
        if (
            raw_overlay.is_dir()
            and not is_reparse_point(raw_overlay)
            and directory_checksum(raw_overlay) == overlay.get("checksum") == item.get("verification", {}).get("checksum")
        ):
            return raw_overlay.resolve()
        raise UserError(f"{catalog_id}: personal overlay is missing or failed integrity verification")
    acquisition = state.get("acquisitions", {}).get(catalog_id)
    if acquisition:
        cache_dir = acquire.cache_path(state_dir, str(acquisition.get("cache_key", "")))
        if acquire.verify_cached(item, state_dir, state).get("status") == "verified":
            if prefer_cache:
                return cache_dir
    archive = item_path(repo, item) if mode == "checkout" else None
    if archive is not None and archive.is_dir():
        check = integrity(repo, item)
        if check.get("status") == "verified":
            return archive
    if acquisition:
        cache_dir = acquire.cache_path(state_dir, str(acquisition.get("cache_key", "")))
        if acquire.verify_cached(item, state_dir, state).get("status") == "verified":
            return cache_dir
    plan = item.get("acquisition", {})
    if plan.get("status") == "available" and plan.get("method") == "packaged":
        for base in (packaged_data_root(), repo):
            raw_candidate = base / str(plan.get("path", ""))
            if is_reparse_point(raw_candidate):
                continue
            candidate = raw_candidate.resolve()
            if candidate.is_dir() and not is_reparse_point(candidate) and path_within(candidate, base) and directory_checksum(candidate) == item.get("verification", {}).get("checksum"):
                return candidate
    raise UserError(f"{catalog_id}: no verified local content; run 'skillhub fetch {catalog_id}' first")


def enable_targets(
    repo: Path,
    home: Path,
    state_dir: Path,
    state: dict[str, Any],
    item: dict[str, Any],
    source: Path,
    targets: list[str],
    *,
    one_shot: bool = False,
    ttl_minutes: int = DEFAULT_ONE_SHOT_TTL_MINUTES,
) -> dict[str, Any]:
    roots = target_roots(home)
    existing = state.get("activations", {}).get(item["catalog_id"], {})
    old_targets = dict(existing.get("targets", {})) if isinstance(existing, dict) else {}
    old_source = Path(existing.get("source", "")) if isinstance(existing, dict) and existing.get("source") else None
    if old_source is not None and (not old_source.is_dir() or is_reparse_point(old_source)):
        raise UserError("previous managed content is missing; refusing an unsafe replacement", code="previous-content-missing")
    source_checksum = directory_checksum(source)
    for target, previous in old_targets.items():
        if target in targets or not isinstance(previous, dict):
            continue
        previous_checksum = previous.get("content_checksum")
        if previous_checksum is None and old_source is not None:
            previous_checksum = directory_checksum(old_source)
        if previous_checksum != source_checksum:
            raise UserError(
                "activation has different target revisions; select all targets or uninstall before replacing",
                code="mixed-activation",
            )
    destinations: dict[str, Path] = {}
    for target in targets:
        destination = expected_destination(home, item, target)
        previous = old_targets.get(target)
        if destination.exists() or destination.is_symlink():
            if previous is None:
                raise UserError(f"destination is occupied and unmanaged: {destination}", code="unmanaged-destination")
            previous_destination = Path(previous.get("destination", ""))
            if os.path.normcase(os.path.abspath(os.fspath(previous_destination))) != os.path.normcase(os.path.abspath(os.fspath(destination))):
                raise UserError(f"recorded destination does not match target root: {destination}", code="ownership-mismatch")
        destinations[target] = destination

    snapshot: dict[str, Any] | None = None
    if old_source is not None:
        snapshot = make_snapshot(repo, state_dir, item, old_source)
    activation = {
        "catalog_id": item["catalog_id"],
        "source": str(source),
        "risk": item.get("risk"),
        "targets": dict(old_targets),
    }
    created: list[tuple[str, dict[str, Any]]] = []
    now = dt.datetime.now(dt.timezone.utc)
    try:
        for target in targets:
            previous = old_targets.get(target)
            if previous and (destinations[target].exists() or destinations[target].is_symlink()):
                remove_owned_destination(home, item, target, previous)
            method = expose(source, destinations[target])
            record: dict[str, Any] = {
                "target": target,
                "destination": str(destinations[target]),
                "destination_root": str(roots[target]),
                "method": method,
                "owned": True,
                "source": str(source),
                "content_checksum": source_checksum,
                "activated": utc_now(),
            }
            if one_shot:
                record["one_shot"] = True
                record["expires"] = (now + dt.timedelta(minutes=ttl_minutes)).replace(microsecond=0).isoformat()
            activation["targets"][target] = record
            created.append((target, record))
    except Exception:
        for target, record in reversed(created):
            try:
                remove_owned_destination(home, item, target, record)
            except (RuntimeError, UserError):
                pass
        if old_source is not None:
            for target in targets:
                previous = old_targets.get(target)
                if previous and not (destinations[target].exists() or destinations[target].is_symlink()):
                    try:
                        restored_method = expose(old_source, destinations[target])
                        previous["method"] = restored_method
                    except OSError:
                        pass
        if snapshot:
            shutil.rmtree(Path(snapshot["path"]), ignore_errors=True)
        raise
    if snapshot:
        state.setdefault("snapshots", {}).setdefault(item["catalog_id"], []).append(snapshot)
    state.setdefault("activations", {})[item["catalog_id"]] = activation
    return {"activation": activation, "snapshot": snapshot}


def lock_identity(item: dict[str, Any]) -> dict[str, Any]:
    return {"revision": item.get("revision"), "checksum": item.get("verification", {}).get("checksum"), "version": item.get("version")}


def ensure_fetched(
    repo: Path,
    mode: str,
    item: dict[str, Any],
    state: dict[str, Any],
    state_dir: Path,
    *,
    mirror_repo: str | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    catalog_id = item["catalog_id"]
    acquisition = state.get("acquisitions", {}).get(catalog_id)
    if acquisition and not refresh:
        cache_dir = acquire.cache_path(state_dir, str(acquisition.get("cache_key", "")))
        if acquire.verify_cached(item, state_dir, state).get("status") == "verified":
            used_at = utc_now()
            acquisition["last_used"] = used_at
            cache_record = state.get("cache", {}).get(acquisition.get("cache_key"))
            if isinstance(cache_record, dict):
                cache_record["last_used"] = used_at
            return acquisition
    packaged_root = packaged_data_root() if (packaged_data_root() / "registry.json").is_file() else None
    checkout_root = repo if mode == "checkout" else None
    record = acquire.fetch_item(
        item,
        state_dir,
        packaged_root=packaged_root,
        checkout_root=checkout_root,
        mirror_repo=mirror_repo,
        refresh=refresh,
    )
    cache_dir = acquire.cache_path(state_dir, record["cache_key"])
    manifest = trust.file_manifest(cache_dir)
    record["manifest_sha256"] = manifest["digest"]
    record["manifest_files"] = manifest["file_count"]
    record["last_used"] = utc_now()
    state.setdefault("acquisitions", {})[catalog_id] = record
    cache_dir = acquire.cache_path(state_dir, record["cache_key"])
    state.setdefault("cache", {})[record["cache_key"]] = {
        "checksum": record["cache_key"],
        "created": record["fetched"],
        "last_used": record["last_used"],
        "catalog_ids": sorted({catalog_id, *(state.get("cache", {}).get(record["cache_key"], {}).get("catalog_ids", []))}),
        "path": str(cache_dir),
    }
    return record


def cmd_fetch(args: argparse.Namespace, repo: Path, mode: str, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    gate_item_for_acquisition(item)
    gate_risk(item, args.allow_risk, confirm_destructive=getattr(args, "confirm_destructive", False))
    state = load_state(state_dir)
    cleanup_one_shot(state, Path(args_home_for_cleanup(args)))
    if item.get("source_id") == "personal-overlay":
        overlay = state.get("overlays", {}).get(item["catalog_id"], {})
        result = {
            "status": "already-local",
            "catalog_id": item["catalog_id"],
            "method": "personal-overlay",
            "cache_path": overlay.get("path"),
            "expected_checksum": item.get("verification", {}).get("checksum"),
            "network": "not-used",
        }
        emit(result, args.json)
        return 0
    confirm_action(args, {
        "action": "fetch",
        "catalog_id": item["catalog_id"],
        "source": item.get("source", {}).get("repository"),
        "revision": item.get("source", {}).get("commit"),
        "license": item.get("archive", {}).get("license"),
        "risk": item.get("risk"),
        "persistent": False,
    })
    record = ensure_fetched(repo, mode, item, state, state_dir, mirror_repo=args.from_repo, refresh=args.refresh)
    save_state(state_dir, state)
    result = {
        "status": "fetched",
        "catalog_id": item["catalog_id"],
        "method": record["method"],
        "repository": record["repository"],
        "revision": record["revision"],
        "subdirectory": record.get("subdirectory"),
        "cache_key": record["cache_key"],
        "cache_path": str(acquire.cache_path(state_dir, record["cache_key"])),
        "expected_checksum": record.get("expected_checksum"),
        "manifest_sha256": record.get("manifest_sha256"),
        "network": "not-used" if record["method"] == "packaged" else ("mirror" if record.get("mirror") else "used"),
    }
    emit(result, args.json)
    return 0


def args_home_for_cleanup(args: argparse.Namespace) -> str:
    return args.home if args.home else str(Path.home())


def enforce_cache_failure(
    home: Path,
    state_dir: Path,
    state: dict[str, Any],
    item: dict[str, Any],
    cache_result: dict[str, Any],
) -> dict[str, Any]:
    """Quarantine an enforceable cache violation and remove manager-owned state.

    A checksum mismatch, manifest mismatch, or unsafe scan finding means the
    cached payload no longer matches its approved identity. The failure is
    recorded, target exposures are removed through ownership-safe removal, and
    the cache object is deleted so it cannot keep serving tampered content.
    """
    catalog_id = item["catalog_id"]
    code = "cache-integrity-violation"
    detail = f"cached content no longer matches its recorded identity (status={cache_result.get('status')})"
    findings = cache_result.get("findings")
    if cache_result.get("status") == "unsafe" and findings:
        code = str(findings[0].get("code", code))
        detail = f"static policy scan rejected cached content; first finding: {findings[0]}"
    if cache_result.get("manifest_match") is False and cache_result.get("manifest_only_violation"):
        code = "manifest-mismatch"
        detail = "per-file manifest no longer matches the manifest recorded at acquisition"
    acquire.record_quarantine(state_dir, {
        "catalog_id": catalog_id,
        "code": code,
        "detail": detail,
        "expected": cache_result.get("expected"),
        "actual": cache_result.get("actual"),
        "cache_key": cache_result.get("cache_key"),
        "enforced_by": "verify",
    })
    removed_targets: list[str] = []
    refused_targets: list[str] = []
    activation = state.get("activations", {}).pop(catalog_id, None)
    if isinstance(activation, dict):
        for target, record in sorted(activation.get("targets", {}).items()):
            if not isinstance(record, dict):
                continue
            try:
                remove_owned_destination(home, item, target, record)
                removed_targets.append(target)
            except (RuntimeError, UserError):
                refused_targets.append(target)
    acquisition = state.get("acquisitions", {}).pop(catalog_id, None)
    cache_removed = False
    if isinstance(acquisition, dict):
        cache_key = str(acquisition.get("cache_key", ""))
        if cache_key and not _cache_references(state, cache_key, exclude=catalog_id):
            cache_dir = acquire.cache_path(state_dir, cache_key)
            if cache_dir.is_dir() and not is_reparse_point(cache_dir):
                acquire.clear_readonly(cache_dir)
                shutil.rmtree(cache_dir, ignore_errors=True)
                state.get("cache", {}).pop(cache_key, None)
                cache_removed = not cache_dir.exists()
    save_state(state_dir, state)
    return {
        "quarantined": True,
        "code": code,
        "targets_removed": removed_targets,
        "targets_refused": refused_targets,
        "cache_removed": cache_removed,
    }


def cmd_verify(args: argparse.Namespace, repo: Path, mode: str, home: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    state = load_state(state_dir)
    results: dict[str, Any] = {"catalog_id": item["catalog_id"]}
    checked = False
    overlay = state.get("overlays", {}).get(item["catalog_id"])
    if isinstance(overlay, dict):
        path = Path(str(overlay.get("path", "")))
        actual = directory_checksum(path) if path.is_dir() and not is_reparse_point(path) else None
        results["overlay"] = {
            "status": "verified" if actual == overlay.get("checksum") == item.get("verification", {}).get("checksum") else "mismatch",
            "expected": overlay.get("checksum"),
            "actual": actual,
            "path": str(path),
        }
        checked = True
    if item["catalog_id"] in state.get("acquisitions", {}):
        results["cache"] = acquire.verify_cached(item, state_dir, state)
        checked = True
    if mode == "checkout" and item_path(repo, item) is not None:
        results["checkout_archive"] = integrity(repo, item)
        checked = True
    if not checked:
        status = item.get("archive", {}).get("status")
        if status != "archived":
            raise UserError(f"{item['catalog_id']} is {status}; there is no local payload to verify")
        raise UserError(f"{item['catalog_id']} is not fetched yet; run 'skillhub fetch {item['catalog_id']}' first")
    cache_result = results.get("cache")
    if isinstance(cache_result, dict):
        acquisition = state.get("acquisitions", {}).get(item["catalog_id"])
        recorded_manifest = acquisition.get("manifest_sha256") if isinstance(acquisition, dict) else None
        if recorded_manifest:
            cache_dir = acquire.cache_path(state_dir, str(acquisition.get("cache_key", "")))
            if cache_dir.is_dir() and not is_reparse_point(cache_dir):
                digest = trust.file_manifest(cache_dir)["digest"]
                cache_result["manifest_sha256"] = digest
                cache_result["manifest_match"] = digest == recorded_manifest
                if not cache_result["manifest_match"] and cache_result.get("status") == "verified":
                    cache_result["status"] = "mismatch"
                    cache_result["manifest_only_violation"] = True
        if cache_result.get("status") in {"mismatch", "unsafe"}:
            results["enforcement"] = enforce_cache_failure(home, state_dir, state, item, cache_result)
            results["quarantined"] = True
    statuses = [row.get("status") for row in (results.get("cache"), results.get("checkout_archive"), results.get("overlay")) if isinstance(row, dict)]
    results["status"] = "verified" if statuses and all(value == "verified" for value in statuses) else "review-required"
    emit(results, args.json)
    return 0 if results["status"] == "verified" else 1


def cmd_install(args: argparse.Namespace, repo: Path, mode: str, home: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    gate_item_for_acquisition(item)
    gate_risk(item, args.allow_risk, confirm_destructive=getattr(args, "confirm_destructive", False))
    targets = parse_target_list(args.target)
    state = load_state(state_dir)
    cleanup_one_shot(state, home)
    lock = state.get("locks", {}).get(item["catalog_id"])
    if lock and lock != lock_identity(item):
        raise UserError("lock mismatch; review the catalog update before reinstalling", code="lock-mismatch")
    confirm_action(args, {
        "action": "install",
        "catalog_id": item["catalog_id"],
        "source": item.get("source", {}).get("repository"),
        "revision": item.get("source", {}).get("commit"),
        "license": item.get("archive", {}).get("license"),
        "risk": item.get("risk"),
        "targets": [display_target(target) for target in targets],
        "persistent": True,
    })
    if item.get("source_id") == "personal-overlay":
        source = resolve_content(repo, mode, item, state, state_dir)
        result = enable_targets(repo, home, state_dir, state, item, source, targets)
        state.setdefault("locks", {})[item["catalog_id"]] = lock_identity(item)
        save_state(state_dir, state)
        emit({
            "status": "installed",
            "catalog_id": item["catalog_id"],
            "targets": {target: result["activation"]["targets"][target]["destination"] for target in targets},
            "skill_path": str(source),
            "checksum": item.get("verification", {}).get("checksum"),
            "snapshot": result["snapshot"],
            "persistent": True,
            "network": "not-used",
        }, args.json)
        return 0
    record = ensure_fetched(repo, mode, item, state, state_dir, mirror_repo=args.from_repo, refresh=args.refresh)
    save_state(state_dir, state)
    cache_dir = acquire.cache_path(state_dir, record["cache_key"])
    verification = acquire.verify_cached(item, state_dir, state)
    if verification.get("status") != "verified":
        raise UserError(f"verification failed after fetch: {verification}")
    result = enable_targets(repo, home, state_dir, state, item, cache_dir, targets)
    state.setdefault("locks", {})[item["catalog_id"]] = lock_identity(item)
    save_state(state_dir, state)
    emit({
        "status": "installed",
        "catalog_id": item["catalog_id"],
        "targets": {target: result["activation"]["targets"][target]["destination"] for target in targets},
        "skill_path": str(cache_dir),
        "cache_key": record["cache_key"],
        "revision": record["revision"],
        "snapshot": result["snapshot"],
        "persistent": True,
    }, args.json)
    return 0


def cmd_use(args: argparse.Namespace, repo: Path, mode: str, home: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    if not args.once:
        raise UserError("use requires --once; for persistent activation run 'skillhub install'")
    gate_item_for_acquisition(item)
    gate_risk(item, args.allow_risk, confirm_destructive=getattr(args, "confirm_destructive", False))
    targets = parse_target_list(args.target, allow_all=False)
    if len(targets) != 1:
        raise UserError("use --once takes exactly one target")
    target = targets[0]
    ttl = args.ttl_minutes
    if ttl <= 0 or ttl > MAX_ONE_SHOT_TTL_MINUTES:
        raise UserError(f"--ttl-minutes must be between 1 and {MAX_ONE_SHOT_TTL_MINUTES}")
    state = load_state(state_dir)
    cleanup_one_shot(state, home)
    confirm_action(args, {
        "action": "use-once",
        "catalog_id": item["catalog_id"],
        "source": item.get("source", {}).get("repository"),
        "revision": item.get("source", {}).get("commit"),
        "license": item.get("archive", {}).get("license"),
        "risk": item.get("risk"),
        "target": display_target(target),
        "persistent": False,
        "ttl_minutes": ttl,
    })
    if item.get("source_id") == "personal-overlay":
        source = resolve_content(repo, mode, item, state, state_dir)
        result = enable_targets(repo, home, state_dir, state, item, source, [target], one_shot=True, ttl_minutes=ttl)
        exposure = result["activation"]["targets"][target]
        save_state(state_dir, state)
        emit({
            "status": "one-shot",
            "catalog_id": item["catalog_id"],
            "persistent": False,
            "target": target,
            "skill_path": str(source),
            "exposure": exposure["destination"],
            "expires": exposure["expires"],
            "network": "not-used",
        }, args.json)
        return 0
    record = ensure_fetched(repo, mode, item, state, state_dir, mirror_repo=args.from_repo)
    cache_dir = acquire.cache_path(state_dir, record["cache_key"])
    verification = acquire.verify_cached(item, state_dir, state)
    if verification.get("status") != "verified":
        raise UserError(f"verification failed: {verification}")
    activation = state.get("activations", {}).get(item["catalog_id"])
    existing = activation.get("targets", {}).get(target) if activation else None
    if existing and not existing.get("one_shot"):
        raise UserError(
            "item already has a persistent activation for this target; use it explicitly or disable it first",
            code="persistent-activation-exists",
        )
    save_state(state_dir, state)
    result = enable_targets(repo, home, state_dir, state, item, cache_dir, [target], one_shot=True, ttl_minutes=ttl)
    exposure = result["activation"]["targets"][target]
    save_state(state_dir, state)
    emit({
        "status": "one-shot",
        "catalog_id": item["catalog_id"],
        "persistent": False,
        "target": target,
        "skill_path": str(cache_dir),
        "exposure": exposure["destination"],
        "expires": exposure["expires"],
        "note": "Read SKILL.md at skill_path now; the transient exposure expires and is not persistent.",
    }, args.json)
    return 0


def cmd_init(args: argparse.Namespace, repo: Path, mode: str, home: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, "core.skill-hub-router")
    profile_data = profile(args, repo)
    targets = parse_target_list(args.target) if args.target else parse_target_list(",".join(profile_data.get("targets", list(KNOWN_TARGETS))))
    state = load_state(state_dir)
    cleanup_one_shot(state, home)
    record = ensure_fetched(repo, mode, item, state, state_dir)
    cache_dir = acquire.cache_path(state_dir, record["cache_key"])
    result = enable_targets(repo, home, state_dir, state, item, cache_dir, targets)
    state.setdefault("locks", {})[item["catalog_id"]] = lock_identity(item)
    state["init"] = {"targets": targets, "when": utc_now(), "profile": args.profile}
    save_state(state_dir, state)
    emit({
        "status": "initialized",
        "router": item["catalog_id"],
        "skill_path": str(cache_dir),
        "targets": {target: result["activation"]["targets"][target]["destination"] for target in targets},
        "state_dir": str(state_dir),
        "next": "skillhub search <query>",
    }, args.json)
    return 0


def cmd_list(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    state = load_state(state_dir)
    if args.all:
        rows = []
        for item in registry.get("skills", []):
            rows.append({
                "catalog_id": item["catalog_id"],
                "status": item.get("archive", {}).get("status"),
                "acquirable": item.get("acquisition", {}).get("status") == "available",
                "risk": item.get("risk"),
                "local_state": local_lifecycle(state, item, state_dir),
            })
        emit({"total": len(rows), "items": rows}, args.json)
        return 0
    installed = []
    for catalog_id in sorted(state.get("activations", {})):
        activation = state["activations"][catalog_id]
        targets = {}
        for target, record in sorted(activation.get("targets", {}).items()):
            destination = Path(record["destination"])
            targets[display_target(target)] = {
                "destination": str(destination),
                "present": destination.exists() or destination.is_symlink(),
                "one_shot": bool(record.get("one_shot")),
                "expires": record.get("expires"),
            }
        acquisition = state.get("acquisitions", {}).get(catalog_id)
        installed.append({
            "catalog_id": catalog_id,
            "risk": activation.get("risk"),
            "cache_key": acquisition.get("cache_key") if acquisition else None,
            "persistent": any(not record.get("one_shot") for record in activation.get("targets", {}).values()),
            "targets": targets,
        })
    cached = []
    for catalog_id in sorted(state.get("acquisitions", {})):
        if catalog_id in state.get("activations", {}):
            continue
        acquisition = state["acquisitions"][catalog_id]
        cache_dir = acquire.cache_path(state_dir, str(acquisition.get("cache_key", "")))
        cached.append({
            "catalog_id": catalog_id,
            "state": "verified" if cache_dir.is_dir() else "cache-missing",
            "cache_key": acquisition.get("cache_key"),
            "revision": acquisition.get("revision"),
        })
    emit({"installed": installed, "cached_not_enabled": cached}, args.json)
    return 0


def cmd_uninstall(args: argparse.Namespace, repo: Path, home: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    state = load_state(state_dir)
    cleanup_one_shot(state, home)
    item = find_item(registry, args.item)
    catalog_id = item["catalog_id"]
    activation = state.get("activations", {}).get(catalog_id)
    removed_targets: list[str] = []
    if activation:
        for target, record in sorted(activation.get("targets", {}).items()):
            remove_owned_destination(home, item, target, record)
            removed_targets.append(target)
        state["activations"].pop(catalog_id, None)
    acquisition = state.get("acquisitions", {}).pop(catalog_id, None)
    state.get("locks", {}).pop(catalog_id, None)
    gc: dict[str, Any] = {"cache_key": None, "removed": False, "reason": None}
    if acquisition:
        cache_key = str(acquisition.get("cache_key", ""))
        gc["cache_key"] = cache_key
        referenced = _cache_references(state, cache_key, exclude=catalog_id)
        if referenced:
            gc["reason"] = "still referenced by: " + ", ".join(sorted(referenced))
        else:
            cache_dir = acquire.cache_path(state_dir, cache_key)
            if cache_dir.is_dir() and not is_reparse_point(cache_dir):
                acquire.clear_readonly(cache_dir)
                shutil.rmtree(cache_dir, ignore_errors=True)
                state.get("cache", {}).pop(cache_key, None)
                gc["removed"] = True
            else:
                gc["reason"] = "cache object is missing or linked; left untouched"
    save_state(state_dir, state)
    emit({"status": "uninstalled", "catalog_id": catalog_id, "targets_removed": removed_targets, "cache": gc}, args.json)
    return 0


def _cache_references(
    state: dict[str, Any],
    cache_key: str,
    exclude: str | None = None,
    *,
    include_acquisitions: bool = True,
) -> set[str]:
    refs: set[str] = set()
    cache_root_marker = f"cache{os.sep}{cache_key}"
    if include_acquisitions:
        for catalog_id, acquisition in state.get("acquisitions", {}).items():
            if catalog_id != exclude and acquisition.get("cache_key") == cache_key:
                refs.add(f"acquisition:{catalog_id}")
    for catalog_id, activation in state.get("activations", {}).items():
        if catalog_id == exclude:
            continue
        if cache_key and cache_root_marker in str(activation.get("source", "")):
            refs.add(f"activation:{catalog_id}")
        for record in activation.get("targets", {}).values():
            if cache_key and cache_root_marker in str(record.get("source", "")):
                refs.add(f"activation:{catalog_id}")
    for catalog_id, snapshots in state.get("snapshots", {}).items():
        for snapshot in snapshots:
            if cache_key and cache_root_marker in str(snapshot.get("path", "")):
                refs.add(f"snapshot:{catalog_id}")
    return refs


def _gc_cache_path(state_dir: Path, cache_key: str) -> Path | None:
    """Resolve one real, immediate manager-owned content-addressed directory."""
    if not re.fullmatch(r"[0-9a-f]{64}", cache_key):
        return None
    cache_root = state_dir / "cache"
    candidate = cache_root / cache_key
    if is_reparse_point(cache_root) or candidate.is_symlink() or is_reparse_point(candidate):
        return None
    try:
        resolved_root = cache_root.resolve(strict=True)
        resolved = candidate.resolve(strict=True)
    except (FileNotFoundError, OSError):
        return None
    if not resolved.is_dir() or resolved.parent != resolved_root:
        return None
    return resolved


def _gc_last_used(state: dict[str, Any], cache_key: str) -> dt.datetime | None:
    values: list[Any] = []
    cache_record = state.get("cache", {}).get(cache_key, {})
    if isinstance(cache_record, dict):
        values.extend((cache_record.get("last_used"), cache_record.get("created")))
    for acquisition in state.get("acquisitions", {}).values():
        if isinstance(acquisition, dict) and acquisition.get("cache_key") == cache_key:
            values.extend((acquisition.get("last_used"), acquisition.get("fetched")))
    parsed: list[dt.datetime] = []
    for value in values:
        if not isinstance(value, str):
            continue
        try:
            parsed.append(parse_iso(value))
        except ValueError:
            continue
    return max(parsed) if parsed else None


def cmd_gc(args: argparse.Namespace, repo: Path, state_dir: Path, home: Path) -> int:
    """Preview or remove only old, unused, state-owned cache objects."""
    del repo
    if args.max_age_days < 0:
        raise UserError("--max-age-days must be zero or greater")
    state = load_state(state_dir)
    cache_root = state_dir / "cache"
    expired_exposures = cleanup_one_shot(state, home) if args.confirm else []
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.max_age_days)
    removed: list[str] = []
    retained: dict[str, str] = {}
    entries: list[dict[str, Any]] = []
    for cache_key in sorted(state.get("cache", {})):
        cache_dir = _gc_cache_path(state_dir, cache_key)
        references = _cache_references(state, cache_key, include_acquisitions=False)
        locked_catalog_ids = sorted(
            catalog_id
            for catalog_id, acquisition in state.get("acquisitions", {}).items()
            if isinstance(acquisition, dict)
            and acquisition.get("cache_key") == cache_key
            and catalog_id in state.get("locks", {})
        )
        references.update(f"lock:{catalog_id}" for catalog_id in locked_catalog_ids)
        if references:
            retained[cache_key] = "referenced: " + ", ".join(sorted(references))
            entries.append({"cache_key": cache_key, "status": "protected", "reason": retained[cache_key]})
            continue
        if cache_dir is None:
            retained[cache_key] = "missing, linked, or outside the owned cache boundary"
            entries.append({"cache_key": cache_key, "status": "skipped-unsafe", "reason": retained[cache_key]})
            continue
        last_used = _gc_last_used(state, cache_key)
        if last_used is None:
            retained[cache_key] = "no valid usage timestamp"
            entries.append({"cache_key": cache_key, "status": "skipped-invalid-state", "reason": retained[cache_key]})
            continue
        if last_used > cutoff:
            retained[cache_key] = "inside the retention window"
            entries.append({"cache_key": cache_key, "status": "fresh", "last_used": last_used.isoformat()})
            continue
        if not args.confirm:
            entries.append({"cache_key": cache_key, "status": "eligible", "last_used": last_used.isoformat()})
            continue
        references_now = _cache_references(state, cache_key, include_acquisitions=False)
        locked_now = any(
            isinstance(acquisition, dict)
            and acquisition.get("cache_key") == cache_key
            and catalog_id in state.get("locks", {})
            for catalog_id, acquisition in state.get("acquisitions", {}).items()
        )
        owned_now = _gc_cache_path(state_dir, cache_key)
        if references_now or locked_now or owned_now != cache_dir:
            retained[cache_key] = "references or ownership changed after planning"
            entries.append({"cache_key": cache_key, "status": "skipped-race-or-unsafe", "reason": retained[cache_key]})
            continue
        acquire.clear_readonly(cache_dir)
        shutil.rmtree(cache_dir)
        removed.append(cache_key)
        entries.append({"cache_key": cache_key, "status": "removed", "last_used": last_used.isoformat()})
        state.get("cache", {}).pop(cache_key, None)
        for catalog_id, acquisition in list(state.get("acquisitions", {}).items()):
            if isinstance(acquisition, dict) and acquisition.get("cache_key") == cache_key:
                state["acquisitions"].pop(catalog_id, None)
    # Valid-looking but untracked paths are visible in the report, never
    # inferred to be manager-owned after state loss or manual copying.
    if cache_root.is_dir():
        for candidate in sorted(cache_root.iterdir(), key=lambda p: p.name):
            if not re.fullmatch(r"[0-9a-f]{64}", candidate.name) or candidate.name in state.get("cache", {}):
                continue
            entries.append({"cache_key": candidate.name, "status": "skipped-untracked", "path": str(candidate)})
    if args.confirm:
        save_state(state_dir, state)
    emit({
        "status": "gc-complete" if args.confirm else "gc-preview",
        "dry_run": not args.confirm,
        "max_age_days": args.max_age_days,
        "removed": removed,
        "retained": retained,
        "expired_exposures_removed": expired_exposures,
        "entries": entries,
    }, args.json)
    return 0


def cmd_enable(args: argparse.Namespace, repo: Path, mode: str, home: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    archive = item.get("archive", {})
    if archive.get("status") != "archived":
        raise UserError(f"{item['catalog_id']} is {archive.get('status')}; metadata-only and blocked items cannot be activated")
    if item.get("activation_policy") == "blocked":
        raise UserError(f"{item['catalog_id']} is blocked: {archive.get('blocker')}")
    if item.get("source_id") != "personal-overlay":
        ok, reason = acquire.license_gate(item)
        if not ok:
            raise UserError(f"{item['catalog_id']}: {reason}")
    gate_risk(item, args.allow_risk, confirm_destructive=getattr(args, "confirm_destructive", False))
    state = load_state(state_dir)
    cleanup_one_shot(state, home)
    lock = state.get("locks", {}).get(item["catalog_id"])
    identity = lock_identity(item)
    if lock and lock != identity:
        raise UserError("lock mismatch; review the catalog update before activation", code="lock-mismatch")
    targets = selected_targets(args)
    if item["catalog_id"] != "core.skill-hub-router":
        confirm_action(args, {
            "action": "enable",
            "catalog_id": item["catalog_id"],
            "source": item.get("source", {}).get("repository"),
            "revision": item.get("source", {}).get("commit"),
            "license": item.get("archive", {}).get("license"),
            "risk": item.get("risk"),
            "targets": [display_target(target) for target in targets],
            "persistent": True,
        })
    source = resolve_content(repo, mode, item, state, state_dir)
    findings = acquire.scan_payload(source)
    if findings:
        raise UserError(f"activation payload rejected: {findings[0]}", code="unsafe-payload")
    if directory_checksum(source) != item.get("verification", {}).get("checksum"):
        raise UserError("integrity check failed for resolved content")
    result = enable_targets(repo, home, state_dir, state, item, source, targets)
    activation = result["activation"]
    activation["checksum"] = item.get("verification", {}).get("checksum")
    state.setdefault("activations", {})[item["catalog_id"]] = activation
    save_state(state_dir, state)
    emit({"status": "enabled", "catalog_id": item["catalog_id"], "targets": targets, "snapshot": result["snapshot"]}, args.json)
    return 0


def cmd_disable(args: argparse.Namespace, repo: Path, home: Path, state_dir: Path) -> int:
    state = load_state(state_dir)
    cleanup_one_shot(state, home)
    item = find_item(load_registry(repo, state_dir), args.item)
    activation = state.get("activations", {}).get(item["catalog_id"])
    if not activation:
        emit({"status": "not-enabled", "catalog_id": item["catalog_id"]}, args.json)
        return 0
    targets = selected_targets(args)
    for target in targets:
        record = activation.get("targets", {}).get(target)
        if not record:
            continue
        remove_owned_destination(home, item, target, record)
        activation["targets"].pop(target, None)
    if not activation.get("targets"):
        state["activations"].pop(item["catalog_id"], None)
    save_state(state_dir, state)
    emit({"status": "disabled", "catalog_id": item["catalog_id"], "targets": targets}, args.json)
    return 0


def cmd_bootstrap(args: argparse.Namespace, repo: Path, mode: str, home: Path, state_dir: Path) -> int:
    data = profile(args, repo)
    item = find_item(load_registry(repo, state_dir), "core.skill-hub-router")
    args.item = item["catalog_id"]
    args.target = ",".join(data.get("targets", KNOWN_TARGETS))
    args.allow_risk = data.get("max_risk", "instructions-only")
    return cmd_enable(args, repo, mode, home, state_dir)


def cmd_status(args: argparse.Namespace, repo: Path, home: Path, state_dir: Path) -> int:
    state = load_state(state_dir)
    removed = cleanup_one_shot(state, home)
    if removed:
        save_state(state_dir, state)
    rows = []
    for catalog_id, activation in sorted(state.get("activations", {}).items()):
        targets = {}
        for target, record in sorted(activation.get("targets", {}).items()):
            destination = Path(record["destination"])
            targets[target] = {
                "destination": str(destination),
                "present": destination.exists() or destination.is_symlink(),
                "method": record.get("method"),
                "one_shot": bool(record.get("one_shot")),
                "expires": record.get("expires"),
            }
        rows.append({"catalog_id": catalog_id, "risk": activation.get("risk"), "targets": targets})
    cache_rows = {key: {"path": row.get("path"), "catalog_ids": row.get("catalog_ids", [])} for key, row in sorted(state.get("cache", {}).items())}
    emit({
        "activations": rows,
        "locks": state.get("locks", {}),
        "overlays": state.get("overlays", {}),
        "acquisitions": state.get("acquisitions", {}),
        "cache": cache_rows,
        "quarantine_count": len(acquire.quarantine_history(state_dir)),
        "expired_one_shot": removed,
    }, args.json)
    return 0


def cmd_doctor(args: argparse.Namespace, repo: Path, mode: str, home: Path, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    state = load_state(state_dir)
    removed = cleanup_one_shot(state, home)
    if removed:
        save_state(state_dir, state)
    findings: list[dict[str, str]] = []
    if mode == "checkout":
        if not (repo / "LICENSE").is_file():
            findings.append({"severity": "error", "code": "missing-license"})
        try:
            git_status = run_git(repo, "status", "--porcelain").strip()
            if git_status:
                findings.append({"severity": "review", "code": "git-dirty"})
        except RuntimeError:
            findings.append({"severity": "review", "code": "not-a-git-checkout"})
    for catalog_id, activation in state.get("activations", {}).items():
        try:
            item = find_item(registry, catalog_id)
            if mode == "checkout":
                check = integrity(repo, item)
                if check.get("status") not in {"verified", "not-archived", "missing"}:
                    findings.append({"severity": "error", "code": f"integrity:{catalog_id}"})
        except UserError:
            findings.append({"severity": "error", "code": f"unknown-activation:{catalog_id}"})
        for target, record in activation.get("targets", {}).items():
            destination = Path(record["destination"])
            if not destination.exists() and not destination.is_symlink():
                findings.append({"severity": "error", "code": f"missing-target:{target}:{catalog_id}"})
    for cache_key, row in state.get("cache", {}).items():
        cache_dir = acquire.cache_path(state_dir, cache_key)
        if not cache_dir.is_dir() or is_reparse_point(cache_dir):
            findings.append({"severity": "error", "code": f"cache-missing:{cache_key[:12]}"})
            continue
        cache_findings = acquire.scan_payload(cache_dir)
        if cache_findings:
            findings.append({"severity": "error", "code": f"cache-unsafe:{cache_key[:12]}"})
        elif directory_checksum(cache_dir) != cache_key:
            findings.append({"severity": "error", "code": f"cache-corrupt:{cache_key[:12]}"})
    quarantine_count = len(acquire.quarantine_history(state_dir))
    if quarantine_count:
        findings.append({"severity": "review", "code": f"quarantine-events:{quarantine_count}"})
    result = {"status": "ok" if not any(row["severity"] == "error" for row in findings) else "error", "repo": str(repo), "mode": mode, "state_dir": str(state_dir), "findings": findings}
    emit(result, args.json)
    return 0 if result["status"] == "ok" else 1


def cmd_lock(args: argparse.Namespace, repo: Path, state_dir: Path, unlock: bool = False) -> int:
    state = load_state(state_dir)
    item = find_item(load_registry(repo, state_dir), args.item)
    if unlock:
        state.get("locks", {}).pop(item["catalog_id"], None)
        result = {"status": "unlocked", "catalog_id": item["catalog_id"]}
    else:
        state.setdefault("locks", {})[item["catalog_id"]] = lock_identity(item)
        result = {"status": "locked", "catalog_id": item["catalog_id"], "identity": state["locks"][item["catalog_id"]]}
    save_state(state_dir, state)
    emit(result, args.json)
    return 0


def cmd_snapshot(args: argparse.Namespace, repo: Path, mode: str, state_dir: Path) -> int:
    registry = load_registry(repo, state_dir)
    item = find_item(registry, args.item)
    state = load_state(state_dir)
    source: Path | None = None
    if mode == "checkout":
        candidate = item_path(repo, item)
        if candidate is not None and candidate.is_dir():
            source = candidate
    if source is None:
        acquisition = state.get("acquisitions", {}).get(item["catalog_id"])
        if acquisition:
            cache_dir = acquire.cache_path(state_dir, str(acquisition.get("cache_key", "")))
            if cache_dir.is_dir():
                source = cache_dir
    if source is None or not source.is_dir():
        raise UserError("only archived or fetched local items can be snapshotted")
    record = make_snapshot(repo, state_dir, item, source)
    state.setdefault("snapshots", {}).setdefault(item["catalog_id"], []).append(record)
    save_state(state_dir, state)
    emit({"status": "snapshotted", "catalog_id": item["catalog_id"], "snapshot": record}, args.json)
    return 0


def cmd_rollback(args: argparse.Namespace, repo: Path, home: Path, state_dir: Path) -> int:
    item = find_item(load_registry(repo, state_dir), args.item)
    state = load_state(state_dir)
    records = state.get("snapshots", {}).get(item["catalog_id"], [])
    if not records:
        raise UserError("no verified snapshot exists")
    snapshot = records[-1]
    source = Path(snapshot["path"])
    snapshot_root = (state_dir / "snapshots").resolve()
    if not source.is_dir() or not path_within(source, snapshot_root) or is_reparse_point(source):
        raise UserError("snapshot path is outside manager-owned state", code="snapshot-ownership")
    if directory_checksum(source) != snapshot.get("checksum") or acquire.scan_payload(source):
        raise UserError("snapshot integrity check failed", code="snapshot-mismatch")
    activation = state.get("activations", {}).get(item["catalog_id"])
    if not activation:
        raise UserError("item is not active; rollback has no target")
    targets = selected_targets(args)
    roots = target_roots(home)
    for target in targets:
        record = activation.get("targets", {}).get(target)
        if not record:
            continue
        destination = expected_destination(home, item, target)
        if destination.exists() or destination.is_symlink():
            remove_owned_destination(home, item, target, record)
        method = expose(source, destination)
        record.update({
            "destination": str(destination),
            "method": method,
            "source": str(source),
            "content_checksum": snapshot.get("checksum"),
            "rollback": utc_now(),
            "owned": True,
        })
    if snapshot.get("identity"):
        state.setdefault("locks", {})[item["catalog_id"]] = snapshot["identity"]
    save_state(state_dir, state)
    emit({"status": "rolled-back", "catalog_id": item["catalog_id"], "snapshot": snapshot, "targets": targets}, args.json)
    return 0


def cmd_sync(args: argparse.Namespace, repo: Path, mode: str, state_dir: Path) -> int:
    """Synced status, push, pull of the private paseo_skill_save remote."""
    state = load_state(state_dir)
    remote_config = state.get("remote", {})
    remote_url = remote_config.get("url") if isinstance(remote_config, dict) else None

    work_dir = state_dir / "remote"

    if args.sync_action == "status":
        last_push = state.get("sync", {}).get("last_push") if isinstance(state.get("sync"), dict) else None
        last_pull = state.get("sync", {}).get("last_pull") if isinstance(state.get("sync"), dict) else None
        result = remote.sync_status(remote_url, work_dir)
        result["remote_url"] = remote_url
        result["state_dir"] = str(state_dir)
        if last_push:
            result["last_push"] = last_push
        if last_pull:
            result["last_pull"] = last_pull
        emit(result, args.json)
        return 0 if result.get("status") in {"synced", "no-remote", "no-local-repo"} else 1

    if args.sync_action == "onboard":
        result = onboard_github(work_dir)
        if result.get("status") in ("ready", "created"):
            remote_config = {"type": "github", "url": result["remote"],
                             "login": result.get("login", ""), "onboarded": utc_now()}
            state["remote"] = remote_config
            save_state(state_dir, state)
        emit(result, args.json)
        return 0 if result.get("status") in {"ready", "created"} else 1

    if args.sync_action == "push":
        if not remote_url:
            raise UserError("no remote configured; run 'skillhub sync onboard' first", code="no-remote")
        validated_url = remote.validate_remote_url(remote_url)
        if validated_url is None:
            raise UserError("remote URL is invalid", code="invalid-remote-url")
        if not work_dir.is_dir() or not (work_dir / "library.json").is_file():
            # A reused, already-marked GitHub library has no local clone yet.
            # Clone it only through the validating clone helper; never create
            # an empty replacement or overwrite an existing path.
            clone_result = clone_remote(validated_url, work_dir)
            if clone_result.get("status") != "cloned":
                raise UserError("could not prepare validated local portable repo",
                                code="no-local-repo")

        pull_ok = None
        if not args.no_pull:
            try:
                pull_ok = remote.pull_from_remote(validated_url, work_dir)
            except (RuntimeError, remote.RemoteError, subprocess.CalledProcessError) as exc:
                result = {"status": "pull-before-push-failed", "error": str(exc),
                          "code": getattr(exc, "code", "pull-failed")}
                emit(result, args.json)
                return 1

        overlays = state.get("overlays", {})
        local_items: list[dict[str, Any]] = []
        payload_roots: dict[str, Path] = {}
        for catalog_id, record in overlays.items():
            if not isinstance(record, dict):
                continue
            item_data = record.get("item") if isinstance(record.get("item"), dict) else None
            if not item_data:
                continue
            portable = remote.make_portable_item(item_data)
            local_items.append(portable)
            overlay_path = Path(str(record.get("path", "")))
            if overlay_path.is_dir():
                payload_roots[catalog_id] = overlay_path

        if pull_ok and pull_ok.get("status") == "pulled":
            remote_items: list[dict[str, Any]] = []
            items_dir = work_dir / "catalog" / "items"
            if items_dir.is_dir():
                for f in sorted(items_dir.glob("*.json")):
                    try:
                        remote_items.append(read_json(f))
                    except (json.JSONDecodeError, OSError):
                        pass

            conflicts = remote.detect_conflicts(
                local_items,
                remote_items,
            )
            blocking = [c for c in conflicts if c.get("resolution") not in ("pull-would-add", "push-would-add")]

            if blocking:
                metadata_stop = any(c["type"] == "checksum-conflict" for c in blocking)
                result = {
                    "status": "review-required" if metadata_stop else "conflict",
                    "conflicts": conflicts,
                    "pull_result": pull_ok,
                    "action": "resolve conflicts before pushing; remote items are preserved",
                }
                emit(result, args.json)
                return 1

            remote_ids = set()
            if items_dir.is_dir():
                for f in sorted(items_dir.glob("*.json")):
                    try:
                        item = read_json(f)
                        cid = item.get("catalog_id")
                        if cid and cid not in {i.get("catalog_id") for i in local_items}:
                            remote_ids.add(cid)
                    except (json.JSONDecodeError, OSError):
                        pass

        head_before = _commit_head_if_repo(work_dir)
        try:
            remote.write_portable_repo(work_dir, local_items, payload_roots)
        except remote.RemoteError as exc:
            result = {"status": "write-failed", "error": str(exc), "code": exc.code}
            emit(result, args.json)
            return 1

        if not _git_has_changes(work_dir):
            sync_state = state.setdefault("sync", {})
            sync_state["last_push_check"] = utc_now()
            save_state(state_dir, state)
            result = {"status": "up-to-date", "item_count": len(local_items),
                      "pull_before_push": pull_ok}
            if pull_ok and pull_ok.get("status") == "pulled":
                remote_only = sorted(remote_ids) if pull_ok else []
                if remote_only:
                    result["remote_only_preserved"] = remote_only
            emit(result, args.json)
            return 0

        run_git(work_dir, "add", "-A")
        try:
            run_git(work_dir, "-c", "user.email=skillhub@local",
                    "-c", "user.name=skillhub",
                    "commit", "--quiet", "-m",
                    f"sync: {len(local_items)} items")
        except RuntimeError:
            pass

        try:
            push_result = remote.push_to_remote(validated_url, work_dir)
        except (RuntimeError, subprocess.CalledProcessError, remote.RemoteError) as exc:
            for item in local_items:
                cid = item["catalog_id"]
                if cid in overlays and isinstance(overlays[cid], dict):
                    overlays[cid]["sync_pending"] = True
                    overlays[cid]["sync_pending_reason"] = str(exc)[:200]
            state.setdefault("sync", {})["last_push_error"] = str(exc)[:200]
            save_state(state_dir, state)
            result = {"status": "saved-locally-sync-pending", "error": str(exc),
                      "sync_retry": "skillhub sync push"}
            emit(result, args.json)
            return 0

        for item in local_items:
            cid = item["catalog_id"]
            if cid in overlays and isinstance(overlays[cid], dict):
                overlays[cid]["synced"] = utc_now()
                overlays[cid].pop("sync_pending", None)
                overlays[cid].pop("sync_pending_reason", None)
        state.setdefault("sync", {})["last_push"] = utc_now()
        state.setdefault("sync", {}).pop("last_push_error", None)
        save_state(state_dir, state)

        result = {"status": "pushed", "item_count": len(local_items),
                  "push_result": push_result, "pull_before_push": pull_ok}
        if pull_ok and pull_ok.get("status") == "pulled":
            remote_only_final = sorted(remote_ids) if 'remote_ids' in dir() else []
            if remote_only_final:
                result["remote_only_preserved"] = remote_only_final
        emit(result, args.json)
        return 0

    if args.sync_action == "pull":
        if not remote_url:
            raise UserError("no remote configured; run 'skillhub sync onboard' first", code="no-remote")
        if args.freshness_ttl_minutes < 0:
            raise UserError("--freshness-ttl-minutes must be zero or greater", code="invalid-freshness-ttl")
        if args.if_stale:
            last_pull = state.get("sync", {}).get("last_pull") if isinstance(state.get("sync"), dict) else None
            if isinstance(last_pull, str):
                try:
                    age = dt.datetime.now(dt.timezone.utc) - parse_iso(last_pull)
                except ValueError:
                    age = None
                if age is not None and age <= dt.timedelta(minutes=args.freshness_ttl_minutes):
                    result = {
                        "status": "fresh-no-pull",
                        "code": "catalog-fresh",
                        "last_pull": last_pull,
                        "freshness_ttl_minutes": args.freshness_ttl_minutes,
                        "network": "not-used",
                    }
                    emit(result, args.json)
                    return 0
        validated_url = remote.validate_remote_url(remote_url)
        if validated_url is None:
            raise UserError("remote URL is invalid", code="invalid-remote-url")

        if not work_dir.is_dir() or not (work_dir / "library.json").is_file():
            clone_remote(validated_url, work_dir)
            if not (work_dir / "library.json").is_file():
                result = {"status": "clone-failed", "detail": "remote clone did not produce library.json"}
                emit(result, args.json)
                return 1
        else:
            try:
                remote.pull_from_remote(validated_url, work_dir)
            except (RuntimeError, remote.RemoteError, subprocess.CalledProcessError) as exc:
                result = {"status": "pull-failed", "error": str(exc),
                          "code": getattr(exc, "code", "pull-failed")}
                emit(result, args.json)
                return 1

        try:
            diag = remote.verify_portable_repo(work_dir)
        except remote.RemoteError as exc:
            result = {"status": "invalid-remote", "error": str(exc), "code": exc.code}
            emit(result, args.json)
            return 1

        if not diag["valid"]:
            result = {"status": "invalid-remote", "diagnostics": diag}
            emit(result, args.json)
            return 1

        overlay_root = state_dir / "overlays"
        try:
            imported = remote.import_from_portable(work_dir, overlay_root, state)
        except remote.RemoteError as exc:
            result = {"status": "import-failed", "error": str(exc), "code": exc.code}
            if exc.details:
                result["details"] = exc.details
            emit(result, args.json)
            return 1

        state.setdefault("sync", {})["last_pull"] = utc_now()
        save_state(state_dir, state)

        result = {"status": "pulled", "imported_count": len(imported), "imported": imported}
        emit(result, args.json)
        return 0

    if args.sync_action == "remote":
        if not args.remote_url:
            remote_info = state.get("remote", {})
            emit(remote_info if isinstance(remote_info, dict) else {"status": "no-remote"}, args.json)
            return 0

        validated = remote.validate_remote_url(str(args.remote_url).strip())
        if validated is None:
            raise UserError(
                "invalid remote URL; must be https://host/owner/repo.git or git@host:owner/repo.git (no credentials, query, fragment)",
                code="invalid-remote-url",
            )

        state["remote"] = {"type": "custom", "url": validated, "configured": utc_now()}
        save_state(state_dir, state)
        emit({"status": "remote-configured", "url": validated}, args.json)
        return 0

    raise UserError(f"unknown sync action: {args.sync_action}")


def _commit_head_if_repo(repo_dir: Path) -> str:
    try:
        return run_git(repo_dir, "rev-parse", "HEAD").strip()
    except RuntimeError:
        return ""


def _git_has_changes(repo_dir: Path) -> bool:
    try:
        status = run_git(repo_dir, "status", "--porcelain").strip()
        return bool(status)
    except RuntimeError:
        return True


def acquisition_drift(registry: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    """Detect untrusted source drift between acquisitions and the catalog.

    A fetched payload is bound to the repository, revision, checksum, and
    license metadata recorded at acquisition time. If the current catalog no
    longer matches, the change is reported for review; nothing is refetched
    or replaced automatically.
    """
    drift: dict[str, Any] = {}
    for catalog_id, acquisition in sorted(state.get("acquisitions", {}).items()):
        try:
            item = find_item(registry, catalog_id)
        except UserError:
            drift[catalog_id] = {"issues": ["acquired item no longer exists in the catalog"], "catalog": None}
            continue
        source = item.get("source", {}) if isinstance(item.get("source"), dict) else {}
        expected_checksum = item.get("verification", {}).get("checksum")
        license_info = item.get("archive", {}).get("license", {})
        issues: list[str] = []
        if acquisition.get("expected_checksum") and acquisition["expected_checksum"] != expected_checksum:
            issues.append("expected checksum changed")
        if acquisition.get("revision") and acquisition["revision"] != source.get("commit"):
            issues.append("source revision changed")
        if not acquisition.get("mirror") and acquisition.get("repository") and acquisition["repository"] != source.get("repository"):
            issues.append("source repository changed")
        recorded_license = acquisition.get("license")
        if isinstance(recorded_license, dict) and recorded_license != license_info:
            issues.append("license metadata changed")
        if issues:
            drift[catalog_id] = {
                "issues": issues,
                "catalog": {"commit": source.get("commit"), "checksum": expected_checksum},
                "recorded": {
                    "revision": acquisition.get("revision"),
                    "expected_checksum": acquisition.get("expected_checksum"),
                },
            }
    return drift


def cmd_update(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    state = load_state(state_dir)
    registry = load_registry(repo, state_dir)
    mismatches = []
    changes: dict[str, Any] = {}
    for catalog_id, lock in sorted(state.get("locks", {}).items()):
        try:
            item = find_item(registry, catalog_id)
        except UserError:
            mismatches.append(catalog_id)
            changes[catalog_id] = {"locked": lock, "catalog": None, "reason": "catalog item no longer exists"}
            continue
        identity = lock_identity(item)
        if identity != lock:
            mismatches.append(catalog_id)
            changes[catalog_id] = {"locked": lock, "catalog": identity, "reason": "identity changed; review before re-enabling"}
    drift = acquisition_drift(registry, state)
    clean = not mismatches and not drift
    result = {
        "status": "ready" if clean else "review-required",
        "network": "not-used",
        "lock_mismatches": mismatches,
        "changes": changes,
        "drift": drift,
        "drift_note": "drift is reported for review; nothing is refetched or replaced automatically" if drift else None,
    }
    emit(result, args.json)
    return 0 if clean else 1


def cmd_regenerate(args: argparse.Namespace, repo: Path, mode: str) -> int:
    if mode != "checkout":
        raise UserError("regenerate requires a Git checkout")
    command = [sys.executable, str(repo / "scripts" / "build_catalog.py")]
    if args.check:
        command.append("--check")
    proc = subprocess.run(command, cwd=repo, text=True, capture_output=True)
    if proc.stdout:
        print(proc.stdout, end="")
    if proc.stderr:
        print(proc.stderr, end="", file=sys.stderr)
    return proc.returncode


def cmd_validate(args: argparse.Namespace, repo: Path, mode: str) -> int:
    if mode != "checkout":
        raise UserError("validate requires a Git checkout; packaged installs rely on release CI")
    commands = [
        [sys.executable, str(repo / "scripts" / "build_catalog.py"), "--check"],
        [sys.executable, str(repo / "scripts" / "source_drift.py")],
        [sys.executable, str(repo / "scripts" / "validate_adapters.py")],
        [sys.executable, str(repo / "scripts" / "scan_public.py")],
    ]
    for command in commands:
        proc = subprocess.run(command, cwd=repo)
        if proc.returncode:
            return proc.returncode
    emit({"status": "ok"}, args.json)
    return 0


def _github_source(value: str, stack: ExitStack) -> tuple[Path, dict[str, str]] | None:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"github.com", "www.github.com"}:
        return None
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise UserError("GitHub source URL must not contain credentials, a query, or a fragment")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) < 2:
        raise UserError("GitHub source URL must identify an owner and repository")
    owner, repository_name = parts[0], parts[1].removesuffix(".git")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repository_name):
        raise UserError("GitHub owner or repository name is invalid")
    revision = None
    subdirectory = ""
    if len(parts) > 2:
        if len(parts) < 4 or parts[2] != "tree":
            raise UserError("GitHub URL must be a repository root or /tree/<revision>/<skill-path>")
        revision = parts[3]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", revision) or revision.startswith("-") or ".." in revision:
            raise UserError("GitHub revision must be a safe non-option-like branch, tag, or commit", code="bad-revision")
        subdirectory = "/".join(parts[4:]) if len(parts) > 4 else ""
        if subdirectory in {"."}:
            subdirectory = ""
        if subdirectory and (not re.fullmatch(r"[A-Za-z0-9._/-]+", subdirectory) or any(part in {"", ".", ".."} for part in subdirectory.split("/"))):
            raise UserError("GitHub skill path has unsupported characters", code="bad-subdirectory")
    repository = f"https://github.com/{owner}/{repository_name}.git"
    temporary = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="skillhub-add-")))
    checkout = temporary / "source"
    env = dict(os.environ)
    env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull})
    clone = subprocess.run(
        ["git", "clone", "--filter=blob:none", "--depth", "1", repository, str(checkout)],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=120,
        env=env,
    )
    if clone.returncode:
        raise UserError(f"GitHub clone failed: {clone.stderr.strip()[:400]}", code="git-clone-failed")
    if revision:
        fetch = subprocess.run(
            ["git", "-C", str(checkout), "fetch", "--depth", "1", "origin", revision],
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=120,
            env=env,
        )
        if fetch.returncode:
            raise UserError(f"GitHub revision fetch failed: {fetch.stderr.strip()[:400]}", code="git-fetch-failed")
        subprocess.run(["git", "-C", str(checkout), "checkout", "--detach", "FETCH_HEAD"], check=True, env=env, capture_output=True)
    commit = run_git(checkout, "rev-parse", "HEAD").strip()
    selected = (checkout / subdirectory).resolve() if subdirectory else checkout.resolve()
    if not path_within(selected, checkout) or not selected.is_dir():
        raise UserError("GitHub skill path is missing or leaves the repository")
    return selected, {"repository": repository.removesuffix(".git"), "commit": commit, "path": subdirectory}


def _personal_routing(registry: dict[str, Any], name: str, description: str, args: argparse.Namespace) -> dict[str, Any]:
    taxonomy = registry.get("routing_taxonomy", {})
    signals = routing.task_routing_signals(registry, f"{name} {description}")
    domains = list(dict.fromkeys(args.domain or signals.get("domains") or ["general"]))
    actions = list(dict.fromkeys(args.action or signals.get("actions") or ["read"]))
    invalid_domains = sorted(set(domains) - set(taxonomy.get("domains", {})))
    invalid_actions = sorted(set(actions) - set(taxonomy.get("actions", {})))
    if invalid_domains:
        raise UserError("unknown routing domain(s): " + ", ".join(invalid_domains))
    if invalid_actions:
        raise UserError("unknown routing action(s): " + ", ".join(invalid_actions))
    formats = list(dict.fromkeys(signals.get("formats") or []))
    domain_groups = taxonomy.get("domain_groups", {})
    paths = []
    for domain in domains:
        group = next((key for key, row in domain_groups.items() if domain in row.get("domains", [])), "general")
        group_row = domain_groups.get(group, {})
        domain_row = taxonomy.get("domains", {}).get(domain, {})
        paths.append({
            "group": group,
            "group_label_ko": group_row.get("label_ko", group),
            "group_aliases_ko": group_row.get("aliases_ko", []),
            "domain": domain,
            "domain_label_ko": domain_row.get("label_ko", domain),
            "path_ko": f"{group_row.get('label_ko', group)} > {domain_row.get('label_ko', domain)}",
            "primary": not paths,
        })
    labels = [path["group_label_ko"] for path in paths[:1]] + [path["domain_label_ko"] for path in paths]
    labels += [taxonomy.get("actions", {}).get(action, {}).get("label_ko", action) for action in actions]
    tags_ko = list(dict.fromkeys([*(args.tag_ko or []), *labels, "개인 등록 스킬"]))
    primary = paths[0]
    return {
        "schema_version": 1,
        "description_ko": args.description_ko or (description if re.search(r"[가-힣]", description) else f"{name} 작업을 수행하는 개인 등록 스킬입니다. {description}"),
        "description_source": "user-registration",
        "tags_ko": tags_ko,
        "actions": actions,
        "behavior_classes": ["instruction-guidance"] if args.risk == "instructions-only" else ["code-execution"],
        "domains": domains,
        "input_formats": formats,
        "primary_path": [primary["group"], primary["domain"]],
        "library_paths": paths,
        "taxonomy": "personal-registration-v1",
    }


def _personal_item(
    registry: dict[str, Any], source: Path, provenance: dict[str, str], args: argparse.Namespace, *, single: bool,
    receipt: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    skill_file = source / "SKILL.md"
    if not skill_file.is_file():
        raise UserError(f"source must contain SKILL.md: {source}")
    frontmatter = parse_frontmatter(skill_file.read_text(encoding="utf-8"))
    name = (args.name if single else None) or frontmatter.get("name")
    if not name or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
        raise UserError(f"skill name must be lowercase kebab case: {source}")
    description = str(frontmatter.get("description") or f"Personal skill {name}").strip()
    if contains_privacy_token(name) or contains_privacy_token(description):
        raise UserError("source metadata rejected by the public privacy policy")
    findings = acquire.scan_payload(source)
    if findings:
        raise UserError(f"source rejected by safety policy: {findings[0]}", code="unsafe-payload")
    executable_suffixes = {".py", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".sh", ".bash", ".bat", ".cmd", ".ps1", ".exe", ".dll", ".jar"}
    inferred_risk = "scripts" if any(path.is_file() and path.suffix.casefold() in executable_suffixes for path in source.rglob("*")) else "instructions-only"
    effective_risk = args.risk or inferred_risk
    routing_args = argparse.Namespace(**vars(args))
    routing_args.risk = effective_risk
    for file in source.rglob("*"):
        if file.is_symlink() or is_reparse_point(file):
            raise UserError("personal overlay import refuses symlinks and junctions")
        if file.is_file():
            try:
                text = file.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                text = ""
            if contains_privacy_token(text):
                raise UserError("source content rejected by the public privacy policy")
    checksum = directory_checksum(source)
    catalog_id = f"overlay.{name}"
    source_path = provenance.get("path", "")
    activation_policy = "on-demand" if effective_risk == "instructions-only" else "manual"
    item = {
        "catalog_id": catalog_id,
        "kind": "skill",
        "name": name,
        "runtime_name": name,
        "description": description,
        "description_ko": _personal_routing(registry, name, description, routing_args)["description_ko"],
        "source_id": "personal-overlay",
        "source": {**provenance, "path": source_path, "status": "user-registered", "publisher": "user-selected"},
        "archive": {"status": "archived", "path": None, "blocker": None, "license": {"declared": frontmatter.get("license", "user-supplied"), "redistribution": "personal-local-use-only"}},
        "acquisition": {"status": "available", "method": "personal-overlay", "expected_checksum": checksum, "reason": "already copied into the user-owned local overlay"},
        "trust": {"tier": "user-selected", "publisher_identity": "not-verified", "security_review": "static-scan-only", "compatibility_verification": "not-verified"},
        "verification": {"status": "user-registered-and-checksummed", "source_commit": provenance.get("commit"), "checksum": checksum},
        "version": "personal",
        "revision": provenance.get("commit") or checksum,
        "compatibility": ["codex", "claude-code", "opencode", "paseo", "generic-agent"],
        "oses": ["any"],
        "dependencies": [],
        "risk": effective_risk,
        "activation_policy": activation_policy,
        "update_policy": "pinned",
        "aliases": [],
        "tags": [name, "personal-overlay"],
        "routing": _personal_routing(registry, name, description, routing_args),
        "added_at": utc_now(),
        "adapters": {},
    }
    bind_item_to_spyware_receipt(receipt, item)
    item["security_receipt"] = receipt
    return name, item


def _personal_provenance(provenance: dict[str, str], source: Path, root: Path) -> dict[str, str]:
    """Return provenance for one discovered skill without duplicating a URL subtree."""
    relative = "" if source == root else source.relative_to(root).as_posix()
    item_provenance = dict(provenance)
    item_provenance["path"] = "/".join(part for part in (provenance.get("path", ""), relative) if part)
    return item_provenance


def cmd_add(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    state = load_state(state_dir)
    registry = load_registry(repo, state_dir)
    overlay_root = Path(args.overlay_dir).expanduser().resolve() if args.overlay_dir else (state_dir / "overlays").resolve()
    with ExitStack() as stack:
        scan_workspace = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="skillhub-add-scan-")))
        receipt, pinned_source, scanned_root = run_spyware_receipt_gate(args, scan_workspace)
        if receipt["source"]["kind"] == "local":
            root = scanned_root
            provenance = {"repository": "local-user-source", "commit": "", "path": ""}
        else:
            github_source = _github_source(pinned_source, stack)
            if github_source is None:
                raise UserError("spyware scanner returned an invalid pinned GitHub source", code="spyware-check-invalid")
            root, provenance = github_source
        if not root.is_dir() or is_reparse_point(root):
            raise UserError("source must be a real directory or supported GitHub URL")
        skill_dirs = [root] if (root / "SKILL.md").is_file() else sorted(
            {path.parent for path in root.rglob("SKILL.md") if ".git" not in path.relative_to(root).parts},
            key=lambda path: path.as_posix(),
        )
        if not skill_dirs:
            raise UserError("source contains no SKILL.md")
        if len(skill_dirs) > 1 and (args.name or args.description_ko):
            raise UserError("--name and --description-ko require a URL or directory containing exactly one skill")
        prepared = []
        known_ids = {item.get("catalog_id") for item in registry.get("skills", [])}
        for source in skill_dirs:
            item_provenance = _personal_provenance(provenance, source, root)
            name, item = _personal_item(
                registry,
                source,
                item_provenance,
                args,
                single=len(skill_dirs) == 1,
                receipt=receipt,
            )
            if item["catalog_id"] in known_ids:
                raise UserError(f"personal skill already exists: {item['catalog_id']}")
            destination = overlay_root / safe_name(name)
            if path_within(destination, source) or path_within(source, destination):
                raise UserError("overlay destination must be separate from the source", code="overlay-boundary")
            if destination.exists() or destination.is_symlink():
                raise UserError(f"overlay destination exists: {destination}")
            prepared.append((source, destination, item))
            known_ids.add(item["catalog_id"])
        created: list[Path] = []
        try:
            for source, destination, item in prepared:
                checksum = copy_tree_checked(source, destination)
                if checksum != item["verification"]["checksum"]:
                    raise UserError("copied overlay checksum changed unexpectedly")
                created.append(destination)
                state.setdefault("overlays", {})[item["catalog_id"]] = {
                    "catalog_id": item["catalog_id"], "name": item["name"], "path": str(destination),
                    "root": str(overlay_root), "checksum": checksum, "added": utc_now(),
                    "activation": item["activation_policy"], "item": item,
                }
            save_state(state_dir, state)
        except Exception:
            for destination in reversed(created):
                if destination.is_dir() and path_within(destination, overlay_root):
                    shutil.rmtree(destination)
            raise
    rows = [{"catalog_id": item["catalog_id"], "path": str(destination), "checksum": item["verification"]["checksum"], "risk": item["risk"], "routing": item["routing"]} for _, destination, item in prepared]
    result: dict[str, Any] = {"status": "added-to-personal-library", "count": len(rows), "items": rows}

    if getattr(args, "local_only", False):
        result["sync"] = "skipped-local-only"
        emit(result, args.json)
        return 0

    remote_config = state.get("remote", {})
    remote_url = remote_config.get("url") if isinstance(remote_config, dict) else None

    if not remote_url:
        work_dir = state_dir / "remote"
        onboard_result = onboard_github(work_dir)
        if onboard_result.get("status") in ("ready", "created"):
            remote_url = onboard_result["remote"]
            state["remote"] = {"type": "github", "url": remote_url,
                               "login": onboard_result.get("login", ""),
                               "onboarded": utc_now()}
            save_state(state_dir, state)
        else:
            result["sync"] = "saved-locally-sync-pending"
            result["sync_detail"] = "GitHub onboarding failed; skill saved locally"
            result["onboarding_error"] = {
                "code": onboard_result.get("code", "onboard-failed"),
                "command": onboard_result.get("command"),
                "detail": onboard_result.get("stderr") or onboard_result.get("detail"),
            }
            save_state(state_dir, state)
            emit(result, args.json)
            return 0

    work_dir = state_dir / "remote"
    if not work_dir.is_dir() or not (work_dir / "library.json").is_file():
        validated = remote.validate_remote_url(remote_url)
        if validated:
            from .github_onboarding import clone_remote as _clone
            _clone(validated, work_dir)
        if not (work_dir / "library.json").is_file():
            result["sync"] = "saved-locally-sync-pending"
            result["sync_detail"] = "failed to set up local portable repo"
            save_state(state_dir, state)
            emit(result, args.json)
            return 0

    validated_url = remote.validate_remote_url(remote_url)
    if validated_url is None:
        result["sync"] = "saved-locally-sync-pending"
        result["sync_detail"] = f"invalid remote URL: {remote_url}"
        save_state(state_dir, state)
        emit(result, args.json)
        return 0

    try:
        pull_result = remote.pull_from_remote(validated_url, work_dir)
    except (RuntimeError, subprocess.CalledProcessError, remote.RemoteError) as exc:
        result["sync"] = "saved-locally-sync-pending"
        result["sync_detail"] = f"pull before push failed: {exc}"
        save_state(state_dir, state)
        emit(result, args.json)
        return 0

    portable_items = []
    payload_roots: dict[str, Path] = {}
    for catalog_id, record in state.get("overlays", {}).items():
        if not isinstance(record, dict):
            continue
        item_data = record.get("item") if isinstance(record.get("item"), dict) else None
        if not item_data:
            continue
        portable_items.append(remote.make_portable_item(item_data))
        overlay_path = Path(str(record.get("path", "")))
        if overlay_path.is_dir():
            payload_roots[catalog_id] = overlay_path

    remote_items: list[dict[str, Any]] = []
    items_dir = work_dir / "catalog" / "items"
    if items_dir.is_dir():
        for catalog_file in sorted(items_dir.glob("*.json")):
            try:
                remote_items.append(read_json(catalog_file))
            except (json.JSONDecodeError, OSError) as exc:
                result["sync"] = "saved-locally-sync-pending"
                result["sync_detail"] = f"cannot inspect remote catalog: {exc}"
                save_state(state_dir, state)
                emit(result, args.json)
                return 0
    conflicts = remote.detect_conflicts(portable_items, remote_items)
    blocking = [c for c in conflicts if c.get("type") == "checksum-conflict"]
    if blocking:
        result["sync"] = "review-required"
        result["sync_detail"] = "remote catalog contains the same ID with a different checksum"
        result["conflicts"] = blocking
        save_state(state_dir, state)
        emit(result, args.json)
        return 0

    try:
        remote.write_portable_repo(work_dir, portable_items, payload_roots)
    except remote.RemoteError as exc:
        result["sync"] = "saved-locally-sync-pending"
        result["sync_detail"] = f"write failed: {exc}"
        save_state(state_dir, state)
        emit(result, args.json)
        return 0

    if not _git_has_changes(work_dir):
        for row in rows:
            cid = row["catalog_id"]
            if cid in state["overlays"] and isinstance(state["overlays"][cid], dict):
                state["overlays"][cid]["synced"] = utc_now()
        state.setdefault("sync", {})["last_push"] = utc_now()
        save_state(state_dir, state)
        result["sync"] = "up-to-date"
        emit(result, args.json)
        return 0

    run_git(work_dir, "add", "-A")
    try:
        run_git(work_dir, "-c", "user.email=skillhub@local", "-c", "user.name=skillhub",
                "commit", "--quiet", "-m", f"add: {', '.join(row['catalog_id'] for row in rows)}")
    except RuntimeError:
        pass

    try:
        push_result = remote.push_to_remote(validated_url, work_dir)
        for row in rows:
            cid = row["catalog_id"]
            if cid in state["overlays"] and isinstance(state["overlays"][cid], dict):
                state["overlays"][cid]["synced"] = utc_now()
                state["overlays"][cid].pop("sync_pending", None)
                state["overlays"][cid].pop("sync_pending_reason", None)
        state.setdefault("sync", {})["last_push"] = utc_now()
        state.setdefault("sync", {}).pop("last_push_error", None)
        save_state(state_dir, state)
        result["sync"] = "pushed"
        result["push_result"] = push_result
    except (RuntimeError, subprocess.CalledProcessError, remote.RemoteError) as exc:
        for row in rows:
            cid = row["catalog_id"]
            if cid in state["overlays"] and isinstance(state["overlays"][cid], dict):
                state["overlays"][cid]["sync_pending"] = True
                state["overlays"][cid]["sync_pending_reason"] = str(exc)[:200]
        state.setdefault("sync", {})["last_push_error"] = str(exc)[:200]
        save_state(state_dir, state)
        result["sync"] = "saved-locally-sync-pending"
        result["sync_detail"] = f"push failed: {exc}"
        result["sync_retry"] = "skillhub sync push"

    emit(result, args.json)
    return 0


def _feedback_export_row(record: dict[str, Any]) -> dict[str, Any]:
    request_key = " ".join(str(record.get("request_key") or record.get("request") or "").casefold().split())
    return {
        "feedback_id": record.get("feedback_id"),
        "kind": record.get("kind"),
        "catalog_id": record.get("catalog_id"),
        "request_sha256": hashlib.sha256(request_key.encode("utf-8")).hexdigest(),
        "request_token_count": len(record.get("request_tokens", [])),
        "created": record.get("created"),
    }


def cmd_feedback(args: argparse.Namespace, repo: Path, state_dir: Path) -> int:
    state = load_state(state_dir)
    feedback = state.setdefault("feedback", {})
    if not isinstance(feedback, dict):
        raise UserError("feedback state is invalid", code="feedback-state")
    command = getattr(args, "feedback_command", None)
    if command in {"record", "add"}:
        preferred = getattr(args, "preferred", None)
        rejected = getattr(args, "rejected", None)
        if bool(preferred) == bool(rejected):
            raise UserError("record exactly one of --preferred or --rejected", code="feedback-input")
        catalog_id = str(preferred or rejected)
        registry = load_registry(repo, state_dir)
        if not any(str(row.get("catalog_id")) == catalog_id for row in registry.get("skills", [])):
            raise UserError(f"feedback catalog item not found: {catalog_id}", code="feedback-target")
        frame = matching.analyze_request(args.request)
        feedback_id = f"feedback.{uuid.uuid4().hex}"
        record = {
            "feedback_id": feedback_id,
            "kind": "preferred" if preferred else "rejected",
            "catalog_id": catalog_id,
            "request": frame["raw_request"],
            "request_key": frame["raw_request"].casefold(),
            "request_tokens": sorted(set(matching.tokenize(frame["raw_request"]))),
            "created": utc_now(),
            "local_only": True,
        }
        feedback[feedback_id] = record
        save_state(state_dir, state)
        emit({"status": "feedback-recorded", **record}, args.json)
        return 0
    if command == "list":
        rows = [feedback[key] for key in sorted(feedback) if isinstance(feedback[key], dict)]
        emit({"status": "feedback-list", "count": len(rows), "items": rows}, args.json)
        return 0
    if command == "remove":
        if args.feedback_id not in feedback:
            raise UserError(f"feedback rule not found: {args.feedback_id}", code="feedback-not-found")
        removed = feedback.pop(args.feedback_id)
        save_state(state_dir, state)
        emit({"status": "feedback-removed", "feedback_id": args.feedback_id, "removed": removed}, args.json)
        return 0
    if command == "export-redacted":
        rows = [_feedback_export_row(feedback[key]) for key in sorted(feedback) if isinstance(feedback[key], dict)]
        emit({"status": "feedback-export-redacted", "count": len(rows), "items": rows, "telemetry": "none"}, args.json)
        return 0
    raise UserError("feedback requires record, list, remove, or export-redacted", code="feedback-input")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Public skillNload manager")
    parser.add_argument("--repo", default=None, help="library checkout or catalog root (default: auto)")
    parser.add_argument("--home", default=None, help="disposable home used for target roots")
    parser.add_argument("--state-dir", default=None, help="state/snapshot directory")
    parser.add_argument("--version", action="version", version=f"skillhub {VERSION}")
    sub = parser.add_subparsers(dest="command", required=True)

    def common(command: str, **kwargs: Any) -> argparse.ArgumentParser:
        child = sub.add_parser(command, **kwargs)
        child.add_argument("--json", action="store_true")
        return child

    search = common("search")
    search.add_argument("query")
    search.add_argument("--client", choices=("codex", "claude-code", "opencode", "paseo", "generic-agent"))
    search.add_argument("--os", choices=("windows", "macos", "linux"))
    search.add_argument("--available-only", action="store_true")
    search.add_argument("--explain", action="store_true")

    tree = common("tree")
    tree.add_argument("--group", default=None, help="top-level routing group id")
    tree.add_argument("--domain", default=None, help="routing domain id")
    tree.add_argument("--skills", action="store_true", help="include skill leaves")

    route = common("route")
    route.add_argument("task", help="natural-language task description")
    route.add_argument("--target", required=True, help="one canonical target: codex,claude,opencode,paseo,generic")
    route.add_argument("--client", choices=("codex", "claude-code", "opencode", "paseo", "generic-agent"), default=None)
    route.add_argument("--os", choices=("windows", "macos", "linux"), default=None)
    route.add_argument("--allow-risk", choices=tuple(RISK_ORDER), default=None, help="risk allowance used to separate candidates from risk-gated rows")
    route.add_argument("--limit", type=int, default=routing.DEFAULT_LIMIT)

    match = common("match")
    match.add_argument("request", help="unstructured natural-language request")
    match.add_argument("--target", required=True, help="one canonical target: codex,claude,opencode,paseo,generic")
    match.add_argument("--client", choices=("codex", "claude-code", "opencode", "paseo", "generic-agent"), default=None)
    match.add_argument("--os", choices=("windows", "macos", "linux"), default=None)
    match.add_argument("--max-risk", choices=tuple(RISK_ORDER), default=None)
    match.add_argument("--trust-tier", choices=tuple(sorted(matching.ALLOWED_TRUST_TIERS)), default=None)
    match.add_argument("--limit", type=int, default=3)
    match.add_argument("--agent-packet", action="store_true", help="include bounded inert skill evidence for host-agent adjudication")
    match.add_argument("--completed-action", action="append", choices=tuple(matching.ACTION_TERMS), default=[])
    match.add_argument("--satisfied-anchor", action="append", default=[])

    inspect = common("inspect")
    inspect.add_argument("item")

    for name in ("manifest", "scan", "trust"):
        child = common(name)
        child.add_argument("item")

    init = common("init")
    init.add_argument("--target", default=None, help="comma-separated targets: codex,claude,opencode,paseo,generic (default: all)")
    init.add_argument("--profile", choices=("default", "windows", "macos", "linux"), default="default")

    fetch = common("fetch")
    fetch.add_argument("item")
    fetch.add_argument("--from-repo", default=None, help="local mirror or alternate remote for the pinned upstream repository")
    fetch.add_argument("--refresh", action="store_true")
    fetch.add_argument("--allow-risk", choices=tuple(RISK_ORDER), default=None)
    fetch.add_argument("--confirm-destructive", action="store_true")
    fetch.add_argument("--yes", "--approve", dest="approved", action="store_true", help="approve after reviewing inspect output")

    verify = common("verify")
    verify.add_argument("item")

    install = common("install")
    install.add_argument("item")
    install.add_argument("--target", required=True, help="comma-separated targets: codex,claude,opencode,paseo,generic")
    install.add_argument("--allow-risk", choices=tuple(RISK_ORDER), default=None)
    install.add_argument("--confirm-destructive", action="store_true")
    install.add_argument("--yes", "--approve", dest="approved", action="store_true", help="approve after reviewing inspect output")
    install.add_argument("--from-repo", default=None)
    install.add_argument("--refresh", action="store_true")

    use = common("use")
    use.add_argument("item")
    use.add_argument("--once", action="store_true")
    use.add_argument("--target", required=True)
    use.add_argument("--allow-risk", choices=tuple(RISK_ORDER), default=None)
    use.add_argument("--confirm-destructive", action="store_true")
    use.add_argument("--ttl-minutes", type=int, default=DEFAULT_ONE_SHOT_TTL_MINUTES)
    use.add_argument("--yes", "--approve", dest="approved", action="store_true", help="approve after reviewing inspect output")
    use.add_argument("--from-repo", default=None)

    listcmd = common("list")
    listcmd.add_argument("--installed", action="store_true", help="show installed/cached items (default)")
    listcmd.add_argument("--all", action="store_true", help="show every catalog row with local state")

    uninstall = common("uninstall")
    uninstall.add_argument("item")

    for name in ("enable", "disable"):
        child = common(name)
        child.add_argument("item")
        child.add_argument("--target", default="all")
        if name == "enable":
            child.add_argument("--allow-risk", choices=tuple(RISK_ORDER), default=None)
            child.add_argument("--confirm-destructive", action="store_true")
            child.add_argument("--yes", "--approve", dest="approved", action="store_true", help="approve after reviewing inspect output")

    bootstrap = common("bootstrap")
    bootstrap.add_argument("--profile", choices=("default", "windows", "macos", "linux"), default="default")

    for name in ("status", "doctor"):
        common(name)

    for name in ("lock", "unlock", "snapshot"):
        child = common(name)
        child.add_argument("item")

    rollback = common("rollback")
    rollback.add_argument("item")
    rollback.add_argument("--target", default="all")

    overlay_update = common("overlay-update")
    overlay_update.add_argument("source", help="local skill directory or GitHub skill URL")
    overlay_update.add_argument("--item", help="existing overlay catalog id (defaults to overlay.<name>)")
    overlay_update.add_argument("--name")
    overlay_update.add_argument("--overlay-dir", help=argparse.SUPPRESS)
    overlay_update.add_argument("--description-ko")
    overlay_update.add_argument("--tag-ko", action="append", default=[])
    overlay_update.add_argument("--domain", action="append", default=[])
    overlay_update.add_argument("--action", action="append", default=[])
    overlay_update.add_argument("--risk", choices=tuple(RISK_ORDER), default=None)
    overlay_update.add_argument("--dry-run", action="store_true", help="show the validated file and metadata diff")
    overlay_update.add_argument("--yes", action="store_true", help="approve the preview and atomically replace the overlay")
    overlay_update.add_argument("--expected-state", help="state fingerprint returned by --dry-run")
    overlay_update.add_argument("--approve-medium", action="store_true", help="approve Medium spyware findings after reviewing the receipt")

    overlay_rollback = common("overlay-rollback")
    overlay_rollback.add_argument("item")
    overlay_rollback.add_argument("--dry-run", action="store_true")
    overlay_rollback.add_argument("--yes", action="store_true", help="approve restoring the latest immutable overlay snapshot")
    overlay_rollback.add_argument("--expected-state", help="state fingerprint returned by --dry-run")

    feedback = common("feedback")
    feedback_sub = feedback.add_subparsers(dest="feedback_command", required=True)
    feedback_record = feedback_sub.add_parser("record", aliases=["add"])
    feedback_record.add_argument("request")
    feedback_record.add_argument("--preferred", "--prefer", dest="preferred")
    feedback_record.add_argument("--rejected", "--reject", dest="rejected")
    feedback_record.add_argument("--json", action="store_true")
    feedback_list = feedback_sub.add_parser("list")
    feedback_list.add_argument("--json", action="store_true")
    feedback_remove = feedback_sub.add_parser("remove")
    feedback_remove.add_argument("feedback_id")
    feedback_remove.add_argument("--json", action="store_true")
    feedback_export = feedback_sub.add_parser("export-redacted")
    feedback_export.add_argument("--json", action="store_true")

    for name in ("sync", "update"):
        common(name)

    sync_parser = sub.choices["sync"]
    sync_parser.add_argument("sync_action", nargs="?", default="status",
                             choices=["status", "onboard", "push", "pull", "remote"],
                             help="sync action: status, onboard, push, pull, remote")
    sync_parser.add_argument("--remote-url", default=None, help="explicit custom remote URL (for 'remote' action)")
    sync_parser.add_argument("--no-pull", action="store_true", help="skip pull-before-push (for 'push' action)")
    sync_parser.add_argument("--if-stale", action="store_true", help="pull only when the last successful pull is older than the freshness TTL")
    sync_parser.add_argument("--freshness-ttl-minutes", type=int, default=60, help="freshness TTL for --if-stale (default: 60)")

    gc = common("gc")
    gc.add_argument("--max-age-days", type=int, default=DEFAULT_CACHE_MAX_AGE_DAYS)
    gc.add_argument("--confirm", action="store_true", help="apply eligible removals; without this flag GC is read-only")

    regenerate = common("regenerate")
    regenerate.add_argument("--check", action="store_true")
    common("validate")

    add = common("add", aliases=["import"])
    add.add_argument("source", nargs="?", help="local skill directory or GitHub repository/tree URL")
    add.add_argument("--source", dest="source_option", help=argparse.SUPPRESS)
    add.add_argument("--name")
    add.add_argument("--overlay-dir")
    add.add_argument("--local-only", action="store_true", help="save locally without GitHub onboarding or sync")
    add.add_argument("--description-ko", help="one natural Korean sentence describing the skill's useful outcome")
    add.add_argument("--tag-ko", action="append", default=[], help="repeatable Korean routing tag")
    add.add_argument("--domain", action="append", default=[], help="repeatable controlled routing domain")
    add.add_argument("--action", action="append", default=[], help="repeatable controlled action")
    add.add_argument("--risk", choices=tuple(RISK_ORDER), default=None, help="reviewed runtime risk; inferred conservatively when omitted")
    add.add_argument(
        "--approve-medium",
        action="store_true",
        help="explicitly approve Medium spyware findings after reviewing the receipt",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8")
    args = build_parser().parse_args(argv)
    try:
        repo, mode = catalog_root(args.repo)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    home = Path(args.home).expanduser().resolve() if args.home else Path.home()
    state_dir = Path(args.state_dir).expanduser().resolve() if args.state_dir else state_default_dir().resolve()
    try:
        recover_overlay_transactions(state_dir)
        if args.command == "search":
            return cmd_search(args, repo, state_dir)
        if args.command == "tree":
            return cmd_tree(args, repo, state_dir)
        if args.command == "route":
            return cmd_route(args, repo, state_dir)
        if args.command == "match":
            return cmd_match(args, repo, state_dir)
        if args.command == "inspect":
            return cmd_inspect(args, repo, mode, state_dir)
        if args.command == "manifest":
            return cmd_manifest(args, repo, mode, state_dir)
        if args.command == "scan":
            return cmd_scan(args, repo, mode, state_dir)
        if args.command == "trust":
            return cmd_trust(args, repo, mode, state_dir)
        if args.command == "init":
            return cmd_init(args, repo, mode, home, state_dir)
        if args.command == "fetch":
            return cmd_fetch(args, repo, mode, state_dir)
        if args.command == "verify":
            return cmd_verify(args, repo, mode, home, state_dir)
        if args.command == "install":
            return cmd_install(args, repo, mode, home, state_dir)
        if args.command == "use":
            return cmd_use(args, repo, mode, home, state_dir)
        if args.command == "list":
            return cmd_list(args, repo, state_dir)
        if args.command == "uninstall":
            return cmd_uninstall(args, repo, home, state_dir)
        if args.command == "enable":
            return cmd_enable(args, repo, mode, home, state_dir)
        if args.command == "disable":
            return cmd_disable(args, repo, home, state_dir)
        if args.command == "bootstrap":
            return cmd_bootstrap(args, repo, mode, home, state_dir)
        if args.command == "status":
            return cmd_status(args, repo, home, state_dir)
        if args.command == "doctor":
            return cmd_doctor(args, repo, mode, home, state_dir)
        if args.command == "lock":
            return cmd_lock(args, repo, state_dir)
        if args.command == "unlock":
            return cmd_lock(args, repo, state_dir, unlock=True)
        if args.command == "snapshot":
            return cmd_snapshot(args, repo, mode, state_dir)
        if args.command == "rollback":
            return cmd_rollback(args, repo, home, state_dir)
        if args.command == "overlay-update":
            return cmd_overlay_update(args, repo, state_dir)
        if args.command == "overlay-rollback":
            return cmd_overlay_rollback(args, repo, state_dir)
        if args.command == "feedback":
            return cmd_feedback(args, repo, state_dir)
        if args.command == "sync":
            return cmd_sync(args, repo, mode, state_dir)
        if args.command == "update":
            return cmd_update(args, repo, state_dir)
        if args.command == "gc":
            return cmd_gc(args, repo, state_dir, home)
        if args.command == "regenerate":
            return cmd_regenerate(args, repo, mode)
        if args.command == "validate":
            return cmd_validate(args, repo, mode)
        if args.command in {"add", "import"}:
            args.source = args.source or args.source_option
            if not args.source:
                raise UserError("add requires a local skill directory or GitHub URL")
            return cmd_add(args, repo, state_dir)
    except (UserError, acquire.AcquisitionError, ValueError, RuntimeError, OSError) as exc:
        if getattr(args, "json", False):
            error = {"status": "error", "code": getattr(exc, "code", "error"), "error": str(exc)}
            details = getattr(exc, "details", None)
            if details:
                error.update(details)
            print(json_dump(error), end="", file=sys.stderr)
        else:
            print(f"error: {exc}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
