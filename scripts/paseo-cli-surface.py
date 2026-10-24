#!/usr/bin/env python3
"""Record or check the installed Paseo CLI surface (commands and flags).

The snapshot in docs/paseo-cli-surface.json is consumed by the offline test
tests/test_cli_references.py so that CI can verify skill documentation without
a Paseo install. Generation needs the real CLI; --check skips when it is
absent. Only local subprocess calls are used: no network access.
"""
import argparse
import difflib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / 'docs' / 'paseo-cli-surface.json'
SURFACE_FORMAT = 1
MAX_DEPTH = 3
TIMEOUT_SECONDS = 20

OPTION_NAME = re.compile(r'(?<![\w-])(--?[A-Za-z0-9][\w-]*)')


def paseo_version(executable):
    result = subprocess.run([executable, '--version'], text=True, encoding='utf-8',
                            capture_output=True, timeout=TIMEOUT_SECONDS)
    if result.returncode != 0:
        raise RuntimeError('paseo --version failed: ' + (result.stderr.strip() or 'no output'))
    version = result.stdout.strip()
    if not version:
        raise RuntimeError('paseo --version printed nothing')
    return version


def help_text(executable, path):
    command = [executable, *path, '--help']
    try:
        result = subprocess.run(command, text=True, encoding='utf-8',
                                capture_output=True, timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        raise RuntimeError('timed out: ' + ' '.join(command)) from None
    if result.returncode != 0:
        raise RuntimeError('failed: ' + ' '.join(command))
    return result.stdout


def section_entry(line):
    """Return the entry text for a two-space-indented list item, else None."""
    if not line.startswith('  ') or len(line) <= 2 or line[2] == ' ':
        return None
    return re.split(r'\s{2,}', line[2:].strip(), maxsplit=1)[0]


def parse_help(text):
    """Return (command alias groups, option names) from one help page."""
    commands = []
    options = set()
    section = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == 'Commands:':
            section = 'commands'
            continue
        if stripped.endswith('Options:'):
            section = 'options'
            continue
        entry = section_entry(line)
        if entry is None:
            continue
        if section == 'commands':
            names = []
            for token in entry.split():
                if token.startswith('[') or token.startswith('<'):
                    break
                names.extend(part for part in token.split('|') if part)
            if names:
                commands.append(names)
        elif section == 'options':
            options.update(OPTION_NAME.findall(entry))
    return commands, sorted(options)


def build_surface(executable):
    version = paseo_version(executable)
    commands = {}
    seen = set()

    def walk(path):
        key = ' '.join(path)
        if key in seen:
            return
        seen.add(key)
        subcommands, options = parse_help(help_text(executable, path))
        if path:
            commands[key] = options
        if len(path) >= MAX_DEPTH:
            return
        for names in subcommands:
            primary = names[0]
            if primary == 'help':
                commands[' '.join(path + ['help'])] = options
                continue
            walk(path + [primary])
            primary_key = ' '.join(path + [primary])
            for alias in names[1:]:
                commands[' '.join(path + [alias])] = commands.get(primary_key, options)

    root_commands, global_options = parse_help(help_text(executable, []))
    for names in root_commands:
        primary = names[0]
        if primary == 'help':
            commands['help'] = global_options
            continue
        walk([primary])
        primary_key = ' '.join([primary])
        for alias in names[1:]:
            commands[' '.join([alias])] = commands.get(primary_key, global_options)

    return {
        'surfaceFormat': SURFACE_FORMAT,
        'paseoVersion': version,
        'globalOptions': global_options,
        'commands': {key: commands[key] for key in sorted(commands)},
    }


def render(surface):
    return json.dumps(surface, indent=2, sort_keys=True) + '\n'


def find_paseo(explicit):
    if explicit:
        return explicit
    return shutil.which('paseo')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='regenerate and compare with the committed snapshot')
    parser.add_argument('--paseo', help='paseo executable (default: PATH)')
    args = parser.parse_args()

    executable = find_paseo(args.paseo)
    if not executable:
        if args.check:
            print('SKIP: paseo CLI not installed; the committed snapshot was not checked')
            return 0
        print('error: paseo CLI not found in PATH', file=sys.stderr)
        return 1

    try:
        surface = build_surface(executable)
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print('error: ' + str(error), file=sys.stderr)
        return 1

    text = render(surface)
    if args.check:
        try:
            committed = SNAPSHOT.read_text(encoding='utf-8')
        except OSError:
            print('error: snapshot missing: ' + str(SNAPSHOT), file=sys.stderr)
            return 1
        if committed != text:
            diff = difflib.unified_diff(
                committed.splitlines(), text.splitlines(),
                fromfile=str(SNAPSHOT.relative_to(ROOT)),
                tofile='regenerated from paseo ' + surface['paseoVersion'],
                lineterm='')
            print('\n'.join(diff))
            return 1
        print('OK: snapshot matches paseo ' + surface['paseoVersion'] +
              ' (' + str(len(surface['commands'])) + ' command paths)')
        return 0

    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_text(text, encoding='utf-8')
    print('OK: recorded ' + str(len(surface['commands'])) + ' command paths from paseo ' +
          surface['paseoVersion'] + ' -> ' + str(SNAPSHOT.relative_to(ROOT)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
