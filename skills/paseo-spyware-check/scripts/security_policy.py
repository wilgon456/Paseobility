"""Versioned local security/publication policy contract.

This module is deliberately small and dependency-free.  It describes a
decision for one exact artifact; it is not a publisher signature, a global
trust store, or a server-side policy service.  The same file is copied into
the isolated public manager and the pre-bootstrap scanner.
"""
from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
import os
import re
from typing import Any, Iterable


POLICY_SCHEMA_VERSION = 1
POLICY_NAME = "skill-security-policy"
POLICY_VERSION = 1
MALWARE_VERDICTS = ("clean", "suspicious", "blocked")
CAPABILITIES = ("network", "credentials", "subprocess", "filesystem", "external-write")
VISIBILITIES = ("private", "unlisted", "public")
PUBLICATION_STATUSES = ("quarantined", "review-required", "published", "revoked")
EXECUTION_POLICIES = ("instructions-only", "confirm", "sandbox-only", "denied")
APPROVAL_STATUSES = ("not-required", "required", "approved", "not-permitted")
CHECKSUM_RE = re.compile(r"^[0-9a-f]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
SAFE_USER_ID_RE = re.compile(r"^[A-Za-z0-9_.:@/-]{1,128}$")


class PolicyError(ValueError):
    """Raised when a policy is incomplete, inconsistent, or misbound."""


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def policy_digest(policy: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(policy).encode("utf-8")).hexdigest()


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def _require_enum(value: Any, allowed: Iterable[str], field: str) -> str:
    if value not in allowed:
        raise PolicyError(f"invalid {field}: {value!r}")
    return str(value)


def _normalize_path(value: Any) -> str:
    return str(value or "").strip().strip("/")


def artifact_binding(source: dict[str, Any], checksum: str) -> dict[str, Any]:
    """Return the source/checksum identity that is safe to carry in state.

    Local absolute paths are intentionally discarded.  GitHub artifacts retain
    the exact commit, tree, and selected subtree path.
    """
    if not isinstance(source, dict):
        raise PolicyError("artifact source must be an object")
    kind = _require_enum(source.get("kind"), ("github", "local"), "artifact source kind")
    if not isinstance(checksum, str) or not CHECKSUM_RE.fullmatch(checksum):
        raise PolicyError("artifact checksum must be a lowercase SHA-256")
    if kind == "github":
        commit = str(source.get("commit") or "")
        if not COMMIT_RE.fullmatch(commit):
            raise PolicyError("GitHub artifact must be bound to an exact commit")
        tree = source.get("tree")
        if tree is not None and not COMMIT_RE.fullmatch(str(tree)):
            raise PolicyError("GitHub artifact tree must be a 40-character SHA")
        repository = str(source.get("repository") or "")
        if not repository.startswith("https://github.com/"):
            raise PolicyError("GitHub artifact repository must use the canonical HTTPS origin")
        if any(marker in repository for marker in ("@", "?", "#")):
            raise PolicyError("GitHub artifact repository contains credentials or URL modifiers")
        path = _normalize_path(source.get("path"))
        if any(part in {".", ".."} for part in path.split("/")):
            raise PolicyError("GitHub artifact path contains traversal components")
    else:
        commit = None
        tree = None
        repository = "local-user-source"
        path = ""
    return {
        "source_kind": kind,
        "source_repository": repository,
        "source_commit": commit,
        "source_tree": tree,
        "source_path": path,
        "normalized_content_checksum": checksum,
        "checksum_algorithm": "sha256-normalized-content",
    }


def finding_id(finding: dict[str, Any]) -> str:
    """Return a stable, non-secret identifier for one scanner finding."""
    supplied = finding.get("finding_id") or finding.get("id")
    if isinstance(supplied, str) and supplied.strip():
        return supplied.strip()
    rule_id = str(finding.get("rule_id") or "scanner.unknown")
    path = str(finding.get("path") or "")
    line = str(finding.get("line") or 0)
    evidence = str(finding.get("evidence") or "")
    material = "\0".join((rule_id, path, line, evidence))
    return f"{rule_id}:{hashlib.sha256(material.encode('utf-8')).hexdigest()[:16]}"


def finding_ids(findings: Iterable[dict[str, Any]]) -> list[str]:
    return sorted({finding_id(row) for row in findings if isinstance(row, dict)})


def _basis(findings: list[dict[str, Any]]) -> tuple[list[str], list[str], list[str]]:
    blocked: list[str] = []
    review: list[str] = []
    capabilities: list[str] = []
    for row in findings:
        if not isinstance(row, dict):
            continue
        identifier = finding_id(row)
        severity = str(row.get("severity", "")).casefold()
        if bool(row.get("blocks")) or severity in {"critical", "high"}:
            blocked.append(identifier)
        if bool(row.get("review")) or severity == "medium":
            review.append(identifier)
        if row.get("capabilities"):
            capabilities.append(identifier)
    return sorted(set(blocked)), sorted(set(review)), sorted(set(capabilities))


def _capability_set(findings: Iterable[dict[str, Any]], explicit: Iterable[str] = ()) -> list[str]:
    values: set[str] = set()
    for value in explicit:
        values.add(_require_enum(value, CAPABILITIES, "capability"))
    for row in findings:
        if not isinstance(row, dict):
            continue
        raw = row.get("capabilities", [])
        if isinstance(raw, str):
            raw = [raw]
        if isinstance(raw, list):
            for value in raw:
                values.add(_require_enum(value, CAPABILITIES, "capability"))
    return sorted(values)


def _approval(status: str, checksum: str, ids: list[str]) -> dict[str, Any]:
    return {
        "status": status,
        "scope": {
            "policy_version": POLICY_VERSION,
            "artifact_checksum": checksum,
            "finding_ids": ids,
        },
        "local_user_id": None,
        "approved_at": None,
        "effect": "local-private-registration-only",
        "global_trust_effect": "none",
    }


def build_policy(
    *,
    source: dict[str, Any],
    checksum: str,
    findings: Iterable[dict[str, Any]],
    capabilities: Iterable[str] = (),
    visibility: str = "private",
    scanner_schema_version: int = 2,
    sandbox_enforced: bool = False,
) -> dict[str, Any]:
    """Build the conservative decision for one scanned artifact."""
    visibility = _require_enum(visibility, VISIBILITIES, "visibility")
    rows = [dict(row) for row in findings if isinstance(row, dict)]
    artifact = artifact_binding(source, checksum)
    all_capabilities = _capability_set(rows, capabilities)
    blocked_ids, review_ids, capability_ids = _basis(rows)
    if blocked_ids:
        malware_verdict = "blocked"
        publication_status = "quarantined"
        execution_policy = "denied"
        approval_status = "not-permitted"
    elif review_ids:
        malware_verdict = "suspicious"
        publication_status = "review-required"
        execution_policy = "sandbox-only" if sandbox_enforced else "confirm"
        approval_status = "required"
    elif all_capabilities:
        malware_verdict = "clean"
        publication_status = "review-required"
        execution_policy = "sandbox-only" if sandbox_enforced else "confirm"
        approval_status = "required"
    else:
        malware_verdict = "clean"
        publication_status = "published"
        execution_policy = "instructions-only"
        approval_status = "not-required"
    ids = finding_ids(rows)
    policy = {
        "policy_name": POLICY_NAME,
        "schema_version": POLICY_SCHEMA_VERSION,
        "policy_version": POLICY_VERSION,
        "malware_verdict": malware_verdict,
        "capabilities": all_capabilities,
        "visibility": visibility,
        "publication_status": publication_status,
        "execution_policy": execution_policy,
        "artifact": artifact,
        "finding_ids": ids,
        "decision_basis": {
            "scanner": "paseo-spyware-check",
            "scanner_schema_version": scanner_schema_version,
            "blocking_finding_ids": blocked_ids,
            "review_finding_ids": review_ids,
            "capability_finding_ids": capability_ids,
            "sandbox_enforced": bool(sandbox_enforced),
        },
        "approval": _approval(approval_status, checksum, ids),
        "limitations": [
            "This is a local artifact decision, not a digital signature or global trust upgrade.",
            "Static scanning is heuristic and does not prove runtime safety.",
            "No sandbox or publication service is implemented in this increment.",
        ],
    }
    validate_policy(policy, expected_source=source, expected_checksum=checksum)
    return policy


def local_user_identity() -> str | None:
    """Return an explicitly configured account identity, never a guessed one."""
    value = os.environ.get("PASEOBILITY_LOCAL_ACCOUNT_ID", "").strip()
    return value if SAFE_USER_ID_RE.fullmatch(value) else None


def approve_locally(
    policy: dict[str, Any], *, user_id: str | None = None, approved_at: str | None = None
) -> dict[str, Any]:
    """Approve only the exact local artifact/findings represented by ``policy``."""
    validate_policy(policy)
    if policy.get("malware_verdict") == "blocked":
        raise PolicyError("blocked malware cannot be approved")
    approval = policy.get("approval")
    if not isinstance(approval, dict) or approval.get("status") != "required":
        raise PolicyError("policy does not have a review-required approval gate")
    result = copy.deepcopy(policy)
    checksum = result["artifact"]["normalized_content_checksum"]
    ids = list(result.get("finding_ids", []))
    result["approval"] = {
        "status": "approved",
        "scope": {
            "policy_version": result["policy_version"],
            "artifact_checksum": checksum,
            "finding_ids": ids,
        },
        "local_user_id": user_id if user_id and SAFE_USER_ID_RE.fullmatch(user_id) else local_user_identity(),
        "approved_at": approved_at or utc_now(),
        "effect": "local-private-registration-only",
        "global_trust_effect": "none",
    }
    validate_policy(result)
    return result


def policy_requires_approval(policy: dict[str, Any] | None) -> bool:
    return isinstance(policy, dict) and isinstance(policy.get("approval"), dict) and policy["approval"].get("status") == "required"


def policy_requires_confirmation(policy: dict[str, Any] | None) -> bool:
    return isinstance(policy, dict) and policy.get("execution_policy") in {"confirm", "sandbox-only"}


def validate_policy(
    policy: Any,
    *,
    expected_source: dict[str, Any] | None = None,
    expected_checksum: str | None = None,
    expected_finding_ids: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Validate shape, artifact binding, approval scope, and transitions."""
    if not isinstance(policy, dict):
        raise PolicyError("security policy must be an object")
    if policy.get("policy_name") != POLICY_NAME or policy.get("schema_version") != POLICY_SCHEMA_VERSION:
        raise PolicyError("unsupported security policy schema")
    if policy.get("policy_version") != POLICY_VERSION:
        raise PolicyError("unsupported security policy version")
    _require_enum(policy.get("malware_verdict"), MALWARE_VERDICTS, "malware_verdict")
    _require_enum(policy.get("visibility"), VISIBILITIES, "visibility")
    _require_enum(policy.get("publication_status"), PUBLICATION_STATUSES, "publication_status")
    _require_enum(policy.get("execution_policy"), EXECUTION_POLICIES, "execution_policy")
    capabilities = policy.get("capabilities")
    if not isinstance(capabilities, list) or capabilities != sorted(set(capabilities)):
        raise PolicyError("capabilities must be a sorted unique list")
    for value in capabilities:
        _require_enum(value, CAPABILITIES, "capability")
    artifact = policy.get("artifact")
    if not isinstance(artifact, dict):
        raise PolicyError("security policy has no artifact binding")
    kind = _require_enum(artifact.get("source_kind"), ("github", "local"), "artifact source kind")
    checksum = artifact.get("normalized_content_checksum")
    if not isinstance(checksum, str) or not CHECKSUM_RE.fullmatch(checksum):
        raise PolicyError("security policy has no normalized content checksum")
    repository = artifact.get("source_repository")
    path = artifact.get("source_path")
    if not isinstance(repository, str) or not isinstance(path, str) or path.startswith("/") or "\\" in path:
        raise PolicyError("security policy artifact path/repository is invalid")
    commit = artifact.get("source_commit")
    tree = artifact.get("source_tree")
    if kind == "github":
        if not isinstance(commit, str) or not COMMIT_RE.fullmatch(commit):
            raise PolicyError("GitHub policy artifact lacks an exact source commit")
        if tree is not None and (not isinstance(tree, str) or not COMMIT_RE.fullmatch(tree)):
            raise PolicyError("GitHub policy artifact has an invalid source tree")
    elif commit is not None or tree is not None or repository != "local-user-source" or path:
        raise PolicyError("local policy artifact contains a non-local source identity")
    if expected_checksum is not None and checksum != expected_checksum:
        raise PolicyError("security policy checksum does not match the artifact")
    if expected_source is not None:
        expected = artifact_binding(expected_source, checksum)
        if artifact != expected:
            raise PolicyError("security policy source binding does not match the receipt source")
    ids = policy.get("finding_ids")
    if not isinstance(ids, list) or ids != sorted(set(ids)) or not all(isinstance(value, str) and value for value in ids):
        raise PolicyError("finding_ids must be a sorted unique list of strings")
    if expected_finding_ids is not None and ids != sorted(set(str(value) for value in expected_finding_ids)):
        raise PolicyError("security policy finding scope does not match the receipt")
    basis = policy.get("decision_basis")
    if not isinstance(basis, dict):
        raise PolicyError("security policy has no decision basis")
    if not isinstance(basis.get("scanner"), str) or not basis.get("scanner"):
        raise PolicyError("security policy decision basis has no scanner name")
    if not isinstance(basis.get("scanner_schema_version"), int) or isinstance(basis.get("scanner_schema_version"), bool) or basis.get("scanner_schema_version") < 1:
        raise PolicyError("security policy decision basis has an invalid scanner schema version")
    for key in ("blocking_finding_ids", "review_finding_ids", "capability_finding_ids"):
        value = basis.get(key)
        if not isinstance(value, list) or value != sorted(set(value)) or not all(value_id in ids for value_id in value):
            raise PolicyError(f"invalid decision basis: {key}")
    sandbox = basis.get("sandbox_enforced")
    if not isinstance(sandbox, bool):
        raise PolicyError("sandbox_enforced must be boolean")
    blocked = bool(basis["blocking_finding_ids"])
    reviewed = bool(basis["review_finding_ids"])
    has_capabilities = bool(capabilities)
    if blocked:
        expected = ("blocked", "quarantined", "denied", "not-permitted")
    elif reviewed:
        expected = ("suspicious", "review-required", "sandbox-only" if sandbox else "confirm", "required")
    elif has_capabilities:
        expected = ("clean", "review-required", "sandbox-only" if sandbox else "confirm", "required")
    else:
        expected = ("clean", "published", "instructions-only", "not-required")
    actual = (
        policy.get("malware_verdict"),
        policy.get("publication_status"),
        policy.get("execution_policy"),
        (policy.get("approval") or {}).get("status") if isinstance(policy.get("approval"), dict) else None,
    )
    if actual[:3] != expected[:3]:
        raise PolicyError(f"security policy transition is inconsistent: expected {expected[:3]}, got {actual[:3]}")
    approval_status = actual[3]
    if expected[3] == "required":
        if approval_status not in {"required", "approved"}:
            raise PolicyError(
                f"security policy approval transition is inconsistent: expected required or approved, got {approval_status}"
            )
    elif approval_status != expected[3]:
        raise PolicyError(f"security policy approval transition is inconsistent: expected {expected[3]}, got {approval_status}")
    approval = policy.get("approval")
    if not isinstance(approval, dict):
        raise PolicyError("security policy approval record is missing")
    if approval.get("status") not in APPROVAL_STATUSES:
        raise PolicyError("invalid approval status")
    scope = approval.get("scope")
    if not isinstance(scope, dict) or scope.get("policy_version") != policy.get("policy_version") or scope.get("artifact_checksum") != checksum or scope.get("finding_ids") != ids:
        raise PolicyError("approval scope is not bound to this policy, artifact, and finding set")
    local_id = approval.get("local_user_id")
    if local_id is not None and (not isinstance(local_id, str) or not SAFE_USER_ID_RE.fullmatch(local_id)):
        raise PolicyError("approval local_user_id is invalid")
    if approval.get("effect") != "local-private-registration-only" or approval.get("global_trust_effect") != "none":
        raise PolicyError("approval cannot change global or public trust")
    if approval.get("status") == "approved" and not isinstance(approval.get("approved_at"), str):
        raise PolicyError("approved policy has no approval timestamp")
    limitations = policy.get("limitations")
    if not isinstance(limitations, list) or not all(isinstance(value, str) and value for value in limitations):
        raise PolicyError("security policy limitations must be non-empty strings")
    if policy.get("execution_policy") == "sandbox-only" and not sandbox:
        raise PolicyError("sandbox-only policy requires a real enforced sandbox")
    if policy.get("publication_status") == "quarantined" and policy.get("malware_verdict") != "blocked":
        raise PolicyError("only blocked malware may be quarantined by this policy")
    return policy
