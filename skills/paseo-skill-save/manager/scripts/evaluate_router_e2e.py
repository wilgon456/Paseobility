#!/usr/bin/env python3
"""Evaluate deterministic natural-language routing against a substantive suite."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import sys
import tempfile
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASES = ROOT / "tests" / "router_e2e_cases_200.json"
DEFAULT_CATALOG = ROOT / "tests" / "router_eval_catalog.json"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from skillhub import matching


class EvaluationError(RuntimeError):
    """The evaluation inputs or deterministic router output are malformed."""


def state_files(root: Path) -> tuple[str, ...]:
    if not root.exists():
        return ()
    return tuple(sorted(path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()))


def run_match(case: dict[str, Any], catalog: list[dict[str, Any]]) -> dict[str, Any]:
    return matching.match_request(
        str(case["request"]),
        client="codex",
        operating_system="windows",
        max_risk=case.get("max_risk"),
        limit=5,
        completed_actions=case.get("completed_actions", []),
        satisfied_anchors=case.get("satisfied_anchors", []),
        catalog_records=copy.deepcopy(catalog),
    )


def evaluate(cases_path: Path, catalog_path: Path = DEFAULT_CATALOG) -> dict[str, Any]:
    cases = json.loads(cases_path.read_text(encoding="utf-8"))
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    if not isinstance(cases, list) or len(cases) < 200:
        raise EvaluationError("the expanded E2E suite must contain at least 200 cases")
    if len({str(case.get("request")) for case in cases if isinstance(case, dict)}) < 200:
        raise EvaluationError("the expanded E2E suite must contain at least 200 unique requests")
    if not isinstance(catalog, list) or len(catalog) < 5:
        raise EvaluationError("the evaluation catalog must contain meaningful near-collision fixtures")

    results: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="skillhub-router-e2e-") as raw:
        isolated = Path(raw)
        before = state_files(isolated)
        for case in cases:
            if not isinstance(case, dict) or not isinstance(case.get("expected"), dict):
                raise EvaluationError("every case must contain an expected object")
            expected = case["expected"]
            output = run_match(case, catalog)
            decision = output.get("decision", {})
            frame = output.get("task_frame", {})
            errors: list[str] = []
            expected_kind = expected.get("kind")
            if decision.get("status") != expected_kind:
                errors.append(f"status expected {expected_kind}, got {decision.get('status')}")
            expected_id = expected.get("id")
            selected_ids = decision.get("selected_ids", [])
            if expected_id is not None and selected_ids != [expected_id]:
                errors.append(f"selection expected {[expected_id]}, got {selected_ids}")
            if expected_id is None and selected_ids:
                errors.append(f"expected no selection, got {selected_ids}")
            expected_confirmation = bool(expected.get("requires_confirmation", expected_kind == "confirm"))
            if bool(decision.get("requires_user_confirmation")) != expected_confirmation:
                errors.append(
                    f"confirmation expected {expected_confirmation}, got {decision.get('requires_user_confirmation')}"
                )
            for action in expected.get("must_forbid_actions", []):
                if action not in frame.get("forbidden_actions", []):
                    errors.append(f"missing forbidden action: {action}")
            for action in expected.get("must_not_request_actions", []):
                if action in frame.get("requested_actions", []):
                    errors.append(f"misclassified requested action: {action}")
            unsafe_false_select = bool(expected.get("unsafe")) and bool(selected_ids)
            if unsafe_false_select:
                errors.append("unsafe request was selected")
            results.append(
                {
                    "id": case.get("id"),
                    "category": case.get("category"),
                    "passed": not errors,
                    "errors": errors,
                    "status": decision.get("status"),
                    "selected_ids": selected_ids,
                    "requires_user_confirmation": bool(decision.get("requires_user_confirmation")),
                    "unsafe_false_select": unsafe_false_select,
                }
            )
        after = state_files(isolated)

    passed = sum(1 for row in results if row["passed"])
    expected_selection = [row for row, case in zip(results, cases) if case["expected"].get("id") is not None]
    top1_correct = sum(
        1 for row, case in zip(results, cases)
        if case["expected"].get("id") is not None and row["selected_ids"] == [case["expected"]["id"]]
    )
    confirmation_cases = [
        (row, case) for row, case in zip(results, cases) if "requires_confirmation" in case["expected"]
    ]
    confirmation_correct = sum(
        1 for row, case in confirmation_cases
        if row["requires_user_confirmation"] == bool(case["expected"]["requires_confirmation"])
    )
    abstain_clarify_cases = [
        (row, case) for row, case in zip(results, cases) if case["expected"].get("kind") in {"abstain", "clarify"}
    ]
    abstain_clarify_correct = sum(
        1 for row, case in abstain_clarify_cases if row["status"] == case["expected"]["kind"]
    )
    unsafe_false_select_count = sum(1 for row in results if row["unsafe_false_select"])
    state_unchanged = before == after
    return {
        "ok": passed == len(cases) and state_unchanged and unsafe_false_select_count == 0,
        "summary": {
            "cases": len(cases),
            "passed": passed,
            "failed": len(cases) - passed,
            "accuracy": round(passed / len(cases), 4),
            "top1_correct": top1_correct,
            "top1_cases": len(expected_selection),
            "confirmation_correct": confirmation_correct,
            "confirmation_cases": len(confirmation_cases),
            "abstain_clarify_correct": abstain_clarify_correct,
            "abstain_clarify_cases": len(abstain_clarify_cases),
            "unsafe_false_select_count": unsafe_false_select_count,
            "persistent_state_unchanged": state_unchanged,
        },
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = evaluate(args.cases.resolve(), args.catalog.resolve())
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        summary = report["summary"]
        print(
            f"Router E2E: {summary['passed']}/{summary['cases']} passed; "
            f"top1 {summary['top1_correct']}/{summary['top1_cases']}; "
            f"confirmation {summary['confirmation_correct']}/{summary['confirmation_cases']}; "
            f"abstain/clarify {summary['abstain_clarify_correct']}/{summary['abstain_clarify_cases']}; "
            f"unsafe false-select {summary['unsafe_false_select_count']}; "
            f"state unchanged {summary['persistent_state_unchanged']}"
        )
        for row in report["results"]:
            suffix = "" if row["passed"] else " - " + "; ".join(row["errors"])
            print(f"{'PASS' if row['passed'] else 'FAIL'} {row['id']}{suffix}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
