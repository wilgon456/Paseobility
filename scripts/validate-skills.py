#!/usr/bin/env python3
"""Validate the shipped catalog and skill frontmatter; requires PyYAML for CI only."""
import argparse
import json
from pathlib import Path
import re
import sys
import yaml


def validate(root):
    root = Path(root)
    errors = []
    try:
        manifest = json.loads((root / 'paseobility.json').read_text(encoding='utf-8'))
        if not isinstance(manifest, dict):
            return ['manifest must be a JSON object']
        names = manifest['skills']
        if not isinstance(names, list) or not names or any(not isinstance(name, str) for name in names):
            return ['manifest skills must be a nonempty string array']
        if len(set(names)) != len(names):
            errors.append('manifest has duplicate skills')
        if manifest.get('version') != (root / 'VERSION').read_text(encoding='utf-8').strip():
            errors.append('manifest version differs from VERSION')
        actual = {p.name for p in (root / 'skills').iterdir() if p.is_dir()}
        if actual != set(names):
            errors.append('manifest and skills directories differ')
        for name in names:
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) or len(name) > 64:
                errors.append('invalid skill name: ' + name)
                continue
            text = (root / 'skills' / name / 'SKILL.md').read_text(encoding='utf-8')
            match = re.match(r'\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)', text, re.S)
            if not match:
                errors.append(name + ': frontmatter missing')
                continue
            try:
                data = yaml.safe_load(match.group(1))
            except yaml.YAMLError:
                errors.append(name + ': invalid YAML')
                continue
            if not isinstance(data, dict) or data.get('name') != name:
                errors.append(name + ': frontmatter name mismatch')
            if not isinstance(data, dict) or not isinstance(data.get('description'), str) or not data['description'].strip():
                errors.append(name + ': description missing')
            if not text[match.end():].strip():
                errors.append(name + ': instructions missing')
    except (OSError, ValueError, KeyError) as error:
        errors.append(type(error).__name__ + ': catalog cannot be validated')
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    problems = validate(args.root)
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        sys.exit(1)
    print('OK: catalog, version and skill frontmatter agree')
