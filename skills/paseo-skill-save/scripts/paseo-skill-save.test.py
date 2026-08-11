from __future__ import annotations

import importlib.util
import io
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


def selected_match(
    catalog_id: str = "overlay.demo",
    *,
    status: str = "select",
    confirmation: bool = False,
    body_available: bool = True,
) -> dict:
    return {
        "decision": {
            "status": status,
            "selected_ids": [catalog_id],
            "requires_user_confirmation": confirmation,
        },
        "agent_adjudication": {
            "candidate_contracts": [
                {
                    "id": catalog_id,
                    "skill_body_evidence": {"available": body_available},
                }
            ]
        },
    }


def fake_runtime() -> object:
    return MODULE.ManagerRuntime(
        command=(MODULE.sys.executable, "-m", "skillhub"),
        details={"mode": "test"},
    )


class PaseoSkillSaveTests(unittest.TestCase):
    def test_add_verify_search_and_match_use_argv_without_shell(self) -> None:
        replies = [
            response({"status": "initialized", "router": "core.skill-hub-router"}),
            response(
                {
                    "status": "added-to-personal-library",
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
                {
                    "catalog_id": "overlay.demo",
                    "source": {"commit": "a" * 40, "path": "skills/demo"},
                    "revision": "a" * 40,
                    "risk": "instructions-only",
                    "activation_policy": "on-demand",
                    "archive": {"license": {"declared": "MIT"}},
                    "verification": {"checksum": "b" * 64},
                    "trust_verdict": {"verdict": "installable-caution"},
                }
            ),
            response({"results": [{"catalog_id": "overlay.demo"}]}),
            response(selected_match()),
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
                ]
            )
            result = MODULE.save_skill(args)

        self.assertTrue(result["automatic_discovery_ready"])
        self.assertTrue(result["natural_language_ready"])
        self.assertTrue(result["automatic_use_ready"])
        self.assertEqual(result["router"]["status"], "initialized")
        self.assertEqual(result["records"][0]["source"]["commit"], "a" * 40)
        self.assertEqual(result["records"][0]["checksum"], "b" * 64)
        self.assertTrue(result["matches"][0]["skill_body_evidence_available"])

        for call in run.call_args_list:
            self.assertNotIn("shell", call.kwargs)
            self.assertEqual(call.kwargs["env"]["PYTHONIOENCODING"], "utf-8")
            self.assertEqual(call.kwargs["env"]["PYTHONUTF8"], "1")
        add_call = run.call_args_list[1]
        self.assertEqual(add_call.args[0][-1], "--json")
        self.assertIn(
            "https://github.com/example/repo/tree/main/skills/demo",
            add_call.args[0],
        )
        match_call = run.call_args_list[5]
        self.assertIn("match", match_call.args[0])
        self.assertIn("--agent-packet", match_call.args[0])
        self.assertIn("codex", match_call.args[0])

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

    def test_main_reports_match_failure(self) -> None:
        replies = [
            response({"status": "initialized", "router": "core.skill-hub-router"}),
            response(
                {
                    "status": "added-to-personal-library",
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
                {
                    "catalog_id": "overlay.demo",
                    "source": {},
                    "verification": {},
                    "risk": "instructions-only",
                    "activation_policy": "on-demand",
                    "archive": {},
                    "trust_verdict": {},
                }
            ),
            response({"results": [{"catalog_id": "overlay.demo"}]}),
            response(
                {
                    "decision": {
                        "status": "abstain",
                        "selected_ids": [],
                        "requires_user_confirmation": False,
                    },
                    "agent_packet": {"candidates": []},
                }
            ),
        ]
        output = io.StringIO()
        with mock.patch.object(
            MODULE, "_bootstrap_manager", return_value=fake_runtime()
        ), mock.patch.object(MODULE.subprocess, "run", side_effect=replies), mock.patch(
            "sys.stdout", output
        ):
            code = MODULE.main(["https://github.com/example/repo"])
        payload = json.loads(output.getvalue())
        self.assertEqual(code, 1)
        self.assertFalse(payload["natural_language_ready"])
        self.assertFalse(payload["automatic_use_ready"])

    def test_script_skill_keeps_confirmation_gate(self) -> None:
        replies = [
            response({"status": "initialized", "router": "core.skill-hub-router"}),
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
                {
                    "catalog_id": "overlay.scripted",
                    "source": {},
                    "verification": {},
                    "risk": "scripts",
                    "activation_policy": "manual",
                    "archive": {},
                    "trust_verdict": {},
                }
            ),
            response({"results": [{"catalog_id": "overlay.scripted"}]}),
            response(
                selected_match(
                    "overlay.scripted",
                    status="confirm",
                    confirmation=True,
                    body_available=False,
                )
            ),
        ]
        with mock.patch.object(
            MODULE, "_bootstrap_manager", return_value=fake_runtime()
        ), mock.patch.object(MODULE.subprocess, "run", side_effect=replies):
            args = MODULE.build_parser().parse_args(
                ["https://github.com/example/repo/tree/main/skills/scripted"]
            )
            result = MODULE.save_skill(args)
        self.assertTrue(result["natural_language_ready"])
        self.assertTrue(result["automatic_use_ready"])
        self.assertTrue(result["matches"][0]["requires_user_confirmation"])

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
            ), mock.patch.object(MODULE, "MANAGER_TREE", tree):
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


if __name__ == "__main__":
    unittest.main()
