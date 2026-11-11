"""Exercise installation/migration in isolated homes; never contact Paseo.

Bash cases drive ``scripts/paseobility-init.sh`` through a POSIX shell and skip
on Windows rather than faking POSIX symlink semantics. Native installer cases
run separately when PowerShell is available.
"""
import errno
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
RETIRED = ("paseo-agent-tournament", "paseo-session-brief",
           "paseo-project-bootstrap", "paseo-computer-use", "paseo-skill-save")

# Only symlink failures that mean "this host cannot create a symlink" are
# skipped; anything else (ENOENT, EIO, ...) is a real regression and re-raised.
SYMLINK_UNSUPPORTED_ERRNOS = {
    value for value in (
        getattr(errno, "EPERM", None),
        getattr(errno, "EACCES", None),
        getattr(errno, "ENOSYS", None),
        getattr(errno, "EINVAL", None),
        getattr(errno, "ENOTSUP", None),
        getattr(errno, "EOPNOTSUPP", None),
    ) if value is not None
}
SYMLINK_UNSUPPORTED_WINERRORS = {5, 1314}


def assert_ps_write_vendor(test, home):
    relative = Path("ps-write/vendor/humanize-korean")
    source = ROOT / "skills" / relative
    installed = home / ".agents/skills" / relative
    for filename in ("LICENSE", "SOURCES.md", "quick-rules.md", "rewriting-playbook.md"):
        with test.subTest(filename=filename):
            test.assertEqual((installed / filename).read_bytes(), (source / filename).read_bytes())


@unittest.skipIf(os.name == "nt",
                 "bash-only: exercises POSIX shell and symlink semantics")
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
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)

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
        self.assertEqual(len(expected), 15)
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

    def test_catalog_only_install_has_no_legacy_predecessor_or_runtime_side_effect(self):
        old = self.home / ".agents/skills/paseo-/SKILL.md"
        old.parent.mkdir(parents=True)
        old.write_text("---\nname: paseo-\n---\nkeep")
        self.assert_success(self.install("--skill", "ps", "--migrate-skills"))
        self.assertTrue((self.home / ".agents/skills/ps/scripts/skill-catalog.js").is_file())
        self.assertEqual(old.read_text(), "---\nname: paseo-\n---\nkeep")
        self.assertFalse((self.home / ".paseobility").exists())
        self.assertFalse((self.home / ".cua-driver").exists())

    def test_ps_write_install_copies_vendored_references(self):
        self.assert_success(self.install("--skill", "ps-write"))
        assert_ps_write_vendor(self, self.home)

    def test_single_skill_migrates_only_its_predecessors(self):
        self.seed()
        self.assert_success(self.install("--skill", "ps-project", "--migrate-skills"))
        for name in RETIRED:
            self.assertEqual((self.home / ".agents/skills" / name).exists(),
                             name not in ("paseo-session-brief", "paseo-project-bootstrap"))
        self.assertFalse((self.home / ".claude").exists())

    def test_no_migration_flag_preserves_old_entries(self):
        self.seed()
        self.assert_success(self.install())
        for name in RETIRED:
            self.assertTrue((self.home / ".agents/skills" / name).exists())

    def seed_renamed(self, base=".agents"):
        """Seed the v2 names that v3.0.0 renamed from paseo-<name> to ps-<name>."""
        names = [name.replace("ps-", "paseo-", 1) for name in
                 json.loads((ROOT / "paseobility.json").read_text())["skills"]
                 if name.startswith("ps-") and name not in ("ps-plan", "ps-write")]
        for name in names:
            dest = self.home / base / "skills" / name
            dest.mkdir(parents=True)
            (dest / "SKILL.md").write_text(f"---\nname: {name}\n---\n")
            (dest / "local-note.txt").write_text(f"preserve {name}")
        return names

    def test_renamed_skills_move_to_backup_when_migrating(self):
        old_names = []
        for base in (".agents", ".claude"):
            old_names = self.seed_renamed(base)
        self.assertEqual(len(old_names), 12)
        self.assert_success(self.install("--migrate-skills", "--with-claude"))
        for base in (".agents", ".claude"):
            for old in old_names:
                new = old.replace("paseo-", "ps-", 1)
                self.assertFalse((self.home / base / "skills" / old).exists())
                self.assertTrue((self.home / base / "skills" / new / "SKILL.md").is_file())
                copies = list((self.home / base / "skills-backups").glob(f"*/{old}/local-note.txt"))
                self.assertEqual(len(copies), 1)
                self.assertEqual(copies[0].read_text(), f"preserve {old}")

    def test_renamed_skills_stay_with_a_warning_without_migration(self):
        old_names = self.seed_renamed()
        result = self.install()
        self.assert_success(result)
        for old in old_names:
            self.assertTrue((self.home / ".agents/skills" / old / "local-note.txt").is_file())
            self.assertIn(f"{old} still sits beside", result.stderr)
        self.assertIn("--migrate-skills", result.stderr)

    def test_single_renamed_skill_moves_only_its_old_name(self):
        old_names = self.seed_renamed()
        self.assert_success(self.install("--skill", "ps-god", "--migrate-skills"))
        for old in old_names:
            self.assertEqual((self.home / ".agents/skills" / old).exists(), old != "paseo-god")
        self.assertTrue((self.home / ".agents/skills/ps-god/SKILL.md").is_file())

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

    def test_invalid_selection_aborts_before_replacing_existing_skills(self):
        skill = self.home / ".agents/skills/ps-project/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text("local original")
        result = self.install("--skill", "ps-project", "--skill", "missing")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(skill.read_text(), "local original")
        self.assertFalse((self.home / ".agents/skills-backups").exists())

    def test_skill_selection_requires_names_not_paths(self):
        result = self.install("--skill", "./ps-project")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.home / ".agents").exists())

    def test_duplicate_selection_preserves_original_backup_once(self):
        skill = self.home / ".agents/skills/ps-project/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text("local original")
        self.assert_success(self.install("--skill", "ps-project",
                                         "--skill", "ps-project"))
        backups = list((self.home / ".agents/skills-backups").glob(
            "*/ps-project/SKILL.md"))
        self.assertEqual([backup.read_text() for backup in backups], ["local original"])

    def test_unknown_ownership_aborts_before_installation(self):
        self.seed()
        old = self.home / ".agents/skills/paseo-session-brief/SKILL.md"
        old.write_text("---\nname: unrelated\n---\n")
        self.assertNotEqual(self.install("--migrate-skills").returncode, 0)
        self.assertEqual(old.read_text(), "---\nname: unrelated\n---\n")
        self.assertFalse((self.home / ".agents/skills/ps-project").exists())

    def test_symlink_aborts_without_touching_target(self):
        outside = self.home / "outside"
        outside.mkdir()
        (outside / "marker").write_text("keep")
        skill = self.home / ".agents/skills/paseo-session-brief"
        skill.parent.mkdir(parents=True)
        try:
            skill.symlink_to(outside, target_is_directory=True)
        except OSError as error:
            # Only skip when the host demonstrably cannot create a symlink;
            # on a capable host the assertions below must still run. Any other
            # errno (ENOENT, EIO, ...) is a real regression and re-raised.
            unsupported = (error.errno in SYMLINK_UNSUPPORTED_ERRNOS
                           or getattr(error, "winerror", None)
                           in SYMLINK_UNSUPPORTED_WINERRORS)
            if not unsupported:
                raise
            self.skipTest(f"symlink creation unavailable: {error}")
        self.assertNotEqual(self.install("--migrate-skills").returncode, 0)
        self.assertTrue(skill.is_symlink())
        self.assertEqual((outside / "marker").read_text(), "keep")


POWERSHELL = shutil.which("powershell.exe") if os.name == "nt" else shutil.which("pwsh")


@unittest.skipUnless(POWERSHELL, "PowerShell required for native installer tests")
class PowerShellSelectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="paseobility-powershell-")
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name) / "home [fixture] \ud55c\uae00"

    def install(self, *skills):
        def quote(value):
            return "'" + str(value).replace("'", "''") + "'"
        script = (
            "$ErrorActionPreference='Stop'; & "
            + quote(ROOT / "scripts/paseobility-install.ps1")
            + " -TargetHome " + quote(self.home)
            + " -Skill @(" + ",".join(quote(skill) for skill in skills) + ")"
            + " -NoPaseoCheck -SkipCuaDriver"
        )
        encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
        return subprocess.run([POWERSHELL, "-NoProfile", "-NonInteractive",
                               "-EncodedCommand", encoded],
                              capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)

    def test_catalog_only_install_copies_helper_without_runtime_or_config(self):
        result = self.install("ps")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((self.home / ".agents/skills/ps/scripts/skill-catalog.js").is_file())
        self.assertFalse((self.home / ".paseobility").exists())
        self.assertFalse((self.home / ".cua-driver").exists())

    def test_ps_write_install_copies_vendored_references(self):
        result = self.install("ps-write")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        assert_ps_write_vendor(self, self.home)

    def test_duplicate_selection_preserves_backup_under_literal_home_path(self):
        skill = self.home / ".agents/skills/ps-project/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text("local original")
        result = self.install("ps-project", "ps-project")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        backups = list((self.home / ".agents/skills-backups").glob(
            "*/ps-project/SKILL.md"))
        self.assertEqual([backup.read_text() for backup in backups], ["local original"])
        self.assertEqual(skill.read_bytes(), (ROOT / "skills/ps-project/SKILL.md").read_bytes())

    def test_path_selection_is_rejected_before_any_writes(self):
        result = self.install("./ps-project")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.home.exists())


if __name__ == "__main__":
    unittest.main()
