"""Deterministic agent-native routing: rank compatible catalog candidates.

Routing is read-only. It never fetches, approves, activates, or executes
anything; it only explains which catalog rows are compatible with a task and
which exact commands a human-approved flow would use next.
"""
from __future__ import annotations

import re
from typing import Any

try:
    from .library import RISK_ORDER, risk_allowed
except ImportError:  # pragma: no cover - direct script execution
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from skillhub.library import RISK_ORDER, risk_allowed  # type: ignore


ROUTE_SCHEMA_VERSION = 1
DEFAULT_LIMIT = 5
MAX_FILTERED_ROWS = 25
TARGET_COMPATIBILITY = {
    "codex": "codex",
    "claude": "claude-code",
    "opencode": "opencode",
    "paseo": "paseo",
    "hermes": "hermes-agent",
    "generic": "generic-agent",
}
KNOWN_OSES = ("windows", "macos", "linux")
STOPWORDS = {
    "a", "an", "and", "are", "can", "could", "do", "does", "find", "for",
    "from", "get", "help", "how", "i", "in", "is", "it", "me", "my", "need",
    "of", "on", "or", "please", "run", "skill", "skills", "some", "task",
    "that", "the", "to", "use", "using", "want", "what", "which", "with",
    "would", "you", "your",
}
TRUST_LIMITATIONS = (
    "A pin, checksum, official publisher identity, archive, or clean static scan is evidence, never a runtime-safety guarantee.",
    "The manager never executes fetched content; runtime behavior depends on the skill text and the agent's own approvals.",
    "Routing combines deterministic lexical evidence with the library hierarchy; it is not a safety certification.",
)


def default_os_name() -> str:
    import sys

    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def split_tokens(value: str) -> list[str]:
    """Split on every non-word character so hyphenated names become words."""
    return [part for part in re.findall(r"\w+", str(value).casefold(), flags=re.UNICODE) if part]


def task_tokens(task: str) -> list[str]:
    return [token for token in split_tokens(task) if token not in STOPWORDS]


def _field_tokens(item: dict[str, Any], key: str) -> set[str]:
    value = item.get(key)
    if isinstance(value, (list, tuple)):
        return {token for entry in value for token in split_tokens(entry)}
    return set(split_tokens(value or ""))


def _term_matches(haystack: str, term: str) -> bool:
    normalized = str(term).casefold().strip()
    if not normalized:
        return False
    if not normalized.isascii() or not re.fullmatch(r"[a-z0-9+#./ -]+", normalized):
        return normalized in haystack
    pattern = re.escape(normalized).replace(r"\ ", r"[\s_-]+")
    return re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", haystack) is not None


def task_routing_signals(registry: dict[str, Any], task: str) -> dict[str, list[str]]:
    """Map natural-language task text onto the controlled taxonomy vocabulary."""
    taxonomy = registry.get("routing_taxonomy", {})
    haystack = task.casefold()
    signals: dict[str, list[str]] = {"groups": [], "domains": [], "actions": [], "formats": []}
    for identifier, definition in taxonomy.get("domain_groups", {}).items():
        terms = [definition.get("label_ko", ""), *definition.get("aliases_ko", [])]
        if any(_term_matches(haystack, term) for term in terms):
            signals["groups"].append(identifier)
    for identifier, definition in taxonomy.get("domains", {}).items():
        terms = [definition.get("label_ko", ""), *definition.get("terms", [])]
        if any(_term_matches(haystack, term) for term in terms):
            signals["domains"].append(identifier)
    for identifier, definition in taxonomy.get("actions", {}).items():
        terms = [definition.get("label_ko", ""), *definition.get("terms", [])]
        if any(_term_matches(haystack, term) for term in terms):
            signals["actions"].append(identifier)
    for identifier, label in taxonomy.get("formats", {}).items():
        if _term_matches(haystack, identifier) or _term_matches(haystack, label):
            signals["formats"].append(identifier)
    return signals


def _routing_tokens(item: dict[str, Any]) -> set[str]:
    routing = item.get("routing", {}) if isinstance(item.get("routing"), dict) else {}
    values: list[Any] = [
        routing.get("description_ko", ""),
        *routing.get("tags_ko", []),
        *routing.get("actions", []),
        *routing.get("behavior_classes", []),
        *routing.get("domains", []),
        *routing.get("input_formats", []),
    ]
    for path in routing.get("library_paths", []):
        if isinstance(path, dict):
            values.extend(
                [
                    path.get("group", ""),
                    path.get("group_label_ko", ""),
                    *path.get("group_aliases_ko", []),
                    path.get("domain", ""),
                    path.get("domain_label_ko", ""),
                    path.get("path_ko", ""),
                ]
            )
    return {token for value in values for token in split_tokens(str(value))}


def score_item(
    item: dict[str, Any],
    task: str,
    tokens: list[str],
    signals: dict[str, list[str]] | None = None,
) -> tuple[int, list[str]]:
    """Deterministic relevance score with stable, explainable reasons."""
    lowered = task.casefold()
    catalog_id = str(item.get("catalog_id", ""))
    name = str(item.get("name", ""))
    score = 0
    reasons: list[str] = []
    if lowered and lowered in catalog_id.casefold():
        score += 100
        reasons.append("catalog_id contains the task text")
    if lowered and lowered in name.casefold():
        score += 90
        reasons.append("name contains the task text")
    weights = (
        ("name", _field_tokens(item, "name"), 25),
        ("aliases", _field_tokens(item, "aliases"), 15),
        ("catalog_id", set(split_tokens(catalog_id)), 10),
        ("tags", _field_tokens(item, "tags"), 10),
        ("description", _field_tokens(item, "description"), 5),
        ("routing", _routing_tokens(item), 8),
    )
    wanted = set(tokens)
    for label, field_tokens, weight in weights:
        matched = sorted(wanted & (field_tokens - STOPWORDS))
        if matched:
            score += weight * len(matched)
            shown = ", ".join(matched[:10])
            if len(matched) > 10:
                shown += f", +{len(matched) - 10} more"
            reasons.append(f"{label} matched: {shown}")
    signals = signals or {"groups": [], "domains": [], "actions": [], "formats": []}
    routing = item.get("routing", {}) if isinstance(item.get("routing"), dict) else {}
    primary_path = routing.get("primary_path", [])
    primary_group = primary_path[0] if isinstance(primary_path, list) and len(primary_path) == 2 else None
    primary_domain = primary_path[1] if isinstance(primary_path, list) and len(primary_path) == 2 else None
    item_domains = list(routing.get("domains", []))
    matched_domains = [domain for domain in signals["domains"] if domain in item_domains]
    if primary_domain in matched_domains:
        score += 48
        reasons.append(f"primary library domain matched: {primary_domain}")
    secondary_domains = [domain for domain in matched_domains if domain != primary_domain]
    if secondary_domains:
        score += 24 * len(secondary_domains)
        reasons.append("cross library domain matched: " + ", ".join(secondary_domains))
    if primary_group in signals["groups"]:
        score += 28
        reasons.append(f"primary library group matched: {primary_group}")
    matched_actions = sorted(set(signals["actions"]) & set(routing.get("actions", [])))
    if matched_actions:
        score += 14 * len(matched_actions)
        reasons.append("requested actions matched: " + ", ".join(matched_actions))
    matched_formats = sorted(set(signals["formats"]) & set(routing.get("input_formats", [])))
    if matched_formats:
        score += 18 * len(matched_formats)
        reasons.append("input formats matched: " + ", ".join(matched_formats))
    return score, reasons


def recommendation_assessment(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = sorted(rows, key=lambda row: (-row["score"], row["catalog_id"]))
    if not ordered:
        return {"status": "no-match", "confidence": 0.0, "reason": "no compatible scored candidate"}
    top = ordered[0]
    runner_up = ordered[1] if len(ordered) > 1 else None
    margin = top["score"] - runner_up["score"] if runner_up else top["score"]
    if top["score"] < 35 or (runner_up is not None and margin < 15):
        return {
            "status": "needs-clarification",
            "confidence": round(min(0.69, max(0.2, top["score"] / 200)), 2),
            "reason": "top candidates are weak or too close; ask about the intended output, data, or action",
            "top_margin": margin,
        }
    return {
        "status": "recommend",
        "confidence": round(min(0.95, 0.55 + margin / 200), 2),
        "reason": "the top candidate has distinct lexical and hierarchical evidence",
        "top_margin": margin,
    }


def compatibility_reason(item: dict[str, Any], client: str, os_name: str) -> str | None:
    compatibility = [str(value) for value in item.get("compatibility", [])]
    if client not in compatibility and not (client == "hermes-agent" and "generic-agent" in compatibility):
        return f"client unsupported: needs {client}, item lists {', '.join(sorted(compatibility)) or 'none'}"
    oses = [str(value) for value in item.get("oses", [])]
    if os_name not in oses and "any" not in oses:
        return f"OS unsupported: needs {os_name}, item lists {', '.join(sorted(oses)) or 'none'}"
    return None


def availability_reason(item: dict[str, Any]) -> str | None:
    status = item.get("archive", {}).get("status")
    if status != "archived":
        blocker = item.get("archive", {}).get("blocker")
        return f"{status}: {blocker}" if blocker else f"{status}: not acquirable"
    if item.get("activation_policy") == "blocked":
        return "activation policy is blocked"
    security_policy = item.get("security_policy")
    if isinstance(security_policy, dict):
        if security_policy.get("malware_verdict") == "blocked" or security_policy.get("execution_policy") == "denied":
            return "security policy denies activation"
        if security_policy.get("publication_status") in {"quarantined", "revoked"}:
            return f"security policy status is {security_policy.get('publication_status')}"
    plan = item.get("acquisition", {})
    if plan.get("status") != "available":
        return f"acquisition unavailable: {plan.get('reason') or 'no acquisition plan'}"
    return None


def risk_requirement(item: dict[str, Any], allow_risk: str) -> str | None:
    """Return the explicit authorization flag still needed, if any."""
    risk = str(item.get("risk", "destructive"))
    required: str | None = None
    if risk == "destructive":
        required = "--allow-risk destructive --confirm-destructive"
    elif not risk_allowed(risk, allow_risk):
        required = f"--allow-risk {risk}"
    security_policy = item.get("security_policy")
    if isinstance(security_policy, dict) and security_policy.get("execution_policy") in {"confirm", "sandbox-only"}:
        required = f"{required} + --confirm-policy" if required else "--confirm-policy"
    return required


def provenance_row(item: dict[str, Any]) -> dict[str, Any]:
    source = item.get("source", {}) if isinstance(item.get("source"), dict) else {}
    return {
        "repository": source.get("repository"),
        "commit": source.get("commit"),
        "path": source.get("path"),
        "publisher": source.get("publisher"),
        "source_id": item.get("source_id"),
    }


def route_task(
    registry: dict[str, Any],
    state: dict[str, Any],
    task: str,
    target: str,
    *,
    client: str | None = None,
    os_name: str,
    allow_risk: str = "instructions-only",
    limit: int = DEFAULT_LIMIT,
) -> dict[str, Any]:
    """Deterministically rank acquirable candidates for one target.

    Buckets are stable: ``candidates`` are compatible and within the declared
    risk allowance, ``risk_gated`` are compatible but still need an explicit
    independent risk authorization, and ``filtered`` lists incompatible rows
    with reasons. Nothing here mutates state or touches the network.
    """
    client = client or TARGET_COMPATIBILITY[target]
    tokens = task_tokens(task)
    signals = task_routing_signals(registry, task)
    candidates: list[dict[str, Any]] = []
    risk_gated: list[dict[str, Any]] = []
    filtered: list[dict[str, Any]] = []
    for item in registry.get("skills", []):
        catalog_id = str(item.get("catalog_id", ""))
        reason = availability_reason(item)
        if reason:
            filtered.append({"catalog_id": catalog_id, "reason": reason})
            continue
        reason = compatibility_reason(item, client, os_name)
        if reason:
            filtered.append({"catalog_id": catalog_id, "reason": reason})
            continue
        score, reasons = score_item(item, task, tokens, signals)
        if score <= 0:
            continue
        risk = str(item.get("risk", "destructive"))
        license_info = item.get("archive", {}).get("license", {})
        row = {
            "catalog_id": catalog_id,
            "name": item.get("name"),
            "description": item.get("description", ""),
            "score": score,
            "match_reasons": reasons,
            "risk": risk,
            "availability": item.get("archive", {}).get("status"),
            "license": {
                "declared": license_info.get("declared"),
                "redistribution": license_info.get("redistribution"),
            },
            "provenance": provenance_row(item),
            "integrity": {
                "expected_checksum": item.get("verification", {}).get("checksum"),
                "local_state": _local_state(state, catalog_id),
            },
            "trust": {
                "tier": item.get("trust", {}).get("tier"),
                "security_review": item.get("trust", {}).get("security_review"),
            },
            "security_policy": item.get("security_policy"),
            "routing": {
                "description_ko": item.get("routing", {}).get("description_ko"),
                "primary_path": item.get("routing", {}).get("primary_path"),
                "library_paths": item.get("routing", {}).get("library_paths", []),
                "actions": item.get("routing", {}).get("actions", []),
                "behavior_classes": item.get("routing", {}).get("behavior_classes", []),
            },
        }
        required = risk_requirement(item, allow_risk)
        if required is None:
            row["acquire_commands"] = acquire_commands(catalog_id, target, risk)
            candidates.append(row)
        else:
            risk_gated.append({
                "catalog_id": catalog_id,
                "name": item.get("name"),
                "score": score,
                "risk": risk,
                "required_authorization": required,
                "note": "compatible, but risk authorization is separate from download approval",
            })
    candidates.sort(key=lambda row: (-row["score"], row["catalog_id"]))
    risk_gated.sort(key=lambda row: (-row["score"], row["catalog_id"]))
    filtered.sort(key=lambda row: (row["catalog_id"], row["reason"]))
    truncated = filtered[:MAX_FILTERED_ROWS]
    output: dict[str, Any] = {
        "schema_version": ROUTE_SCHEMA_VERSION,
        "status": "routed" if candidates or risk_gated else "no-match",
        "task": task,
        "intent": signals,
        "target": target,
        "client": client,
        "os": os_name,
        "allow_risk": allow_risk,
        "candidates": candidates[: max(1, limit)],
        "candidate_count": len(candidates),
        "risk_gated": risk_gated[: max(1, limit)],
        "risk_gated_count": len(risk_gated),
        "recommendation": recommendation_assessment([*candidates, *risk_gated]),
        "filtered": truncated,
        "filtered_count": len(filtered),
        "approval": {
            "required": True,
            "note": "route never downloads; a human must approve the exact catalog_id before fetch/install/use",
        },
        "trust_limitations": list(TRUST_LIMITATIONS),
        "next_steps": next_steps(candidates, risk_gated, target),
    }
    return output


def _local_state(state: dict[str, Any], catalog_id: str) -> str:
    activation = state.get("activations", {}).get(catalog_id)
    if activation and activation.get("targets"):
        if all(record.get("one_shot") for record in activation["targets"].values()):
            return "one-shot"
        return "enabled"
    if catalog_id in state.get("acquisitions", {}):
        return "fetched"
    return "indexed"


def acquire_commands(catalog_id: str, target: str, risk: str) -> dict[str, str]:
    risk_flags = ""
    if RISK_ORDER.get(risk, 99) >= RISK_ORDER["scripts"]:
        risk_flags = f" --allow-risk {risk}"
    if risk == "destructive":
        risk_flags += " --confirm-destructive"
    if target == "hermes":
        return {
            "resolve": f"skillhub resolve {catalog_id} --target hermes{risk_flags} --yes --json",
        }
    return {
        "one_shot": f"skillhub use {catalog_id} --once --target {target}{risk_flags} --yes --json",
        "install": f"skillhub install {catalog_id} --target {target}{risk_flags} --yes --json",
    }


def next_steps(candidates: list[dict[str, Any]], risk_gated: list[dict[str, Any]], target: str) -> list[str]:
    steps: list[str] = []
    if candidates:
        top = candidates[0]["catalog_id"]
        steps.append(f"skillhub inspect {top} --json")
        steps.append("present provenance, license, integrity, risk, and trust limitations; ask the user for explicit approval")
        commands = candidates[0]["acquire_commands"]
        if target == "hermes":
            steps.append(commands["resolve"])
        else:
            steps.extend([commands["one_shot"], commands["install"]])
        steps.append("read SKILL.md from the returned verified skill_path immediately; do not rely on same-session rediscovery")
    elif risk_gated:
        top = risk_gated[0]
        steps.append(f"skillhub inspect {top['catalog_id']} --json")
        steps.append(f"candidate needs independent risk authorization: {top['required_authorization']}")
    else:
        steps.append("no compatible candidate; refine the task wording or run 'skillhub search' with broader terms")
    return steps
