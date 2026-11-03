#!/usr/bin/env python3
"""Resident Discord gateway service for the Paseo bot (one owner, one channel).

The service never speaks to Discord itself: it reads `discord.json`, fetches the
bot token from the secret store into the child's stdin, and keeps the Node
gateway alive. The token is never placed in argv, the environment, a file or a
log line.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
from paseo_bot import describe, lock, log_event, private_file, stop_requested, write_json

SNOWFLAKE = re.compile(r'\d{16,22}\Z')
TOOL = Path(__file__).resolve().parent
CHILD_HEALTH = 'discord-gateway.json'
HEALTH = 'discord-health.json'
CHILD_STALE_SECONDS = 120
CHILD_FRESH_SECONDS = 30
HEALTHY_CHILD_SECONDS = 300
START_DELAY = 5
MAX_DELAY = 60
CONFIG_KEYS = {'version', 'enabled', 'guildId', 'channelId', 'ownerIds', 'python', 'secretName', 'node'}


def parse_config(raw):
    """Fail closed: any unknown or malformed field disables the gateway."""
    if not isinstance(raw, dict) or set(raw) - CONFIG_KEYS:
        raise ValueError('Discord config fields are invalid.')
    if raw.get('version') != 1 or type(raw.get('enabled')) is not bool:
        raise ValueError('Discord config version is invalid.')
    for key in ('guildId', 'channelId'):
        if not isinstance(raw.get(key), str) or not SNOWFLAKE.fullmatch(raw[key]):
            raise ValueError('Discord config IDs are invalid.')
    owners = raw.get('ownerIds')
    if not isinstance(owners, list) or not owners or any(not isinstance(x, str) or not SNOWFLAKE.fullmatch(x) for x in owners):
        raise ValueError('Discord config owner allowlist is invalid.')
    python = raw.get('python')
    if not isinstance(python, str) or not python.strip() or len(python) > 500:
        raise ValueError('Discord config python path is invalid.')
    name = raw.get('secretName')
    if name is not None and (not isinstance(name, str) or not name or len(name) > 200):
        raise ValueError('Discord config secret name is invalid.')
    node = raw.get('node', 'node')
    if not isinstance(node, str) or not node.strip() or len(node) > 500:
        raise ValueError('Discord config node launcher is invalid.')
    return dict(version=1, enabled=raw['enabled'], guildId=raw['guildId'], channelId=raw['channelId'],
                ownerIds=list(dict.fromkeys(owners)), python=python, secretName=name, node=node)


def load_config(state):
    """Validated config, or None when no discord.json exists (idle, keep heartbeating)."""
    path = Path(state) / 'discord.json'
    if not path.exists():
        return None
    private_file(path)
    return parse_config(json.loads(path.read_text(encoding='utf-8-sig')))


def read_secret(config, run=subprocess.run):
    """Token from the SDK-venv secret store; stdout is a pipe, stdin is closed."""
    command = [config['python'], '-X', 'utf8', str(TOOL / 'secret_store.py'), 'read', '--kind', 'discord-bot']
    if config.get('secretName'):
        command += ['--name', config['secretName']]
    result = run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60)
    if result.returncode:
        raise ValueError('Discord token is unavailable.')
    value = json.loads(result.stdout.decode('utf-8'))
    token = value.get('token') if isinstance(value, dict) else None
    if not isinstance(token, str) or not token or len(token) > 512:
        raise ValueError('Discord token is invalid.')
    if any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in token):
        raise ValueError('Discord token is invalid.')
    return token


def spawn_gateway(config, state, popen=subprocess.Popen):
    """Start the Node child with an open stdin pipe; no token in argv or env."""
    command = [config['node'], str(TOOL / 'discord_gateway.mjs'), '--state', str(state)]
    env = dict(os.environ, PASEO_BOT_PYTHON=sys.executable)
    return popen(command, cwd=str(TOOL), stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                 stderr=None, env=env)


def deliver(child, token):
    """Write the one JSON line and close stdin; the child keeps no copy on disk."""
    child.stdin.write((json.dumps({'token': token}) + '\n').encode('utf-8'))
    child.stdin.flush()
    child.stdin.close()


FATAL_AUTH_EXIT = 4
FATAL_AUTH_DELAY = 600


def next_delay(failures):
    return min(MAX_DELAY, START_DELAY * 2 ** max(0, failures - 1))


class Runner:
    """One supervise step at a time so the loop stays testable without a network."""

    def __init__(self, state, spawn=None, secret=read_secret, clock=time.time):
        self.state = Path(state)
        self.spawn = spawn or (lambda config: spawn_gateway(config, self.state))
        self.secret = secret
        self.clock = clock
        self.child = None
        self.child_started = 0.0
        self.failures = 0
        self.next_start = 0.0
        self.enabled = False
        self.config_error = False
        self.running = True
        self.written = None
        self.written_at = 0.0

    def config(self):
        return load_config(self.state)

    def child_health(self):
        try:
            return json.loads((self.state / CHILD_HEALTH).read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return {}

    def stale(self, now):
        if self.child is None:
            return False
        health = self.child_health()
        if health.get('pid') != self.child.pid:
            return False
        return now - health.get('lastTickAt', 0) > CHILD_STALE_SECONDS

    def gateway_status(self, now):
        if self.child is None:
            return 'error' if self.failures else 'connecting'
        health = self.child_health()
        if health.get('pid') == self.child.pid and now - health.get('lastTickAt', 0) <= CHILD_FRESH_SECONDS:
            value = health.get('status')
            if value in ('connected', 'connecting', 'disabled', 'error'):
                return value
        return 'connecting'

    def write_health(self, now, gateway):
        payload = dict(version=1, pid=os.getpid(), lastTickAt=now, enabled=self.enabled,
                       gateway=gateway, childPid=self.child.pid if self.child is not None else None)
        if self.written is not None:
            current = {k: v for k, v in payload.items() if k != 'lastTickAt'}
            previous = {k: v for k, v in self.written.items() if k != 'lastTickAt'}
            if current == previous and now - self.written_at < 5:
                return
        try:
            write_json(self.state / HEALTH, payload)
            self.written, self.written_at = payload, now
        except (OSError, ValueError) as error:
            # A transient state-directory problem must not stop supervision.
            log_event(status='discord-health-error', error=describe(error))

    def step(self):
        now = self.clock()
        config = None
        try:
            config = self.config()
        except (ValueError, OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            if not self.config_error:
                log_event(status='discord-config-error', error=describe(error))
            self.config_error = True
        else:
            self.config_error = False
        self.enabled = bool(config and config['enabled'])
        if not self.enabled:
            self.terminate(reason='disabled')
            self.failures, self.next_start = 0, 0.0
            self.write_health(now, 'error' if self.config_error else 'disabled')
            return
        if self.child is not None:
            try:
                code = self.child.poll()
            except OSError:
                code = 0
            if code is not None:
                self.reaped(now, 'child exited with code ' + str(code), code)
            elif self.stale(now):
                self.terminate(reason='child heartbeat stale')
                self.reaped(now, 'child heartbeat stale')
        if self.child is None and now >= self.next_start:
            self.start(now, config)
        self.write_health(now, self.gateway_status(now))

    def start(self, now, config):
        try:
            token = self.secret(config)
        except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as error:
            log_event(status='discord-secret-error', error=describe(error))
            self.failures += 1
            self.next_start = now + next_delay(self.failures)
            return
        child = None
        try:
            child = self.spawn(config)
            deliver(child, token)
        except (OSError, ValueError) as error:
            log_event(status='discord-child-error', error=describe(error))
            if child is not None:
                try:
                    child.kill()
                except OSError:
                    pass
            self.failures += 1
            self.next_start = now + next_delay(self.failures)
            return
        finally:
            token = None
        self.child = child
        self.child_started = now
        log_event(status='discord-child-start', pid=child.pid)

    def reaped(self, now, reason, code=None):
        lived = now - self.child_started
        self.child = None
        if lived >= HEALTHY_CHILD_SECONDS:
            self.failures = 0
        self.failures += 1
        delay = next_delay(self.failures)
        if code == FATAL_AUTH_EXIT:
            # Token rejected or intents disabled: retrying every minute cannot fix it.
            delay = max(delay, FATAL_AUTH_DELAY)
        self.next_start = now + delay
        log_event(status='discord-child-exit', reason=reason, delay=delay, failures=self.failures)

    def terminate(self, reason='stop'):
        child, self.child = self.child, None
        if child is None:
            return
        log_event(status='discord-child-stop', reason=reason, pid=child.pid)
        try:
            child.terminate()
        except OSError:
            pass
        try:
            child.wait(timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            try:
                child.kill()
            except OSError:
                pass


def serve(runner):
    def stop(*_):
        runner.running = False
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        with lock(runner.state, 'discord.lock'):
            while runner.running:
                try:
                    runner.step()
                except Exception as error:  # one bad tick never ends supervision
                    log_event(status='discord-step-error', error=describe(error))
                for _ in range(10):
                    if not runner.running or stop_requested(runner.state, 'discord_serve'):
                        runner.running = False
                        break
                    time.sleep(0.1)
    finally:
        runner.terminate(reason='shutdown')


def check(state):
    """Read-only readiness report; never prints the token."""
    out = dict(ok=False, enabled=False, problems=[], secret='not-checked', node='', python='')
    try:
        config = load_config(state)
    except (ValueError, OSError, UnicodeDecodeError, json.JSONDecodeError):
        out['problems'].append('config-invalid')
        return out
    if config is None:
        out['problems'].append('config-missing')
        return out
    out.update(enabled=config['enabled'], guildId=config['guildId'], channelId=config['channelId'],
               owners=len(config['ownerIds']), python=config['python'], node=config['node'])
    if not Path(config['python']).is_file():
        out['problems'].append('python-missing')
    if not shutil.which(config['node']):
        out['problems'].append('node-missing')
    try:
        read_secret(config)
        out['secret'] = 'ok'
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError):
        out['secret'] = 'error'
        out['problems'].append('secret-unreadable')
    out['ok'] = not out['problems']
    return out


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=Path.home() / '.config/paseo-bot')
    parser.add_argument('command', choices=['serve', 'check'])
    args = parser.parse_args(argv)
    if args.command == 'check':
        report = check(args.state)
        print(json.dumps(report, ensure_ascii=False))
        return 0 if report['ok'] else 1
    serve(Runner(args.state))
    return 0


if __name__ == '__main__':
    sys.exit(main())
