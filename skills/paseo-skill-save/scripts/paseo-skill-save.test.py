from __future__ import annotations

import importlib.util
import io
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("paseo-skill-save.py")
SPEC = importlib.util.spec_from_file_location("paseo_skill_save", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def response(
    payload: dict, returncode: int = 0, stderr: str = ""
) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([], returncode, json.dumps(payload), stderr)


def fake_runtime() -> object:
    return MODULE.ManagerRuntime(
        command=(MODULE.sys.executable, "-m", "skillhub"),
        details={"mode": "test"},
    )


def signed_receipt(*, high: int = 0, medium: int = 0, source: dict | None = None) -> dict:
    contract = MODULE._load_policy_contract()
    source = source or {
        "kind": "github",
        "repository": "https://github.com/example/repo",
        "commit": "a" * 40,
        "tree": "c" * 40,
        "path": "skills/demo",
        "skill_manifest": True,
    }
    findings = []
    for index in range(high):
        row = {
            "severity": "High", "rule_id": "test.blocking", "path": "run.sh",
            "line": index + 1, "source_role": "executable", "reason": "test",
            "evidence": "blocked fixture", "confidence": "high", "mitigation": "remove it",
            "capabilities": ["subprocess"], "blocks": True, "review": False,
        }
        row["finding_id"] = contract.finding_id(row)
        findings.append(row)
    for index in range(medium):
        row = {
            "severity": "Medium", "rule_id": "test.review", "path": "helper.py",
            "line": index + 1, "source_role": "executable", "reason": "test",
            "evidence": "review fixture", "confidence": "medium", "mitigation": "review it",
            "capabilities": ["subprocess"], "blocks": False, "review": True,
        }
        row["finding_id"] = contract.finding_id(row)
        findings.append(row)
    checksum = "b" * 64
    security_policy = contract.build_policy(
        source=source, checksum=checksum, findings=findings, scanner_schema_version=2
    )
    receipt = {
        "status": "scan-complete",
        "scanner": {
            "name": "paseo-spyware-check",
            "schema_version": 2,
            "mode": "bundled-python-static",
        },
        "target": "fixture",
        "source": source,
        "pinned_source": None,
        "content_checksum": checksum,
        "verdict": "high" if high else ("medium" if medium else "low"),
        "counts": {"critical": 0, "high": high, "medium": medium, "info": 0},
        "findings": findings,
        "scan": {
            "schema_version": 2,
            "files_considered": 1,
            "files_scanned": 1,
            "max_findings": 500,
            "max_scan_bytes_per_file": 2 * 1024 * 1024,
            "truncated": False,
            "truncation_reasons": [],
            "target_code_executed": False,
        },
        "policy": security_policy,
        "limitations": [],
    }
    canonical = json.dumps(
        receipt, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    receipt["receipt_sha256"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return receipt


def inspection_record(catalog_id: str = "overlay.demo", *, receipt: dict | None = None, source: dict | None = None, risk: str = "instructions-only", activation_policy: str = "on-demand") -> dict:
    receipt = receipt or signed_receipt(source=source)
    return {
        "catalog_id": catalog_id,
        "source": receipt["source"],
        "revision": receipt["source"].get("commit", ""),
        "risk": risk,
        "activation_policy": activation_policy,
        "archive": {"license": {"declared": "MIT"}},
        "verification": {
            "checksum": receipt["content_checksum"],
            "security_policy_sha256": MODULE._load_policy_contract().policy_digest(receipt["policy"]),
        },
        "trust_verdict": {"verdict": "installable-caution"},
        "security_policy": receipt["policy"],
    }


class PaseoSkillSaveTests(unittest.TestCase):
    def setUp(self) -> None:
        self.gate = mock.patch.object(
            MODULE,
            "_run_spyware_gate",
            side_effect=lambda args, _workspace: (signed_receipt(), args.source),
        )
        self.gate.start()
        self.addCleanup(self.gate.stop)

    def test_add_verify_and_search_use_argv_without_shell(self) -> None:
        replies = [
            response(
                {
                    "status": "added-to-personal-library",
                    "sync": "pushed",
                    "items": [
                        {
                            "catalog_id": "overlay.demo",
                            "routing": {"description_ko": "회의 내용을 정리합니다"},
                        }
                    ],
                }
            ),
            response({"status": "verified"}),
            response(
                inspection_record()
            ),
            response({"results": [{"catalog_id": "overlay.demo"}]}),
        ]
        with mock.patch.object(
            MODULE, "_bootstrap_manager", return_value=fake_runtime()
        ), mock.patch.object(MODULE.subprocess, "run", side_effect=replies) as run:
            args = MODULE.build_parser().parse_args(
                [
                    "https://github.com/example/repo/tree/main/skills/demo",
                    "--description-ko",
                    "회의 내용을 정리합니다",
                    "--tag-ko",
                    "회의",
                    "--router-target",
                    "claude",
                ]
            )
            result = MODULE.save_skill(args)

        self.assertTrue(result["search_discovery_ready"])
        self.assertFalse(result["automatic_discovery_ready"])
        self.assertFalse(result["natural_language_ready"])
        self.assertFalse(result["automatic_use_ready"])
        self.assertEqual(result["router"]["status"], "not-installed")
        self.assertEqual(result["router"]["mode"], "explicit-only")
        self.assertEqual(result["records"][0]["source"]["commit"], "a" * 40)
        self.assertEqual(result["records"][0]["checksum"], "b" * 64)
        self.assertEqual(result["records"][0]["security_policy"]["visibility"], "private")
        self.assertEqual(result["records"][0]["security_policy"]["approval"]["global_trust_effect"], "none")
        self.assertEqual(result["library_sync"]["status"], "pushed")

        for call in run.call_args_list:
            self.assertNotIn("shell", call.kwargs)
            self.assertEqual(call.kwargs["env"]["PYTHONIOENCODING"], "utf-8")
            self.assertEqual(call.kwargs["env"]["PYTHONUTF8"], "1")
        add_call = run.call_args_list[0]
        self.assertEqual(add_call.args[0][-1], "--json")
        self.assertIn(
            "https://github.com/example/repo/tree/main/skills/demo",
            add_call.args[0],
        )
        commands = [call.args[0] for call in run.call_args_list]
        self.assertFalse(any("init" in command for command in commands))
        self.assertFalse(any("match" in command for command in commands))

    def test_local_only_is_forwarded_explicitly(self) -> None:
        args = MODULE.build_parser().parse_args(["fixture", "--local-only"])
        command = MODULE._build_add_command(args, ["python", "skillhub.py"])
        self.assertIn("--local-only", command)

        default_args = MODULE.build_parser().parse_args(["fixture"])
        default_command = MODULE._build_add_command(
            default_args, ["python", "skillhub.py"]
        )
        self.assertNotIn("--local-only", default_command)

    def test_default_add_command_omits_domain_and_action(self) -> None:
        args = MODULE.build_parser().parse_args(
            [
                "fixture",
                "--description-ko",
                "회의 내용을 정리합니다",
                "--tag-ko",
                "회의록",
            ]
        )
        command = MODULE._build_add_command(args, ["python", "skillhub.py"])
        self.assertIn("--description-ko", command)
        self.assertIn("회의 내용을 정리합니다", command)
        self.assertIn("--tag-ko", command)
        self.assertIn("회의록", command)
        self.assertNotIn("--domain", command)
        self.assertNotIn("--action", command)

        with_routing = MODULE.build_parser().parse_args(
            [
                "fixture",
                "--description-ko",
                "설명",
                "--domain",
                "documents",
                "--action",
                "read",
            ]
        )
        routed = MODULE._build_add_command(with_routing, ["python", "skillhub.py"])
        self.assertIn("--domain", routed)
        self.assertIn("documents", routed)
        self.assertIn("--action", routed)
        self.assertIn("read", routed)

    def test_invalid_routing_metadata_maps_to_actionable_error(self) -> None:
        failed = response(
            {},
            returncode=2,
            stderr='{"status":"error","code":"error","error":"unknown routing domain(s): invented-domain"}',
        )
        with mock.patch.object(
            MODULE, "_bootstrap_manager", return_value=fake_runtime()
        ), mock.patch.object(
            MODULE.subprocess,
            "run",
            side_effect=[failed],
        ):
            args = MODULE.build_parser().parse_args(
                [
                    "https://github.com/example/repo",
                    "--description-ko",
                    "설명",
                    "--domain",
                    "invented-domain",
                ]
            )
            with self.assertRaises(MODULE.SaveError) as raised:
                MODULE.save_skill(args)
        self.assertEqual(raised.exception.code, "invalid-routing-metadata")
        message = str(raised.exception)
        self.assertIn("Retry without --domain/--action", message)
        self.assertIn("verified taxonomy", message.lower())
        self.assertIn("invented-domain", raised.exception.detail)

        action_failed = response(
            {},
            returncode=2,
            stderr="error: unknown routing action(s): made-up-action",
        )
        with self.assertRaises(MODULE.SaveError) as raised_action:
            MODULE._raise_manager_failure(action_failed)
        self.assertEqual(raised_action.exception.code, "invalid-routing-metadata")

        generic = response({}, returncode=1, stderr="something else failed")
        with self.assertRaises(MODULE.SaveError) as raised_generic:
            MODULE._raise_manager_failure(generic)
        self.assertEqual(raised_generic.exception.code, "manager-command-failed")

    def test_missing_manager_has_clear_error(self) -> None:
        failed = response({}, returncode=1, stderr="No module named skillhub")
        with mock.patch.object(
            MODULE, "_bootstrap_manager", return_value=fake_runtime()
        ), mock.patch.object(MODULE.subprocess, "run", return_value=failed):
            args = MODULE.build_parser().parse_args(
                ["https://github.com/example/repo"]
            )
            with self.assertRaises(MODULE.SaveError) as raised:
                MODULE.save_skill(args)
        self.assertEqual(raised.exception.code, "manager-runtime-unavailable")

    def test_main_succeeds_without_automatic_match(self) -> None:
        replies = [
            response(
                {
                    "status": "added-to-personal-library",
                    "sync": "pushed",
                    "items": [
                        {
                            "catalog_id": "overlay.demo",
                            "routing": {"description_ko": "설명"},
                        }
                    ],
                }
            ),
            response({"status": "verified"}),
            response(
                inspection_record()
            ),
            response({"results": [{"catalog_id": "overlay.demo"}]}),
        ]
        output = io.StringIO()
        with mock.patch.object(
            MODULE, "_bootstrap_manager", return_value=fake_runtime()
        ), mock.patch.object(MODULE.subprocess, "run", side_effect=replies), mock.patch(
            "sys.stdout", output
        ):
            code = MODULE.main(["https://github.com/example/repo"])
        payload = json.loads(output.getvalue())
        self.assertEqual(code, 0)
        self.assertTrue(payload["search_discovery_ready"])
        self.assertFalse(payload["natural_language_ready"])
        self.assertFalse(payload["automatic_use_ready"])

    def test_script_skill_is_archived_without_automatic_activation(self) -> None:
        replies = [
            response(
                {
                    "status": "added-to-personal-library",
                    "items": [
                        {
                            "catalog_id": "overlay.scripted",
                            "routing": {"description_ko": "도구를 실행합니다"},
                        }
                    ],
                }
            ),
            response({"status": "verified"}),
            response(
                inspection_record("overlay.scripted", risk="scripts", activation_policy="manual")
            ),
            response({"results": [{"catalog_id": "overlay.scripted"}]}),
        ]
        with mock.patch.object(
            MODULE, "_bootstrap_manager", return_value=fake_runtime()
        ), mock.patch.object(MODULE.subprocess, "run", side_effect=replies):
            args = MODULE.build_parser().parse_args(
                ["https://github.com/example/repo/tree/main/skills/scripted"]
            )
            result = MODULE.save_skill(args)
        self.assertTrue(result["search_discovery_ready"])
        self.assertFalse(result["natural_language_ready"])
        self.assertFalse(result["automatic_use_ready"])
        self.assertEqual(result["records"][0]["activation_policy"], "manual")

    def test_auto_bootstrap_fetches_reuses_and_detects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            (source / "scripts").mkdir(parents=True)
            (source / "skillhub").mkdir()
            (source / "scripts" / "skillhub.py").write_text(
                "print('manager')\n", encoding="utf-8"
            )
            (source / "skillhub" / "__init__.py").write_text("", encoding="utf-8")
            subprocess.run(["git", "init", str(source)], check=True, capture_output=True)
            subprocess.run(
                ["git", "-C", str(source), "config", "user.email", "test@example.com"],
                check=True,
            )
            subprocess.run(
                ["git", "-C", str(source), "config", "user.name", "Test"], check=True
            )
            subprocess.run(
                ["git", "-C", str(source), "add", "."], check=True
            )
            subprocess.run(
                ["git", "-C", str(source), "commit", "-m", "fixture"],
                check=True,
                capture_output=True,
            )
            revision = subprocess.run(
                ["git", "-C", str(source), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            tree = subprocess.run(
                ["git", "-C", str(source), "rev-parse", "HEAD^{tree}"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            args = MODULE.build_parser().parse_args(
                ["https://github.com/example/skill", "--home", str(root / "home")]
            )
            with mock.patch.object(MODULE, "MANAGER_REPOSITORY", str(source)), mock.patch.object(
                MODULE, "MANAGER_REVISION", revision
            ), mock.patch.object(MODULE, "MANAGER_TREE", tree), mock.patch.object(
                MODULE, "_installed_private_manager", return_value=None
            ), mock.patch.object(MODULE, "_bundled_manager", return_value=None):
                runtime = MODULE._bootstrap_manager(args)
                self.assertEqual(runtime.details["mode"], "auto-pinned")
                self.assertEqual(runtime.details["revision"], revision)
                checkout = Path(runtime.details["path"])
                self.assertTrue((checkout / "scripts" / "skillhub.py").is_file())

                source.rename(root / "source-offline")
                reused = MODULE._bootstrap_manager(args)
                self.assertEqual(reused.details["path"], runtime.details["path"])

                (checkout / "scripts" / "skillhub.py").write_text(
                    "print('tampered')\n", encoding="utf-8"
                )
                with self.assertRaises(MODULE.SaveError) as raised:
                    MODULE._bootstrap_manager(args)
                self.assertEqual(raised.exception.code, "manager-verification-failed")

    def _write_managed_runtime(self, state: Path, *, private_items: int) -> Path:
        root = state / "runtime" / "manager-fixture" / "source"
        (root / "scripts").mkdir(parents=True)
        (root / "skillhub").mkdir()
        (root / "catalog").mkdir()
        (root / "profiles").mkdir()
        (root / "schemas").mkdir()
        (root / "skills" / "skill-hub-router").mkdir(parents=True)
        (root / "scripts" / "skillhub.py").write_text("print('fixture')\n", encoding="utf-8")
        (root / "skillhub" / "__init__.py").write_text("", encoding="utf-8")
        (root / "skills" / "skill-hub-router" / "SKILL.md").write_text(
            "---\nname: skill-hub-router\ndescription: fixture\n---\n", encoding="utf-8"
        )
        (root / "LICENSE").write_text("fixture\n", encoding="utf-8")
        (root / "NOTICE").write_text("fixture\n", encoding="utf-8")
        items = [
            {"catalog_id": f"private.{index}", "source_id": "private-library"}
            for index in range(private_items)
        ]
        (root / "registry.json").write_text(
            json.dumps({"skills": items}), encoding="utf-8"
        )
        digest = MODULE._manager_payload_digest(root)
        (state / "runtime" / "manager.json").write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "path": str(root),
                    "content_digest": digest,
                    "source_kind": "checkout-copy",
                    "revision": "fixture-private",
                }
            ),
            encoding="utf-8",
        )
        return root

    def test_installed_private_runtime_precedes_bundled_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state"
            root = self._write_managed_runtime(state, private_items=3)
            args = MODULE.build_parser().parse_args(
                ["fixture", "--state-dir", str(state)]
            )

            runtime = MODULE._bootstrap_manager(args)

        self.assertEqual(runtime.details["mode"], "installed-private-runtime")
        self.assertEqual(runtime.details["private_catalog_items"], 3)
        self.assertEqual(Path(runtime.details["path"]).resolve(), root.resolve())

    def test_manager_only_runtime_is_preferred_over_bundled_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "state"
            self._write_managed_runtime(state, private_items=0)
            args = MODULE.build_parser().parse_args(
                ["fixture", "--state-dir", str(state)]
            )

            runtime = MODULE._bootstrap_manager(args)

        self.assertEqual(runtime.details["mode"], "installed-private-runtime")
        self.assertEqual(runtime.details["private_catalog_items"], 0)

    def test_high_findings_are_archived_for_blocked_activation(self) -> None:
        self.gate.stop()
        module = mock.Mock()
        module.scan_target.return_value = (signed_receipt(high=1), "fixture")
        args = MODULE.build_parser().parse_args(["fixture"])
        with mock.patch.object(MODULE, "_load_spyware_scanner", return_value=module):
            receipt, source = MODULE._run_spyware_gate(args, Path(tempfile.mkdtemp()))
        self.assertEqual(receipt["counts"]["high"], 1)
        self.assertEqual(source, "fixture")

    def test_medium_findings_are_archived_before_activation_approval(self) -> None:
        self.gate.stop()
        module = mock.Mock()
        module.scan_target.return_value = (signed_receipt(medium=1), "fixture")
        with mock.patch.object(MODULE, "_load_spyware_scanner", return_value=module):
            args = MODULE.build_parser().parse_args(["fixture"])
            receipt, source = MODULE._run_spyware_gate(args, Path(tempfile.mkdtemp()))
            self.assertEqual(receipt["counts"]["medium"], 1)
            self.assertEqual(source, "fixture")

            approved = MODULE.build_parser().parse_args(
                ["fixture", "--approve-medium"]
            )
            receipt, source = MODULE._run_spyware_gate(
                approved, Path(tempfile.mkdtemp())
            )
        self.assertEqual(receipt["counts"]["medium"], 1)
        self.assertEqual(source, "fixture")

    def test_scan_receipt_mismatch_is_rejected(self) -> None:
        receipt = signed_receipt()
        receipt["source"] = {
            "kind": "github",
            "commit": "a" * 40,
            "path": "skills/demo",
        }
        record = {
            "source": {"commit": "c" * 40, "path": "skills/demo"},
            "checksum": "b" * 64,
        }
        with self.assertRaises(MODULE.SaveError) as raised:
            MODULE._bind_record_to_scan(receipt, record)
        self.assertEqual(raised.exception.code, "scan-receipt-mismatch")

    def test_local_scan_checksum_mismatch_is_rejected(self) -> None:
        receipt = signed_receipt()
        receipt["source"]["skill_manifest"] = True
        record = {"source": {}, "checksum": "c" * 64}
        with self.assertRaises(MODULE.SaveError) as raised:
            MODULE._bind_record_to_scan(receipt, record)
        self.assertEqual(raised.exception.code, "scan-receipt-mismatch")

    def test_failed_scan_runs_before_manager_bootstrap(self) -> None:
        self.gate.stop()
        args = MODULE.build_parser().parse_args(["fixture"])
        with mock.patch.object(
            MODULE,
            "_run_spyware_gate",
            side_effect=MODULE.SaveError("spyware-check-blocked", "blocked"),
        ), mock.patch.object(MODULE, "_bootstrap_manager") as bootstrap:
            with self.assertRaises(MODULE.SaveError) as raised:
                MODULE.save_skill(args)
        self.assertEqual(raised.exception.code, "spyware-check-blocked")
        bootstrap.assert_not_called()

    def test_receipt_with_finding_count_mismatch_is_rejected(self) -> None:
        receipt = signed_receipt()
        receipt["findings"].append(
            {"severity": "High", "path": "fixture", "line": 1, "reason": "test"}
        )
        canonical = json.dumps(
            {key: value for key, value in receipt.items() if key != "receipt_sha256"},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        receipt["receipt_sha256"] = hashlib.sha256(
            canonical.encode("utf-8")
        ).hexdigest()
        with self.assertRaises(MODULE.SaveError) as raised:
            MODULE._validate_scan_receipt(receipt)
        self.assertEqual(raised.exception.code, "spyware-check-invalid")


if __name__ == "__main__":
    unittest.main()
