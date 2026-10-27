"""Evidence patches must restore actual tracked and untracked bytes."""
import importlib.util
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cleanup_remote', ROOT / 'tools/paseo-bot/cleanup_remote.py')
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class PatchTests(unittest.TestCase):
    def test_patch_restores_tracked_untracked_binary_and_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / 'repo'
            repo.mkdir()
            def git(*args, cwd=repo):
                return subprocess.run(['git', *args], cwd=cwd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            git('init')
            git('config', 'user.email', 'fixture@example.invalid')
            git('config', 'user.name', 'Fixture')
            (repo / '.gitignore').write_text('ignored.bin\n', encoding='utf-8')
            (repo / 'tracked.bin').write_bytes(b'old\x00value')
            git('add', '.')
            git('commit', '-m', 'fixture')
            (repo / 'tracked.bin').write_bytes(b'new\x00value\xff')
            (repo / 'ignored.bin').write_bytes(b'ignored\x00\xff')
            (repo / '한글.txt').write_text('result', encoding='utf-8')
            receipt = cleanup.make_patch(repo, '.paseo-bot-evidence-test.patch')
            restored = Path(directory) / 'restored'
            git('clone', str(repo), str(restored))
            patch = repo / receipt['file']
            git('apply', '--binary', '--', str(patch), cwd=restored)
            for name in ['tracked.bin', 'ignored.bin', '한글.txt']:
                self.assertEqual((repo / name).read_bytes(), (restored / name).read_bytes())
            self.assertEqual(hashlib.sha256(cleanup.patch_bytes(repo, exclude=receipt['file'])).hexdigest(), receipt['sha256'])
            (repo / 'tracked.bin').write_bytes(b'changed after capture')
            self.assertNotEqual(hashlib.sha256(cleanup.patch_bytes(repo, exclude=receipt['file'])).hexdigest(), receipt['sha256'])

    def test_finish_deletes_only_branch_without_open_pr(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / 'repo'
            repo.mkdir()
            def git(*args):
                return subprocess.run(['git', *args], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            git('init')
            git('config', 'user.email', 'fixture@example.invalid')
            git('config', 'user.name', 'Fixture')
            git('commit', '--allow-empty', '-m', 'fixture')
            git('remote', 'add', 'origin', 'https://github.com/fixture/repo.git')
            original = subprocess.run
            for branch, open_pr in [('paseo-bot/closed', False), ('paseo-bot/open', True)]:
                tree = Path(directory) / branch.split('/')[-1]
                git('worktree', 'add', '-b', branch, str(tree))
                git('worktree', 'remove', str(tree))  # daemon archive succeeded
                def execute(args, **kwargs):
                    if args[0] == 'gh':
                        self.assertEqual(args[args.index('--repo') + 1], 'fixture/repo')
                        payload = ('[{"headRefName":"' + branch + '","state":"OPEN"}]').encode() if open_pr else b'[]'
                        return subprocess.CompletedProcess(args, 0, payload, b'')
                    return original(args, **kwargs)
                with patch.object(cleanup.subprocess, 'run', side_effect=execute):
                    result = cleanup.finish(str(repo), str(tree), branch)
                self.assertEqual(result['branch'], 'retained-open-pr' if open_pr else 'deleted')
                present = subprocess.run(['git', 'show-ref', '--verify', '--quiet', 'refs/heads/' + branch], cwd=repo).returncode == 0
                self.assertEqual(present, open_pr)

    def test_finish_does_not_force_remove_dirty_worktree(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / 'repo'; repo.mkdir()
            def git(*args):
                subprocess.run(['git', *args], cwd=repo, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture')
            git('commit', '--allow-empty', '-m', 'fixture')
            tree = Path(directory) / 'worktree'
            git('worktree', 'add', '-b', 'paseo-bot/dirty', str(tree))
            (tree / 'valuable.txt').write_text('keep', encoding='utf-8')
            result = cleanup.finish(str(repo), str(tree), 'paseo-bot/dirty')
            self.assertFalse(result['worktreeRemoved'])
            self.assertEqual((tree / 'valuable.txt').read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
