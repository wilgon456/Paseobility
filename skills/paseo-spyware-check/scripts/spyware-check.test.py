from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("spyware-check.py")
SPEC = importlib.util.spec_from_file_location("paseo_spyware_check", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class SpywareCheckTests(unittest.TestCase):
    def _skill(self, root: Path, body: str) -> Path:
        skill = root / "source"
        skill.mkdir()
        (skill / "SKILL.md").write_text(
            "---\nname: fixture\ndescription: Test fixture.\n---\n\n" + body,
            encoding="utf-8",
        )
        return skill

    def test_clean_local_source_is_snapshotted_and_receipted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self._skill(root, "Explain the supplied topic clearly.\n")
            receipt, add_source = MODULE.scan_target(
                str(source), root / "workspace", timeout=10
            )
            snapshot = Path(add_source)
            self.assertNotEqual(snapshot, source)
            self.assertTrue(snapshot.is_dir())
            self.assertEqual(receipt["verdict"], "low")
            self.assertEqual(receipt["counts"]["high"], 0)
            self.assertEqual(
                receipt["content_checksum"], MODULE.directory_checksum(snapshot)
            )
            self.assertEqual(len(receipt["receipt_sha256"]), 64)

    def test_dynamic_execution_is_medium(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self._skill(root, "Use the helper script when requested.\n")
            (source / "helper.py").write_text("eval(user_input)\n", encoding="utf-8")
            receipt, _ = MODULE.scan_target(str(source), root / "workspace", timeout=10)
            self.assertEqual(receipt["verdict"], "medium")
            self.assertGreater(receipt["counts"]["medium"], 0)

    def test_private_key_marker_is_high(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self._skill(root, "Use the bundled configuration.\n")
            (source / "secret.txt").write_text(
                "-----BEGIN PRIVATE KEY-----\nfixture\n", encoding="utf-8"
            )
            receipt, _ = MODULE.scan_target(str(source), root / "workspace", timeout=10)
            self.assertEqual(receipt["verdict"], "high")
            self.assertGreater(receipt["counts"]["high"], 0)

    def test_unsafe_github_url_is_rejected(self) -> None:
        with self.assertRaises(MODULE.ScanError) as raised:
            MODULE._parse_github_source(
                "https://user:secret@github.com/example/repo?token=secret"
            )
        self.assertEqual(raised.exception.code, "invalid-github-url")

    def test_scanner_self_references_are_informational(self) -> None:
        skill_root = SCRIPT.parents[1]
        findings = MODULE._scan_files(skill_root)
        self.assertTrue(findings)
        self.assertTrue(all(row["severity"] == "Info" for row in findings))

    def test_finding_evidence_redacts_secret_values(self) -> None:
        secret = "ghp_123456789012345678901234567890"
        evidence = MODULE._redact_evidence(f"GITHUB_TOKEN={secret}")
        self.assertNotIn(secret, evidence)
        self.assertIn("<redacted", evidence)


if __name__ == "__main__":
    unittest.main()
