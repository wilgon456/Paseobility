"""Deterministic Korean routing taxonomy and hierarchical library tree."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


ROUTING_TAXONOMY_NAME = "routing-taxonomy.json"
ROUTING_TREE_NAME = "routing-tree.json"
HANGUL_RE = re.compile(r"[가-힣]")
ROUTING_ACTION_ORDER = (
    "search",
    "read",
    "extract",
    "analyze",
    "write",
    "edit",
    "send",
    "reserve",
    "cancel",
    "pay",
    "delete",
)
ACTION_BEHAVIORS = {
    "search": "information-retrieval",
    "read": "information-retrieval",
    "extract": "content-extraction",
    "analyze": "analysis",
    "write": "content-generation",
    "edit": "content-transformation",
    "send": "external-action",
    "reserve": "external-action",
    "cancel": "destructive-action",
    "pay": "destructive-action",
    "delete": "destructive-action",
}


def load_routing_taxonomy(root: Path) -> dict[str, Any]:
    path = root / "catalog" / ROUTING_TAXONOMY_NAME
    taxonomy = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(taxonomy, dict) or taxonomy.get("schema_version") != 1:
        raise ValueError(f"{path}: routing taxonomy schema_version must be 1")
    for field in ("actions", "behavior_classes", "domain_groups", "domains", "formats", "manual_overrides"):
        if not isinstance(taxonomy.get(field), dict):
            raise ValueError(f"{path}: {field} must be an object")
    if set(taxonomy["actions"]) != set(ROUTING_ACTION_ORDER):
        raise ValueError(f"{path}: actions must use the controlled routing vocabulary")
    domain_ids = set(taxonomy["domains"])
    grouped: list[str] = []
    orders: set[int] = set()
    for group_id, group in taxonomy["domain_groups"].items():
        if not isinstance(group, dict):
            raise ValueError(f"{path}: invalid group {group_id}")
        if not HANGUL_RE.search(str(group.get("label_ko", ""))):
            raise ValueError(f"{path}: group {group_id} needs a Korean label")
        domains = group.get("domains")
        if not isinstance(domains, list) or not domains or any(domain not in domain_ids for domain in domains):
            raise ValueError(f"{path}: group {group_id} contains an unknown domain")
        order = group.get("order")
        if not isinstance(order, int) or order < 1 or order in orders:
            raise ValueError(f"{path}: group {group_id} has an invalid order")
        orders.add(order)
        grouped.extend(domains)
    if len(grouped) != len(set(grouped)) or set(grouped) != domain_ids:
        raise ValueError(f"{path}: groups must partition every domain exactly once")
    for field in ("actions", "domains"):
        for identifier, definition in taxonomy[field].items():
            if not isinstance(definition, dict) or not HANGUL_RE.search(str(definition.get("label_ko", ""))):
                raise ValueError(f"{path}: {field}.{identifier} needs a Korean label")
            if not isinstance(definition.get("terms"), list):
                raise ValueError(f"{path}: {field}.{identifier}.terms must be an array")
    return taxonomy


def _unique_strings(values: Iterable[Any]) -> list[str]:
    return list(dict.fromkeys(str(value) for value in values if isinstance(value, str) and value.strip()))


def _domain_group_index(taxonomy: dict[str, Any]) -> dict[str, str]:
    return {
        domain: group_id
        for group_id, definition in taxonomy["domain_groups"].items()
        for domain in definition["domains"]
    }


def _routing_search_text(item: dict[str, Any]) -> str:
    source = item.get("source", {}) if isinstance(item.get("source"), dict) else {}
    values: list[Any] = [
        item.get("catalog_id"),
        item.get("name"),
        item.get("description"),
        item.get("kind"),
        item.get("source_id"),
        source.get("path"),
        source.get("publisher"),
        source.get("repository"),
        *item.get("aliases", []),
        *item.get("tags", []),
        *item.get("compatibility", []),
    ]
    return " ".join(str(value) for value in values if value).casefold()


def _term_matches(haystack: str, term: str) -> bool:
    normalized = term.casefold().strip()
    if not normalized:
        return False
    if not normalized.isascii() or not re.fullmatch(r"[a-z0-9+#./ -]+", normalized):
        return normalized in haystack
    pattern = re.escape(normalized).replace(r"\ ", r"[\s_-]+")
    return re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", haystack) is not None


def _match_score(haystack: str, definition: dict[str, Any]) -> int:
    matches = [term for term in definition.get("terms", []) if _term_matches(haystack, term)]
    return sum(1 + len(term.split()) for term in matches)


def _short_korean_description(value: str, limit: int = 260) -> str:
    normalized = " ".join(value.split())
    if len(normalized) <= limit:
        return normalized
    shortened = normalized[: limit + 1].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return shortened + "…"


def _korean_source_summary(value: str) -> str | None:
    """Keep concise Korean-led source text; otherwise use the taxonomy fallback."""

    normalized = " ".join(value.split())
    for marker in (" Use when", " Always ", " Not for", " 돌쇠에서는"):
        normalized = normalized.split(marker, 1)[0].strip()
    candidate = _short_korean_description(normalized)
    hangul_count = len(HANGUL_RE.findall(candidate))
    latin_count = len(re.findall(r"[A-Za-z]", candidate))
    if hangul_count < 12 or hangul_count < latin_count:
        return None
    return candidate


def _display_name(item: dict[str, Any]) -> str:
    value = str(item.get("title") or item.get("portable_name") or item.get("name") or "전문")
    return " ".join(part.capitalize() for part in re.split(r"[-_]+", value) if part)


def derive_routing_metadata(item: dict[str, Any], taxonomy: dict[str, Any]) -> dict[str, Any]:
    """Classify metadata only; candidate instructions are never loaded or executed."""
    haystack = _routing_search_text(item)
    catalog_id = str(item.get("catalog_id", ""))
    name = str(item.get("name", ""))
    override = taxonomy["manual_overrides"].get(catalog_id, {})
    if not override:
        override = taxonomy["manual_overrides"].get(f"hub/{name}", {})

    matched_actions = [
        action
        for action in ROUTING_ACTION_ORDER
        if _match_score(haystack, taxonomy["actions"][action])
    ]
    actions = _unique_strings(override.get("actions", matched_actions)) or ["analyze"]

    scored_domains = sorted(
        (
            (_match_score(haystack, definition), domain)
            for domain, definition in taxonomy["domains"].items()
            if domain != "general" and _match_score(haystack, definition)
        ),
        key=lambda value: (-value[0], value[1]),
    )
    domains = _unique_strings(override.get("domains", [domain for _, domain in scored_domains[:3]])) or ["general"]

    behavior_classes = _unique_strings(
        override.get("behavior_classes", [ACTION_BEHAVIORS[action] for action in actions])
    )
    risk = str(item.get("risk", "scripts"))
    if "behavior_classes" not in override and risk in {"scripts", "external-write", "destructive"}:
        behavior_classes.append("code-execution")
    if "behavior_classes" not in override and risk in {"external-write", "destructive"}:
        behavior_classes.append("external-action")
    if "behavior_classes" not in override and risk == "destructive":
        behavior_classes.append("destructive-action")
    if "behavior_classes" not in override and risk == "local-management":
        behavior_classes.append("local-management")
    if "behavior_classes" not in override and any(
        marker in haystack for marker in ("multi-agent", "orchestrat", "workflow", "router", "subagent")
    ):
        behavior_classes.append("orchestration")
    behavior_classes = _unique_strings(behavior_classes)

    formats = _unique_strings(
        identifier for identifier in taxonomy["formats"] if _term_matches(haystack, identifier)
    )
    description = str(item.get("description", ""))
    korean_source_summary = _korean_source_summary(description)
    if override.get("description_ko"):
        description_ko = str(override["description_ko"])
        description_source = "manual-override"
    elif korean_source_summary:
        description_ko = korean_source_summary
        description_source = "source-korean-summary-v1"
    else:
        title = _display_name(item)
        domain_labels = [taxonomy["domains"][domain]["label_ko"] for domain in domains[:2]]
        action_labels = [taxonomy["actions"][action]["label_ko"] for action in actions[:3]]
        description_ko = (
            f"‘{title}’는 {'·'.join(domain_labels)} 관련 요청에서 "
            f"{', '.join(action_labels)} 작업을 수행할 때 사용하는 스킬입니다."
        )
        if formats:
            format_labels = _unique_strings(taxonomy["formats"][value] for value in formats[:4])
            description_ko += f" 지원 형식: {', '.join(format_labels)}."
        description_source = "taxonomy-template-v2"

    domain_group_index = _domain_group_index(taxonomy)
    library_paths = []
    for index, domain in enumerate(domains):
        group_id = domain_group_index[domain]
        group = taxonomy["domain_groups"][group_id]
        domain_definition = taxonomy["domains"][domain]
        library_paths.append(
            {
                "group": group_id,
                "group_label_ko": group["label_ko"],
                "group_aliases_ko": list(group["aliases_ko"]),
                "domain": domain,
                "domain_label_ko": domain_definition["label_ko"],
                "path_ko": f"{group['label_ko']} > {domain_definition['label_ko']}",
                "primary": index == 0,
            }
        )
    generated_tags = [
        library_paths[0]["group_label_ko"],
        *(taxonomy["domains"][domain]["label_ko"] for domain in domains),
        *(taxonomy["actions"][action]["label_ko"] for action in actions),
        *(taxonomy["formats"][value] for value in formats),
    ]
    routing = {
        "schema_version": 1,
        "description_ko": description_ko,
        "description_source": description_source,
        "tags_ko": _unique_strings([*override.get("tags_ko", []), *generated_tags]),
        "actions": actions,
        "behavior_classes": behavior_classes,
        "domains": domains,
        "input_formats": formats,
        "library_paths": library_paths,
        "primary_path": [library_paths[0]["group"], library_paths[0]["domain"]],
        "taxonomy": f"catalog/{ROUTING_TAXONOMY_NAME}",
    }
    validate_routing_metadata(routing, catalog_id or name, taxonomy)
    return routing


def validate_routing_metadata(routing: dict[str, Any], identifier: str, taxonomy: dict[str, Any]) -> None:
    if not HANGUL_RE.search(str(routing.get("description_ko", ""))):
        raise ValueError(f"{identifier}: routing.description_ko must contain Korean")
    tags = routing.get("tags_ko")
    if not isinstance(tags, list) or not tags or any(not HANGUL_RE.search(str(tag)) for tag in tags):
        raise ValueError(f"{identifier}: routing.tags_ko must contain Korean tags")
    for field, allowed in (
        ("actions", set(taxonomy["actions"])),
        ("behavior_classes", set(taxonomy["behavior_classes"])),
        ("domains", set(taxonomy["domains"])),
        ("input_formats", set(taxonomy["formats"])),
    ):
        values = routing.get(field)
        if not isinstance(values, list) or (field != "input_formats" and not values) or any(value not in allowed for value in values):
            raise ValueError(f"{identifier}: routing.{field} is invalid")
    paths = routing.get("library_paths")
    if not isinstance(paths, list) or len(paths) != len(routing["domains"]):
        raise ValueError(f"{identifier}: routing paths must map every domain")
    group_index = _domain_group_index(taxonomy)
    for index, path in enumerate(paths):
        domain = routing["domains"][index]
        if path.get("domain") != domain or path.get("group") != group_index[domain]:
            raise ValueError(f"{identifier}: routing path order is invalid")
        if path.get("primary") is not (index == 0) or not HANGUL_RE.search(str(path.get("path_ko", ""))):
            raise ValueError(f"{identifier}: routing primary path is invalid")
    if routing.get("primary_path") != [paths[0]["group"], paths[0]["domain"]]:
        raise ValueError(f"{identifier}: routing.primary_path must point to the first path")


def compile_routing_tree(items: list[dict[str, Any]], taxonomy: dict[str, Any]) -> dict[str, Any]:
    primary_by_domain: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        routing = item["routing"]
        primary_domain = routing["primary_path"][1]
        primary_by_domain[primary_domain].append(
            {
                "catalog_id": item["catalog_id"],
                "name": item.get("name", ""),
                "description_ko": routing["description_ko"],
                "tags_ko": routing["tags_ko"],
                "actions": routing["actions"],
                "behavior_classes": routing["behavior_classes"],
                "cross_paths_ko": [path["path_ko"] for path in routing["library_paths"] if not path["primary"]],
                "risk": item.get("risk", "unknown"),
                "status": item.get("archive", {}).get("status", "unknown"),
            }
        )
    groups = []
    ordered_groups = sorted(taxonomy["domain_groups"].items(), key=lambda value: value[1]["order"])
    for group_id, group in ordered_groups:
        domains = []
        for domain_id in group["domains"]:
            skills = sorted(primary_by_domain.get(domain_id, []), key=lambda row: row["catalog_id"])
            domains.append(
                {
                    "id": domain_id,
                    "label_ko": taxonomy["domains"][domain_id]["label_ko"],
                    "skill_count": len(skills),
                    "skills": skills,
                }
            )
        groups.append(
            {
                "id": group_id,
                "label_ko": group["label_ko"],
                "description_ko": group["description_ko"],
                "aliases_ko": group["aliases_ko"],
                "skill_count": sum(domain["skill_count"] for domain in domains),
                "domains": domains,
            }
        )
    return {
        "schema_version": 1,
        "generated_by": "scripts/build_catalog.py",
        "skill_count": len(items),
        "group_count": len(groups),
        "domain_count": sum(len(group["domains"]) for group in groups),
        "groups": groups,
    }


def runtime_routing_taxonomy(taxonomy: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "actions": taxonomy["actions"],
        "domains": taxonomy["domains"],
        "formats": taxonomy["formats"],
        "domain_groups": taxonomy["domain_groups"],
    }
