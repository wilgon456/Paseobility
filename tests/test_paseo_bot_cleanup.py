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

    def test_publish_commits_evidenced_tree_once_and_opens_one_draft_pr(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, bare = Path(directory) / 'repo', Path(directory) / 'origin.git'
            repo.mkdir()
            def git(*args, cwd=repo):
                return subprocess.run(['git', *args], cwd=cwd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().strip()
            git('init', '--bare', str(bare), cwd=directory)
            git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture')
            (repo / 'answer.txt').write_text('41\n', encoding='utf-8')
            git('add', '.'); git('commit', '-m', 'fixture')
            git('remote', 'add', 'origin', 'https://github.com/fixture/repo.git')
            git('remote', 'set-url', '--push', 'origin', str(bare))
            base = git('rev-parse', 'HEAD')
            tree = Path(directory) / 'tree'
            git('worktree', 'add', '-b', 'paseo-bot/task-9', str(tree))
            (tree / 'answer.txt').write_text('42\n', encoding='utf-8')
            (tree / 'new.txt').write_text('added', encoding='utf-8')
            evidence = cleanup.make_patch(tree, '.paseo-bot-evidence-test.patch', base)
            original, created = subprocess.run, []
            def execute(args, **kwargs):
                if args[0] == 'gh':
                    if args[1:3] == ['pr', 'list']:
                        return subprocess.CompletedProcess(args, 0, b'[{"url":"https://github.com/fixture/repo/pull/3"}]' if created else b'[]', b'')
                    created.append(args)
                    self.assertIn('--draft', args)
                    self.assertEqual(args[args.index('--base') + 1], 'main')
                    return subprocess.CompletedProcess(args, 0, b'https://github.com/fixture/repo/pull/3\n', b'')
                return original(args, **kwargs)
            request = dict(worktree=str(tree), file=evidence['file'], sha256=evidence['sha256'], base=base,
                           branch='paseo-bot/task-9', defaultBranch='main', title='Change answer', body='Paseo bot task')
            with patch.object(cleanup.subprocess, 'run', side_effect=execute):
                first = cleanup.publish(request)
                again = cleanup.publish(request)  # A lost acknowledgement is retried safely.
            self.assertEqual(first, again)
            self.assertEqual(first['prUrl'], 'https://github.com/fixture/repo/pull/3')
            self.assertEqual(len(created), 1)
            self.assertEqual(git('rev-parse', 'refs/heads/paseo-bot/task-9', cwd=bare), first['commit'])
            self.assertEqual(git('rev-parse', first['commit'] + '^'), base)
            committed = git('show', '--name-only', '--format=', first['commit']).split()
            self.assertEqual(sorted(committed), ['answer.txt', 'new.txt'])  # Evidence file is never committed.
            self.assertEqual(hashlib.sha256(cleanup.patch_bytes(tree, base, exclude=evidence['file'])).hexdigest(), first['stateSha'])
            (tree / 'answer.txt').write_text('changed after review', encoding='utf-8')
            git('reset', '--hard', base, cwd=tree)
            (tree / 'answer.txt').write_text('changed after review', encoding='utf-8')
            with self.assertRaises(ValueError):  # Content that was not evidenced is never published.
                cleanup.publish(request)

    def test_publish_reuses_pr_the_work_agent_already_shipped(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, bare = Path(directory) / 'repo', Path(directory) / 'origin.git'
            repo.mkdir()
            def git(*args, cwd=repo):
                return subprocess.run(['git', *args], cwd=cwd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().strip()
            git('init', '--bare', str(bare), cwd=directory)
            git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture')
            (repo / 'answer.txt').write_text('41\n', encoding='utf-8'); git('add', '.'); git('commit', '-m', 'fixture')
            git('remote', 'add', 'origin', 'https://github.com/fixture/repo.git'); git('remote', 'set-url', '--push', 'origin', str(bare))
            base = git('rev-parse', 'HEAD')
            tree = Path(directory) / 'tree'
            git('worktree', 'add', '-b', 'paseo-bot/task-8', str(tree))
            (tree / 'answer.txt').write_text('42\n', encoding='utf-8')
            git('commit', '-am', 'agent commit', cwd=tree)  # The full-permission work agent shipped it.
            agent_head = git('rev-parse', 'HEAD', cwd=tree)
            evidence = cleanup.make_patch(tree, '.paseo-bot-evidence-test.patch', base)
            original, created = subprocess.run, []
            def execute(args, **kwargs):
                if args[0] == 'gh':
                    if args[1:3] == ['pr', 'list']:
                        self.assertEqual(args[args.index('--state') + 1], 'all')
                        return subprocess.CompletedProcess(args, 0, b'[{"url":"https://github.com/fixture/repo/pull/9"}]', b'')
                    created.append(args)
                return original(args, **kwargs)
            with patch.object(cleanup.subprocess, 'run', side_effect=execute):
                result = cleanup.publish(dict(worktree=str(tree), file=evidence['file'], sha256=evidence['sha256'], base=base,
                                              branch='paseo-bot/task-8', defaultBranch='main', title='t', body='b'))
            self.assertEqual((result['prUrl'], result['commit']), ('https://github.com/fixture/repo/pull/9', agent_head))
            self.assertEqual(created, [])

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
