"""Exercise installation/migration in isolated homes; never contact Paseo."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
RETIRED = ("paseo-agent-tournament", "paseo-session-brief",
           "paseo-project-bootstrap", "paseo-computer-use", "paseo-skill-save")


class SkillMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="paseobility-migration-")
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)

    def seed(self, base=".agents"):
        for name in RETIRED:
            dest = self.home / base / "skills" / name
            dest.mkdir(parents=True)
            (dest / "SKILL.md").write_text(f"---\nname: {name}\n---\n")
            (dest / "local-note.txt").write_text(f"preserve {name}")

    def install(self, *args):
        return subprocess.run(
            ["bash", str(ROOT / "scripts/paseobility-init.sh"),
             "--target-home", str(self.home), "--root", str(ROOT),
             "--no-context", "--no-paseo-check", *args],
            capture_output=True, text=True, timeout=30)

    def assert_success(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_full_migration_preserves_retired_local_edits_and_private_state(self):
        for base in (".agents", ".claude"):
            self.seed(base)
        private = self.home / ".local/state/ai-skill-library/private-marker"
        private.parent.mkdir(parents=True)
        private.write_text("untouched")
        unrelated = self.home / ".agents/skills/unrelated/SKILL.md"
        unrelated.parent.mkdir(parents=True)
        unrelated.write_text("unrelated")
        self.assert_success(self.install("--migrate-skills", "--with-claude"))
        expected = json.loads((ROOT / "paseobility.json").read_text())["skills"]
        self.assertEqual(len(expected), 7)
        for base in (".agents", ".claude"):
            for name in RETIRED:
                self.assertFalse((self.home / base / "skills" / name).exists())
                copies = list((self.home / base / "skills-backups").glob(f"*/{name}/local-note.txt"))
                self.assertEqual(len(copies), 1)
                self.assertEqual(copies[0].read_text(), f"preserve {name}")
            for name in expected:
                self.assertEqual((self.home / base / "skills" / name / "SKILL.md").read_bytes(),
                                 (ROOT / "skills" / name / "SKILL.md").read_bytes())
        self.assertEqual(private.read_text(), "untouched")
        self.assertEqual(unrelated.read_text(), "unrelated")

    def test_single_skill_migrates_only_its_predecessors(self):
        self.seed()
        self.assert_success(self.install("--skill", "paseo-project", "--migrate-skills"))
        for name in RETIRED:
            self.assertEqual((self.home / ".agents/skills" / name).exists(),
                             name not in ("paseo-session-brief", "paseo-project-bootstrap"))
        self.assertFalse((self.home / ".claude").exists())

    def test_no_migration_flag_preserves_old_entries(self):
        self.seed()
        self.assert_success(self.install())
        for name in RETIRED:
            self.assertTrue((self.home / ".agents/skills" / name).exists())

    def test_repeated_migration_keeps_original_backup(self):
        self.seed()
        self.assert_success(self.install("--migrate-skills"))
        self.assert_success(self.install("--migrate-skills"))
        for name in RETIRED:
            copies = list((self.home / ".agents/skills-backups").glob(f"*/{name}/local-note.txt"))
            self.assertEqual(len(copies), 1)
            self.assertEqual(copies[0].read_text(), f"preserve {name}")

    def test_no_backup_does_not_discard_retired_entries(self):
        self.seed()
        self.assert_success(self.install("--no-backup", "--migrate-skills"))
        for name in RETIRED:
            self.assertEqual(len(list((self.home / ".agents/skills-backups").glob(f"*/{name}/local-note.txt"))), 1)

    def test_unknown_ownership_aborts_before_installation(self):
        self.seed()
        old = self.home / ".agents/skills/paseo-session-brief/SKILL.md"
        old.write_text("---\nname: unrelated\n---\n")
        self.assertNotEqual(self.install("--migrate-skills").returncode, 0)
        self.assertEqual(old.read_text(), "---\nname: unrelated\n---\n")
        self.assertFalse((self.home / ".agents/skills/paseo-project").exists())

    def test_symlink_aborts_without_touching_target(self):
        outside = self.home / "outside"
        outside.mkdir()
        (outside / "marker").write_text("keep")
        skill = self.home / ".agents/skills/paseo-session-brief"
        skill.parent.mkdir(parents=True)
        skill.symlink_to(outside, target_is_directory=True)
        self.assertNotEqual(self.install("--migrate-skills").returncode, 0)
        self.assertTrue(skill.is_symlink())
        self.assertEqual((outside / "marker").read_text(), "keep")


if __name__ == "__main__":
    unittest.main()
