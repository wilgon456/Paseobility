"""Remote, read-only patch capture and bounded cleanup primitives.

This file is passed to the destination Python interpreter by the bridge; it
must not print repository data or command diagnostics to the terminal.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlsplit

LIMIT = 64 * 1024 * 1024
# Never wait for a credential prompt inside an unattended helper terminal.
QUIET = dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='never', GH_PROMPT_DISABLED='1')


def git(cwd, *args, accepted=(0,)):
    p = subprocess.run(['git', '-c', 'core.quotepath=true', *args], cwd=cwd, env=QUIET,
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if p.returncode not in accepted:
        raise ValueError('git operation failed')
    return p.stdout


def patch_bytes(root, base='HEAD', exclude=None):
    # Submodule working trees are independent repositories; a superproject diff
    # cannot preserve their contents, so refuse deletion until handled manually.
    if git(root, 'ls-files', '--stage', '-z').find(b'160000 ') >= 0:
        raise ValueError('submodule requires manual preservation')
    names = git(root, 'ls-files', '--others', '-z').split(b'\0')
    if not isinstance(base, str) or not all(c in '0123456789abcdef' for c in base) or len(base) not in (40, 64):
        if base != 'HEAD':
            raise ValueError('invalid base')
    patch = bytearray(git(root, 'diff', '--binary', '--no-ext-diff', '--no-textconv', base, '--'))
    for raw in names:
        if not raw:
            continue
        name = os.fsdecode(raw)
        if name == exclude:
            continue
        candidate = root / name
        if candidate.is_dir() and not candidate.is_symlink():
            raise ValueError('nested directory requires manual preservation')
        patch.extend(git(root, 'diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-index', '--', '/dev/null', name, accepted=(0, 1)))
        if len(patch) > LIMIT:
            raise ValueError('evidence limit exceeded')
    if len(patch) > LIMIT:
        raise ValueError('evidence limit exceeded')
    return patch


def make_patch(root, filename, base='HEAD'):
    root = Path(root)
    output = root / filename
    if output.parent != root or not filename.startswith('.paseo-bot-evidence-') or output.exists() or output.is_symlink():
        raise ValueError('invalid evidence path')
    patch = patch_bytes(root, base)
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(patch)
            f.flush()
            os.fsync(f.fileno())
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    return {'file': filename, 'size': len(patch), 'sha256': hashlib.sha256(patch).hexdigest()}


def github_repo(repo):
    remote = git(repo, 'remote', 'get-url', 'origin').decode('utf-8').strip()
    scp = re.fullmatch(r'(?:git@)?github\.com:([^/]+)/([^/]+)', remote)
    if scp:
        owner, name = scp.groups()
    else:
        parsed = urlsplit(remote)
        if parsed.scheme not in ('https', 'ssh') or parsed.hostname != 'github.com':
            raise ValueError('unsupported forge')
        parts = parsed.path.strip('/').split('/')
        if len(parts) != 2:
            raise ValueError('unsupported repository')
        owner, name = parts
    name = name.removesuffix('.git')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', owner) or not re.fullmatch(r'[A-Za-z0-9_.-]+', name):
        raise ValueError('unsupported repository')
    return owner + '/' + name


def gh(cwd, *args):
    p = subprocess.run(['gh', *args], cwd=cwd, env=QUIET, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if p.returncode:
        raise ValueError('gh operation failed')
    return p.stdout.decode('utf-8')


def evidence_file(root, filename, sha256):
    file = root / filename
    if file.parent != root or not filename.startswith('.paseo-bot-evidence-') or file.is_symlink():
        raise ValueError('invalid evidence path')
    if hashlib.sha256(file.read_bytes()).hexdigest() != sha256:
        raise ValueError('remote evidence changed')


def publish(request):
    """Commit the evidenced tree once, push the bot branch and open one draft PR."""
    root = Path(request['worktree'])
    filename, base, branch = request['file'], request['base'], request['branch']
    if not re.fullmatch(r'paseo-bot/[A-Za-z0-9][A-Za-z0-9_.-]*', branch) or not re.fullmatch(r'[0-9a-f]{40}', base) \
            or not re.fullmatch(r'[A-Za-z0-9_./-]+', request['defaultBranch']) or '..' in request['defaultBranch']:
        raise ValueError('invalid publish request')
    evidence_file(root, filename, request['sha256'])
    if git(root, 'symbolic-ref', '--short', 'HEAD').decode().strip() != branch:
        raise ValueError('unexpected branch')
    # The work agent may already have committed (and even pushed or merged) on the
    # task branch; anything else in the history is not ours to publish.
    git(root, 'merge-base', '--is-ancestor', base, 'HEAD')
    # Commit only the exact content captured as evidence after review.
    if hashlib.sha256(patch_bytes(root, base, exclude=filename)).hexdigest() != request['sha256']:
        raise ValueError('workspace changed since evidence')
    git(root, 'add', '-A', '--', '.', ':(exclude).paseo-bot-evidence-*')
    if git(root, 'diff', '--cached', '--name-only', '-z'):
        git(root, 'commit', '--no-verify', '-q', '-m', request['title'], '-m', request['body'])
    head = git(root, 'rev-parse', 'HEAD').decode().strip()
    state = hashlib.sha256(patch_bytes(root, base, exclude=filename)).hexdigest()
    if head == base:
        return {'prUrl': '', 'commit': base, 'stateSha': state}  # Nothing changed: no PR.
    git(root, 'push', '-q', 'origin', 'HEAD:refs/heads/' + branch)
    repo = github_repo(root)
    # An existing PR for the branch (open, merged or deliberately closed by the agent) wins.
    existing = json.loads(gh(root, 'pr', 'list', '--repo', repo, '--state', 'all', '--head', branch, '--json', 'url', '--limit', '5'))
    if existing:
        url = existing[0]['url']
    else:
        url = gh(root, 'pr', 'create', '--repo', repo, '--draft', '--base', request['defaultBranch'], '--head', branch,
                 '--title', request['title'], '--body', request['body']).strip().splitlines()[-1].strip()
    if not re.fullmatch(r'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[1-9][0-9]*', url):
        raise ValueError('invalid PR receipt')
    return {'prUrl': url, 'commit': head, 'stateSha': state}


def finish(repo, worktree, branch):
    # Never force-remove a remaining worktree: another actor may have added data
    # since the evidence was captured, and archive may have failed its teardown.
    removed = not Path(worktree).exists()
    if not removed:
        raw = git(repo, 'worktree', 'list', '--porcelain', '-z')
        records = raw.split(b'\0\0')
        expected = os.path.normcase(os.path.abspath(worktree))
        found = False
        for record in records:
            fields = record.split(b'\0')
            paths = [os.fsdecode(x[9:]) for x in fields if x.startswith(b'worktree ')]
            branches = [os.fsdecode(x[7:]) for x in fields if x.startswith(b'branch ')]
            if paths and os.path.normcase(os.path.abspath(paths[0])) == expected:
                found = branches == ['refs/heads/' + branch]
                break
        if found:
            try:
                git(repo, 'worktree', 'remove', '--', worktree)
            except ValueError:
                pass
        removed = not Path(worktree).exists()
    if not removed:
        return {'worktreeRemoved': False, 'branch': 'not-checked'}
    # A failed lookup cannot establish that there is no PR: retain the branch.
    try:
        full = github_repo(repo)
        owner = full.split('/')[0]
        prs = json.loads(gh(repo, 'pr', 'list', '--repo', full, '--state', 'open', '--head', owner + ':' + branch,
                            '--json', 'headRefName,state', '--limit', '100'))
        if not isinstance(prs, list) or any(not isinstance(pr, dict) for pr in prs):
            raise ValueError('invalid PR response')
        if any(pr.get('headRefName') == branch and pr.get('state') == 'OPEN' for pr in prs):
            return {'worktreeRemoved': True, 'branch': 'retained-open-pr'}
        git(repo, 'branch', '-D', '--', branch)
        return {'worktreeRemoved': True, 'branch': 'deleted'}
    except (OSError, ValueError, KeyError, TypeError):
        return {'worktreeRemoved': True, 'branch': 'unconfirmed'}


def main():
    request = json.loads(sys.argv[1])
    if request['action'] == 'snapshot':
        result = make_patch(request['worktree'], request['file'], request['base'])
    elif request['action'] == 'verify':
        root = Path(request['worktree'])
        filename = request['file']
        evidence_file(root, filename, request['sha256'])
        # After a draft-PR publish the tree is committed; compare with the published state.
        digest = hashlib.sha256(patch_bytes(root, request['base'], exclude=filename)).hexdigest()
        if digest != request.get('stateSha', request['sha256']):
            raise ValueError('workspace changed since evidence')
        result = {'verified': True}
    elif request['action'] == 'publish':
        result = publish(request)
    elif request['action'] == 'finish':
        result = finish(request['repo'], request['worktree'], request['branch'])
    else:
        raise ValueError('unknown action')
    print('PASEO_BOT_CLEANUP=' + json.dumps(result, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    # Give the daemon time to register the terminal and keep its scrollback
    # available until the bridge captures the receipt and closes our terminal.
    time.sleep(1)
    try:
        main()
    except Exception:
        print('PASEO_BOT_CLEANUP_ERROR', flush=True)
    time.sleep(60)
