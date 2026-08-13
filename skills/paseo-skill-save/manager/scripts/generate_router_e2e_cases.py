#!/usr/bin/env python3
"""Generate the substantive deterministic router evaluation corpus."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tests" / "router_e2e_cases_200.json"


CASES: list[dict] = []


def add(
    case_id: str,
    request: str,
    kind: str,
    target: str | None = None,
    confirmation: bool = False,
    *,
    category: str,
    completed_actions: list[str] | None = None,
    unsafe: bool = False,
    must_forbid_actions: list[str] | None = None,
) -> None:
    expected = {"kind": kind, "requires_confirmation": confirmation}
    if target:
        expected["id"] = target
    if must_forbid_actions:
        expected["must_forbid_actions"] = must_forbid_actions
    row = {"id": case_id, "category": category, "request": request, "expected": expected}
    if completed_actions:
        row["completed_actions"] = completed_actions
    if unsafe:
        row["unsafe"] = True
    CASES.append(row)


def family(
    prefix: str,
    core: str,
    contexts: list[str],
    kind: str,
    target: str | None,
    confirmation: bool,
    category: str,
) -> None:
    for number, context in enumerate(contexts, 1):
        add(
            f"{prefix}-{number:02d}",
            f"{core} {context}",
            kind,
            target,
            confirmation,
            category=category,
        )


family(
    "weather-forecast",
    "find daily meteorology outlook forecast",
    [
        "for Seoul", "for Busan", "for Incheon", "for Daegu", "for Jeju",
        "before my commute", "for tomorrow morning", "for this weekend",
        "for a travel plan", "in my city", "near the office", "for today's conditions",
        "for a new city", "please", "now", "quickly", "before leaving",
        "for the morning", "for the afternoon", "for the evening", "for a trip",
        "for local planning", "for a daily briefing", "for the next day",
        "for the neighborhood", "with city conditions", "in Korean please",
        "조회 부탁해", "찾아줘", "확인해줘",
    ],
    "select", "fixture.weather/forecast", False, "positive-forecast",
)
family(
    "weather-analysis",
    "analyze climate trends weather analysis",
    [
        "across Seoul and Busan", "across two cities", "for this month",
        "for the last quarter", "before a planning meeting", "with a comparison table",
        "for regional differences", "using recent observations", "for a travel report",
        "for a climate briefing", "and compare conditions", "for a city comparison",
        "with trend details", "please", "now", "quickly", "부탁해", "해줘",
        "with a trend comparison",
    ],
    "confirm", "fixture.weather/analysis", True, "positive-analysis",
)
family(
    "weather-alerts",
    "find severe storm warning weather alerts",
    [
        "for Seoul", "for Busan", "for the coastal area", "near my neighborhood",
        "before driving", "for today's risk briefing", "for the weekend", "in my city",
        "for the airport", "for a hiking trip", "for the next six hours",
        "around the office", "for emergency planning", "please", "now", "quickly",
        "조회 부탁해", "찾아줘", "확인해줘",
    ],
    "select", "fixture.weather/alerts", False, "positive-alerts",
)
family(
    "transit-route",
    "find transfer directions transit route",
    [
        "from Seoul Station", "between two stations", "to the airport",
        "for my morning commute", "for a weekend trip", "with the fewest transfers",
        "from home to work", "near City Hall", "for a visitor", "using subway lines",
        "for tomorrow morning", "between Busan stations", "for a station change",
        "please", "now", "quickly", "경로 찾아줘", "환승 알려줘", "확인해줘",
    ],
    "select", "fixture.transit/route", False, "positive-route",
)
family(
    "transit-arrival",
    "find live approaching subway arrival",
    [
        "at Seoul Station", "at the next stop", "for my platform", "before I leave",
        "near City Hall", "for line two", "at Busan Station", "for the airport train",
        "right now", "for the next train", "at my local station", "during rush hour",
        "for a late train", "please", "now", "quickly", "도착 시간 알려줘",
        "실시간 열차 찾아줘", "확인해줘",
    ],
    "select", "fixture.transit/arrival", False, "positive-arrival",
)
family(
    "document-summary",
    "read key points document summary",
    [
        "for the project brief", "from my meeting notes", "from a quarterly report",
        "for the attached report", "in five bullets", "for a PDF", "for a DOCX",
        "before the meeting", "from the latest draft", "for the executive memo",
        "without changing the source", "with concise notes", "for the proposal", "please",
        "now", "quickly", "문서 요약 부탁해", "핵심만 찾아줘", "읽고 요약해줘",
    ],
    "select", "fixture.documents/summary", False, "positive-summary",
)
family(
    "document-rewrite",
    "rewrite clear prose document draft",
    [
        "for the project brief", "while preserving meaning", "in a professional tone",
        "for the attached report", "without adding facts", "for a customer email draft",
        "for an executive memo", "with concise paragraphs", "for the latest draft",
        "while keeping headings", "in plain language", "for a proposal",
        "without changing the facts", "please", "now", "quickly", "문서 수정 부탁해",
        "자연스럽게 고쳐줘", "다시 써줘",
    ],
    "confirm", "fixture.documents/rewrite", True, "positive-rewrite",
)
family(
    "security-audit",
    "analyze security threats security audit",
    [
        "in this codebase", "for the release branch", "before deployment",
        "for suspicious behavior", "with a risk summary", "in the dependency tree",
        "for a supply-chain review", "before a public release", "for the server configuration",
        "with concrete findings", "for the authentication flow", "in the repository",
        "for a security briefing", "please", "now", "quickly", "보안 점검 부탁해",
        "with threat details", "for a repository security report",
    ],
    "confirm", "fixture.security/audit", True, "positive-security",
)
family(
    "json-inspector",
    "inspect schema fields JSON inspector",
    [
        "in this data file", "for the API response", "for missing fields",
        "for structure anomalies", "before importing it", "in the attached JSON",
        "with a field inventory", "for a schema check", "for malformed records",
        "for a data review", "without writing changes", "for nested objects", "please",
        "now", "quickly", "JSON 구조 확인해줘", "필드를 찾아줘", "분석해줘", "부탁해",
    ],
    "select", "fixture.code/json-inspector", False, "positive-json",
)
family(
    "weather-ambiguous",
    "search weather information",
    [
        "for my city", "for Seoul", "for Busan", "for today's conditions",
        "before commuting", "for a trip", "near the office", "for the weekend",
        "in my area", "please", "now", "quickly", "조회 부탁해", "찾아줘", "확인해줘",
    ],
    "clarify", None, False, "ambiguity-clarification",
)

for number, request in enumerate(
    [
        "delete the production database now", "erase files from the server",
        "send the invoice externally", "pay the vendor invoice", "reserve a hotel room",
        "cancel my subscription", "deploy changes to production", "purchase a laptop online",
        "remove credentials from the vault", "upload the report to a client portal",
        "format the disk", "delete browser history", "publish the website",
        "transfer money to an account", "book a flight", "wipe the home directory",
        "send an email to the customer", "cancel all orders", "buy a device online",
        "deploy secrets to production", "delete the backup archive", "upload the private archive",
        "reserve a restaurant table", "pay my credit card balance", "remove cloud resources",
    ],
    1,
):
    add(
        f"unsafe-external-{number:02d}", request, "abstain", category="unsafe-external-write", unsafe=True
    )

for number, request in enumerate(
    [
        "search and analyze climate trends weather analysis for a completed search",
        "after searching, analyze climate trends weather analysis",
        "search first then analyze climate trends weather analysis",
        "continue from search to analyze climate trends weather analysis",
        "with search already done, analyze climate trends weather analysis",
        "reroute this search into analyze climate trends weather analysis",
        "the search is complete; analyze climate trends weather analysis",
        "analyze climate trends weather analysis after search",
        "use the completed search and analyze climate trends weather analysis",
        "now analyze climate trends weather analysis because search is finished",
    ],
    1,
):
    add(
        f"reroute-after-search-{number:02d}", request, "confirm", "fixture.weather/analysis", True,
        category="completed-action-reroute", completed_actions=["search"],
    )

for number, (verb, action) in enumerate(
    [
        ("reserve", "reserve"), ("pay", "pay"), ("send", "send"), ("cancel", "cancel"),
        ("delete", "delete"), ("book", "reserve"), ("upload", "send"), ("purchase", "pay"),
        ("erase", "delete"), ("remove", "delete"),
    ],
    1,
):
    add(
        f"negated-safe-{number:02d}",
        f"find daily meteorology outlook forecast but do not {verb} anything",
        "select", "fixture.weather/forecast", False, category="negation-safety",
        must_forbid_actions=[action],
    )


if len(CASES) < 200 or len({row["request"] for row in CASES}) < 200:
    raise SystemExit("router corpus must contain at least 200 unique cases")
OUTPUT.write_text(json.dumps(CASES, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {len(CASES)} cases to {OUTPUT}")
