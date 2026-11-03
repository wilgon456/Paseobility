"""Offline Discord service contracts. No network, no Discord, no real secret store."""
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/paseo-bot'))
import discord_serve

BASE = dict(version=1, enabled=True, guildId='111111111111111111', channelId='222222222222222222',
            ownerIds=['333333333333333333'], python='/opt/sdk-venv/bin/python')


def write_config(state, **overrides):
    path = Path(state) / 'discord.json'
    path.write_text(json.dumps(dict(BASE, **overrides)), encoding='utf-8')
    path.chmod(0o600)
    return path


def read_health(state):
    return json.loads((Path(state) / 'discord-health.json').read_text(encoding='utf-8'))


class FakeStdin:
    def __init__(self):
        self.data = b''
        self.closed = False

    def write(self, data):
        self.data += data

    def flush(self):
        pass

    def close(self):
        self.closed = True


class FakeChild:
    def __init__(self, pid):
        self.pid = pid
        self.returncode = None
        self.stdin = FakeStdin()
        self.terminated = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def kill(self):
        self.terminated = True
        self.returncode = -9

    def wait(self, timeout=None):
        return self.returncode


class Spawner:
    def __init__(self):
        self.children = []
        self.configs = []

    def __call__(self, config):
        child = FakeChild(1000 + len(self.children))
        self.children.append(child)
        self.configs.append(config)
        return child


class Clock:
    def __init__(self, now=1000.0):
        self.now = now

    def __call__(self):
        return self.now


def build(state, spawn=None, secret=None, now=1000.0):
    clock = Clock(now)
    spawner = spawn or Spawner()
    runner = discord_serve.Runner(state, spawn=spawner, secret=secret or (lambda config: 'private-token-value'), clock=clock)
    return runner, clock, spawner


class ConfigTests(unittest.TestCase):
    def test_config_validation_is_strict(self):
        valid = discord_serve.parse_config(BASE)
        self.assertEqual(valid['node'], 'node')
        self.assertEqual(valid['ownerIds'], ['333333333333333333'])
        bad = [None, [], 'x', dict(BASE, version=2), dict(BASE, enabled=1), dict(BASE, guildId='123'),
               dict(BASE, channelId=5), dict(BASE, ownerIds=[]), dict(BASE, ownerIds=['123']),
               dict(BASE, python=''), dict(BASE, secretName=''), dict(BASE, node=7), dict(BASE, extra=True)]
        for value in bad:
            with self.assertRaises(ValueError):
                discord_serve.parse_config(value)

    def test_missing_config_is_not_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(discord_serve.load_config(tmp))

    @unittest.skipIf(os.name == 'nt', 'POSIX permissions')
    def test_world_readable_config_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_config(tmp)
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                discord_serve.load_config(tmp)


class IdleTests(unittest.TestCase):
    def assert_idle(self, state, gateway):
        health = read_health(state)
        self.assertEqual(health['gateway'], gateway)
        self.assertFalse(health['enabled'])
        self.assertEqual(health['pid'], os.getpid())
        self.assertIsNone(health['childPid'])
        self.assertEqual(health['version'], 1)

    def test_disabled_config_idles_and_keeps_heartbeating(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state, enabled=False)
            runner, clock, spawner = build(state)
            for tick in (0, 1, 2):
                clock.now = 1000.0 + tick
                runner.step()
                self.assert_idle(state, 'disabled')
            self.assertEqual(spawner.children, [])
            self.assertEqual(runner.failures, 0)

    def test_missing_config_idles(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner, clock, spawner = build(tmp)
            runner.step()
            self.assert_idle(tmp, 'disabled')
            self.assertEqual(spawner.children, [])

    def test_invalid_config_never_starts_a_child(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            path = write_config(state, guildId='not-a-snowflake')
            runner, clock, spawner = build(state)
            runner.step()
            runner.step()
            self.assert_idle(state, 'error')
            self.assertEqual(spawner.children, [])
            path.write_text('{not json', encoding='utf-8')
            clock.now += 10
            runner.step()
            self.assertEqual(spawner.children, [])
            self.assertEqual(read_health(state)['gateway'], 'error')

    def test_unreadable_secret_never_starts_a_child_and_backs_off(self):
        def unavailable(config):
            raise ValueError('Discord token is unavailable.')
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state)
            runner, clock, spawner = build(state, secret=unavailable)
            runner.step()
            self.assertEqual(spawner.children, [])
            self.assertEqual(runner.next_start, 1005.0)
            self.assertEqual(read_health(state)['gateway'], 'error')


class ChildTests(unittest.TestCase):
    def test_token_is_delivered_on_stdin_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state)
            runner, clock, spawner = build(state)
            runner.step()
            self.assertEqual(len(spawner.children), 1)
            child = spawner.children[0]
            self.assertEqual(json.loads(child.stdin.data.decode('utf-8')), {'token': 'private-token-value'})
            self.assertTrue(child.stdin.closed)
            self.assertNotIn('private-token-value', json.dumps(spawner.configs))
            health = read_health(state)
            self.assertTrue(health['enabled'])
            self.assertEqual(health['childPid'], child.pid)
            self.assertIn(health['gateway'], ('connecting', 'connected'))
            for path in state.iterdir():
                self.assertNotIn('private-token-value', path.read_text(encoding='utf-8', errors='replace'), path.name)

    def test_spawned_command_and_environment_never_carry_the_token(self):
        seen = {}

        class Popen:
            def __init__(self, command, **kwargs):
                seen['command'] = command
                seen['kwargs'] = kwargs
                self.pid = 4242
                self.stdin = FakeStdin()

        config = discord_serve.parse_config(dict(BASE))
        with tempfile.TemporaryDirectory() as tmp:
            child = discord_serve.spawn_gateway(config, Path(tmp), popen=Popen)
            discord_serve.deliver(child, 'sentinel-token-value')
        self.assertNotIn('sentinel-token-value', ' '.join(seen['command']))
        self.assertNotIn('sentinel-token-value', json.dumps(seen['kwargs'].get('env', {})))
        self.assertNotIn('sentinel-token-value', ''.join(seen['command']))
        self.assertIs(seen['kwargs']['stdin'], subprocess.PIPE)
        self.assertEqual(json.loads(child.stdin.data.decode('utf-8')), {'token': 'sentinel-token-value'})
        self.assertTrue(child.stdin.closed)

    def test_fatal_auth_exit_waits_ten_minutes(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state)
            runner, clock, spawner = build(state)
            runner.step()
            spawner.children[0].returncode = 4  # token rejected / intents disabled
            clock.now = 1001.0
            runner.step()
            self.assertGreaterEqual(runner.next_start, 1001.0 + 600)

    def test_child_crash_restarts_with_backoff(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state)
            runner, clock, spawner = build(state)
            runner.step()
            self.assertEqual(len(spawner.children), 1)
            spawner.children[0].returncode = 1
            clock.now = 1001.0
            runner.step()
            self.assertIsNone(runner.child)
            self.assertEqual(runner.failures, 1)
            self.assertEqual(runner.next_start, 1006.0)
            self.assertEqual(read_health(state)['gateway'], 'error')
            clock.now = 1003.0
            runner.step()
            self.assertEqual(len(spawner.children), 1, 'no restart before the delay')
            clock.now = 1006.0
            runner.step()
            self.assertEqual(len(spawner.children), 2)
            self.assertEqual(runner.failures, 1)
            spawner.children[1].returncode = 2
            clock.now = 1007.0
            runner.step()
            self.assertEqual(runner.failures, 2)
            self.assertEqual(runner.next_start, 1017.0)
            clock.now = 1017.0
            runner.step()
            self.assertEqual(len(spawner.children), 3)
            spawner.children[2].returncode = 1
            clock.now = 1018.0
            runner.step()
            self.assertEqual(runner.failures, 3)
            self.assertEqual(runner.next_start, 1038.0)

    def test_stale_child_heartbeat_is_terminated_and_restarted(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state)
            runner, clock, spawner = build(state, now=2000.0)
            runner.step()
            child = spawner.children[0]
            (state / 'discord-gateway.json').write_text(json.dumps({'pid': child.pid, 'lastTickAt': 2000.0, 'status': 'connected'}))
            clock.now = 2050.0
            runner.step()
            self.assertFalse(child.terminated)
            self.assertIs(runner.child, child)
            self.assertNotEqual(read_health(state)['gateway'], 'error')
            clock.now = 2121.0
            runner.step()
            self.assertTrue(child.terminated)
            self.assertIsNone(runner.child)
            self.assertEqual(runner.next_start, 2126.0)
            self.assertEqual(read_health(state)['gateway'], 'error')

    def test_healthy_child_is_adopted_not_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state)
            runner, clock, spawner = build(state, now=0.0)
            runner.step()
            (state / 'discord-gateway.json').write_text(json.dumps({'pid': 1000, 'lastTickAt': 0.0, 'status': 'connected'}))
            for tick in range(1, 60):
                clock.now = tick
                runner.step()
            self.assertEqual(len(spawner.children), 1)
            self.assertFalse(spawner.children[0].terminated)

    def test_healthy_long_run_resets_failures(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state)
            runner, clock, spawner = build(state, now=0.0)
            runner.step()
            spawner.children[0].returncode = 1
            clock.now = 1.0
            runner.step()
            self.assertEqual(runner.failures, 1)
            clock.now = 10.0
            runner.step()
            spawner.children[1].returncode = 0
            clock.now = 400.0
            runner.step()
            self.assertEqual(runner.failures, 1, 'a long healthy run resets the count first')


class ServeTests(unittest.TestCase):
    def test_stop_file_ends_the_loop_and_the_child(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state)
            spawner = Spawner()
            runner = discord_serve.Runner(state, spawn=spawner, secret=lambda config: 'private-token-value')
            (state / 'discord_serve.stop').write_text(str(os.getpid()), encoding='utf-8')
            started = time.time()
            discord_serve.serve(runner)
            self.assertLess(time.time() - started, 10)
            self.assertFalse(runner.running)
            self.assertIsNone(runner.child)
            self.assertEqual(len(spawner.children), 1)
            self.assertTrue(spawner.children[0].terminated)
            self.assertFalse((state / 'discord_serve.stop').exists())


class CheckTests(unittest.TestCase):
    def test_check_reports_readiness_without_the_secret(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state, python=sys.executable)
            with patch.object(discord_serve, 'read_secret', return_value='sentinel-token-value'), \
                    patch.object(discord_serve.shutil, 'which', return_value='/usr/bin/node'):
                report = discord_serve.check(state)
            self.assertTrue(report['ok'], report)
            self.assertTrue(report['enabled'])
            self.assertEqual(report['secret'], 'ok')
            self.assertNotIn('sentinel-token-value', json.dumps(report))

    def test_check_reports_problems_and_never_the_secret(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            write_config(state, python='/nonexistent/sdk-venv/python')
            with patch.object(discord_serve, 'read_secret', side_effect=ValueError('sentinel-token-value')), \
                    patch.object(discord_serve.shutil, 'which', return_value=None):
                report = discord_serve.check(state)
            self.assertFalse(report['ok'])
            self.assertEqual(report['secret'], 'error')
            self.assertIn('secret-unreadable', report['problems'])
            self.assertIn('node-missing', report['problems'])
            self.assertIn('python-missing', report['problems'])
            self.assertNotIn('sentinel-token-value', json.dumps(report))

    def test_check_without_config_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = discord_serve.check(tmp)
            self.assertFalse(report['ok'])
            self.assertEqual(report['problems'], ['config-missing'])
            self.assertEqual(report['secret'], 'not-checked')


if __name__ == '__main__':
    unittest.main()
