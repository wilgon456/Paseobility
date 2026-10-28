"""Exercise pinned bytes through real Git checkout/archive and repeated installs.

Everything, including Git configuration and install homes, lives in a temporary
fixture. No network, host skill mutation, Cua runtime, or Paseo connection.
"""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELATIVE = Path('skills/paseo-toss')
SPEC = importlib.util.spec_from_file_location('toss_verify', ROOT / RELATIVE / 'scripts/verify.py')
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


class TossCheckoutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='paseobility-toss-git-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / 'source'
        self.repo.mkdir()
        empty_config = self.base / 'empty.gitconfig'
        empty_config.write_text('')
        self.env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
        self.env.update(GIT_CONFIG_NOSYSTEM='1', GIT_ATTR_NOSYSTEM='1',
                        GIT_CONFIG_GLOBAL=str(empty_config), GIT_CONFIG_COUNT='1',
                        GIT_CONFIG_KEY_0='core.attributesFile',
                        GIT_CONFIG_VALUE_0=str(empty_config))
        shutil.copytree(ROOT / RELATIVE, self.repo / RELATIVE,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        shutil.copy2(ROOT / '.gitattributes', self.repo / '.gitattributes')
        self.git(self.repo, 'init', '-q')
        self.git(self.repo, 'config', 'core.autocrlf', 'false')
        self.commit('Pinned fixture')

    def git(self, cwd, *args):
        result = subprocess.run(['git', *args], cwd=cwd, env=self.env,
                                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def commit(self, message):
        self.git(self.repo, 'add', '-A')
        self.git(self.repo, '-c', 'user.name=Fixture', '-c',
                 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
                 'commit', '-qm', message)

    def clone(self, name, autocrlf, eol='crlf'):
        target = self.base / name
        self.git(self.base, 'clone', '-q', '--no-local', '-c',
                 'core.autocrlf=' + autocrlf, '-c', 'core.eol=' + eol,
                 str(self.repo), str(target))
        return target

    def assert_intact(self, root):
        errors, count = VERIFY.verify(root / RELATIVE)
        self.assertEqual(errors, [])
        self.assertEqual(count, 67)

    def test_checkout_and_archive_preserve_bytes_across_git_modes(self):
        for mode, eol in [('true', 'crlf'), ('false', 'crlf'),
                          ('input', 'crlf'), ('false', 'lf')]:
            with self.subTest(autocrlf=mode, eol=eol):
                clone = self.clone(mode + '-' + eol, mode, eol)
                self.assert_intact(clone)
                for cycle in range(2):
                    shutil.rmtree(clone / RELATIVE)
                    self.git(clone, 'checkout', '--force', 'HEAD', '--', str(RELATIVE))
                    self.assert_intact(clone)
                archive = self.base / (mode + '-' + eol + '.zip')
                self.git(clone, 'archive', '--format=zip', '--output=' + str(archive), 'HEAD')
                unpacked = self.base / (mode + '-' + eol + '-archive')
                with zipfile.ZipFile(archive) as bundle:
                    bundle.extractall(unpacked)
                self.assert_intact(unpacked)

    def test_missing_rule_reproduces_failure_and_existing_clone_recovers(self):
        attributes = (self.repo / '.gitattributes').read_bytes()
        (self.repo / '.gitattributes').unlink()
        self.commit('Remove protection for negative control')
        clone = self.clone('negative-control', 'true')
        errors, _ = VERIFY.verify(clone / RELATIVE)
        self.assertTrue(any('resource missing or changed' in error for error in errors))
        (self.repo / '.gitattributes').write_bytes(attributes)
        self.commit('Restore protection')
        self.git(clone, 'pull', '--ff-only')
        # An existing checkout may retain converted files after only attributes
        # change. Materialize the affected tracked files before checking bytes.
        shutil.rmtree(clone / RELATIVE)
        self.git(clone, 'checkout', '--force', 'HEAD', '--', str(RELATIVE))
        self.assert_intact(clone)

    def test_repeated_install_preserves_bytes_backups_and_unrelated_files(self):
        clone = self.clone('install-source', 'true')
        # Use the real installer with an isolated home and only this skill.
        shutil.copytree(ROOT / 'scripts', clone / 'scripts')
        for name in ['VERSION', 'paseobility.json']:
            shutil.copy2(ROOT / name, clone / name)
        home = self.base / 'install-home'
        marker = home / '.agents/skills/unrelated/private-note'
        marker.parent.mkdir(parents=True)
        marker.write_bytes(b'preserve unrelated data')
        if os.name == 'nt':
            command = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                       '-File', str(clone / 'scripts/paseobility-install.ps1'),
                       '-TargetHome', str(home), '-Skill', 'paseo-toss',
                       '-WithClaude', '-SkipCuaDriver', '-NoPaseoCheck']
        else:
            command = ['bash', str(clone / 'scripts/paseobility-init.sh'),
                       '--target-home', str(home), '--skill', 'paseo-toss',
                       '--with-claude', '--skip-cua-driver', '--no-paseo-check', '--no-context']
        for cycle in range(3):
            result = subprocess.run(command, cwd=clone, env=self.env,
                                    capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            for provider in ['.agents', '.claude']:
                errors, _ = VERIFY.verify(home / provider / 'skills/paseo-toss')
                self.assertEqual(errors, [])
                backups = list((home / provider / 'skills-backups').glob('*/paseo-toss'))
                self.assertEqual(len(backups), cycle)
                for backup in backups:
                    self.assertEqual(VERIFY.verify(backup)[0], [])
            self.assertEqual(marker.read_bytes(), b'preserve unrelated data')
