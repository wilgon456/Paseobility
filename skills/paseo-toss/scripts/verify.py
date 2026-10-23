#!/usr/bin/env python3
"""Read-only integrity check for the pinned, vendored Toss Harness resources."""
import hashlib
import json
from pathlib import Path
import sys


def verify(root):
    root = Path(root)
    upstream = root / 'upstream'
    manifest = json.loads((upstream / 'SOURCE.json').read_text(encoding='utf-8'))
    errors = []
    if manifest.get('commit') != '255b636812d8b3a9b048d0a700644b9cbd8532c4':
        errors.append('unexpected source commit')
    expected = manifest['files']
    actual = {p.relative_to(upstream).as_posix() for p in upstream.rglob('*') if p.is_file()}
    if actual != set(expected) | {'SOURCE.json'}:
        errors.append('upstream file inventory differs')
    for relative, info in expected.items():
        path = upstream / relative
        if not path.is_relative_to(upstream) or '..' in Path(relative).parts or path.is_symlink():
            errors.append('unsafe resource path: ' + relative)
        elif not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != info['sha256']:
            errors.append('resource missing or changed: ' + relative)
    entries = list(root.rglob('SKILL.md'))
    if entries != [root / 'SKILL.md']:
        errors.append('unexpected nested skill entrypoints')
    workflows = list((upstream / 'shared' / 'skills').glob('*/WORKFLOW.md'))
    if len(workflows) != 11:
        errors.append('expected eleven upstream workflows')
    return errors, len(expected)


if __name__ == '__main__':
    try:
        problems, count = verify(Path(__file__).resolve().parents[1])
        if problems:
            print('\n'.join(problems), file=sys.stderr)
            sys.exit(1)
        print(f'OK: {count} pinned resources; 11 workflows; one paseo-toss entrypoint')
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Integrity check failed: {type(error).__name__}', file=sys.stderr)
        sys.exit(1)
