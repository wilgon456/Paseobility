#!/usr/bin/env python3
"""Private host registry and installed-Paseo RPC launcher (no dependencies)."""
import argparse
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

DEFAULT_CONFIG = Path.home() / '.config/paseo-multi/hosts.json'


def private_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    if os.name != 'nt':
        path.chmod(0o600)


def load_hosts(path):
    if os.name != 'nt' and stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError('Registry must be private (chmod 600).')
    data = json.loads(path.read_text(encoding='utf-8'))
    hosts = data.get('hosts') if isinstance(data, dict) else data
    if not isinstance(hosts, list) or not hosts:
        raise ValueError('Registry must contain a nonempty hosts array.')
    seen = set()
    for h in hosts:
        if not isinstance(h, dict) or not isinstance(h.get('label'), str) or not h['label'] or not isinstance(h.get('serverId'), str) or not h['serverId']:
            raise ValueError('Every host requires label and expected serverId.')
        if not isinstance(h.get('aliases', []), list) or not all(isinstance(a, str) for a in h.get('aliases', [])):
            raise ValueError('Host aliases must be an array of names.')
        for name in [h['label'], *h.get('aliases', [])]:
            key = name.casefold().strip()
            if not key or key in seen:
                raise ValueError('Duplicate or empty host alias.')
            seen.add(key)
    return hosts


def select_host(hosts, name):
    found = [h for h in hosts if name.casefold().strip() in
             [s.casefold().strip() for s in [h['label'], *h.get('aliases', [])]]]
    if len(found) != 1:
        raise ValueError('Select one exact registered host label or alias.')
    return found[0]


def runtime():
    module = os.environ.get('PASEO_MULTI_HOST_CLIENT_MODULE')
    node = os.environ.get('PASEO_MULTI_HOST_NODE')
    if module or node:
        if not (module and node and Path(module).is_file() and Path(node).is_file()):
            raise ValueError('Set both client module and Node executable to existing files.')
        return [node], Path(module)
    custom = os.environ.get('PASEO_MULTI_HOST_RESOURCES')
    candidates = [Path(custom)] if custom else (
        [Path(os.environ[k]) / suffix for k, suffix in
         [('LOCALAPPDATA', 'Programs/Paseo/resources'), ('ProgramFiles', 'Paseo/resources')]
         if os.environ.get(k)] if os.name == 'nt' else
        [Path('/Applications/Paseo.app/Contents/Resources')])
    for resources in candidates:
        module = resources / 'app.asar/node_modules/@getpaseo/cli/dist/utils/client.js'
        runner = resources / 'app.asar.unpacked/dist/daemon/node-entrypoint-runner.js'
        electron = (resources.parent / 'Paseo.exe' if os.name == 'nt' else
                    resources.parent / 'Frameworks/Paseo Helper.app/Contents/MacOS/Paseo Helper')
        # ASAR paths are virtual to Electron, not Python filesystem paths.
        if (resources / 'app.asar').is_file() and runner.is_file() and electron.is_file():
            return [str(electron), '--disable-warning=DEP0040', str(runner), 'node-script'], module
    cli = shutil.which('paseo')
    node = shutil.which('node')
    if cli and node:
        for parent in Path(cli).resolve().parents:
            candidate = parent / 'dist/utils/client.js'
            if candidate.is_file() and parent.name == 'cli':
                return [node], candidate
    raise ValueError('Installed Paseo client runtime not found; see references/connections.md.')


def rpc(request, timeout=80):
    launch, module = runtime()
    env = dict(os.environ, ELECTRON_RUN_AS_NODE='1', PASEO_MULTI_HOST_CLIENT_MODULE=str(module))
    timeout = max(timeout, 120 + request.get('wait', 0))
    result = subprocess.run(launch + [str(Path(__file__).with_name('rpc.mjs'))],
                            input=json.dumps(request), text=True, encoding='utf-8', capture_output=True,
                            env=env, timeout=timeout)
    try:
        data = json.loads(result.stdout)
    except ValueError:
        raise ValueError('Paseo adapter failed; inspect installed client compatibility.') from None
    if result.returncode or not data.get('ok'):
        raise ValueError(data.get('error', 'Remote request failed.'))
    return data['result']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('hosts')
    sub.add_parser('runs')
    imp = sub.add_parser('import-saved')
    imp.add_argument('file', type=Path)
    imp.add_argument('--replace', action='store_true')
    for action in ('status', 'agents'):
        sub.add_parser(action).add_argument('host')
    rst = sub.add_parser('restart')
    rst.add_argument('host')
    rst.add_argument('--force', action='store_true',
                     help='Restart even with active agents (only when the user asked for that)')
    cli = sub.add_parser('cli')
    cli.add_argument('host')
    cli.add_argument('args', nargs=argparse.REMAINDER)
    exe = sub.add_parser('exec')
    exe.add_argument('host')
    src = exe.add_mutually_exclusive_group(required=True)
    src.add_argument('--file', type=Path)
    src.add_argument('--command', help='Inline script text instead of --file')
    exe.add_argument('--shell', choices=['bash', 'powershell'])
    exe.add_argument('--wait', type=int, choices=range(0, 301), default=10, metavar='0..300')
    exe.add_argument('--keep-terminal', action='store_true',
                     help='Keep a successful terminal open instead of saving and closing it')
    exe.add_argument('--workspace', help='Remote workspace ID, for daemons that require one per terminal')
    for action in ('capture', 'close'):
        p = sub.add_parser(action)
        p.add_argument('run_id')
        if action == 'close':
            p.add_argument('--interrupt', action='store_true')
    args = parser.parse_args()
    config = args.config.expanduser().resolve()
    if args.action == 'import-saved':
        data = json.loads(args.file.read_text(encoding='utf-8'))
        if isinstance(data, list) and len(data) == 1 and isinstance(data[0], list):
            data = data[0]
        if isinstance(data, dict):
            data = data.get('hosts')
        if not isinstance(data, list):
            raise ValueError('Unsupported saved-host export.')
        if config.exists() and not args.replace:
            # Merge: an imported host replaces the entry with the same serverId.
            incoming = {h.get('serverId') for h in data if isinstance(h, dict)}
            data = [h for h in load_hosts(config) if h['serverId'] not in incoming] + data
        candidate = config.with_name(config.name + '.candidate')
        try:
            private_write(candidate, {'hosts': data})
            hosts = load_hosts(candidate)
            candidate.replace(config)
        finally:
            candidate.unlink(missing_ok=True)
        return {'registered': [h['label'] for h in hosts], 'registry': str(config)}
    hosts = load_hosts(config)
    if args.action == 'hosts':
        return [{'label': h['label'], 'aliases': h.get('aliases', []),
                 'platform': h.get('platform', 'unknown'), 'serverId': h['serverId']} for h in hosts]
    if args.action == 'runs':
        return [json.loads(p.read_text(encoding='utf-8')) for p in sorted((config.parent / 'runs').glob('*.json'))]
    req = {'action': args.action, 'stateDir': str(config.parent / 'runs'),
           'force': getattr(args, 'force', False)}
    if args.action in ('capture', 'close'):
        import uuid
        run_id = str(uuid.UUID(args.run_id))
        record = json.loads((config.parent / 'runs' / (run_id + '.json')).read_text(encoding='utf-8'))
        host = select_host(hosts, record['host'])
        if record['serverId'] != host['serverId']:
            raise ValueError('Recorded run belongs to a different registered server identity.')
        req.update(run=record, interrupt=getattr(args, 'interrupt', False))
    else:
        host = select_host(hosts, args.host)
    req['host'] = host
    if args.action == 'exec':
        shell = args.shell or {'macos': 'bash', 'linux': 'bash', 'windows': 'powershell'}.get(host.get('platform'))
        if shell is None:
            raise ValueError('Unknown target platform: supply --shell after verifying it.')
        script = args.command if args.command is not None else args.file.read_text(encoding='utf-8')
        req.update(script=script, shell=shell, wait=args.wait, keepTerminal=args.keep_terminal)
        if args.workspace:
            req['workspaceId'] = args.workspace
    if args.action == 'cli':
        commands = args.args[1:] if args.args[:1] == ['--'] else args.args
        if not commands or commands[0].startswith('-') or any(
                a.split('=')[0] in ('--host', '--home') for a in commands):
            raise ValueError('CLI command required; target overrides are not allowed.')
        if commands[0] in ('restart', 'start', 'onboard', 'pair') or (
                commands[0] == 'daemon' and commands[1:2] not in (['status'], ['reload'])):
            raise ValueError('Use guarded restart or a host-side lifecycle script.')
        req['args'] = commands
        override = os.environ.get('PASEO_MULTI_HOST_CLI')
        if override:
            if Path(override).suffix.lower() in ('.cmd', '.bat'):
                raise ValueError('Batch CLI overrides are unsupported; use detected bundled runtime.')
            req['cli'] = override
        else:
            launch, module = runtime()
            req['cli'] = launch[0]
            req['cliPrefix'] = launch[1:] + [str(module.parent.parent / 'index.js')]
    return rpc(req)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        print(json.dumps({'ok': True, 'result': main()}, ensure_ascii=False, indent=2))
    except (ValueError, OSError, subprocess.TimeoutExpired) as e:
        message = str(e) if isinstance(e, ValueError) else type(e).__name__
        if isinstance(e, subprocess.TimeoutExpired):
            message += ': remote outcome unknown; use runs and capture before retrying.'
        print(json.dumps({'ok': False, 'error': message}, ensure_ascii=False))
        sys.exit(1)
