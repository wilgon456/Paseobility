import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('chrome_tabs', Path(__file__).with_name('chrome-tabs.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class Browser:
    def __init__(self):
        self.state = {'instance': 'chrome-1', 'windows': [
            {'id': 'w1', 'mode': 'normal', 'tabs': [{'id': 'user', 'url': 'https://user.invalid/'}]},
            {'id': 'w2', 'mode': 'normal', 'tabs': [{'id': 'other-agent', 'url': 'https://other.invalid/'}]}]}
        self.count = 0
        self.timeout_create = False
        self.fail_navigation = False
        self.fail_close = False

    def call(self, action, **kw):
        if action == 'snapshot':
            return copy.deepcopy(self.state)
        assert kw['instance'] == self.state['instance']
        if action == 'create':
            self.count += 1
            tab = {'id': 'task-' + str(self.count), 'url': kw['marker']}
            next(w for w in self.state['windows'] if w['id'] == kw['windowId'])['tabs'].append(tab)
            if self.timeout_create:
                raise TimeoutError('reply lost after creation')
            return {'id': tab['id']}
        for w in self.state['windows']:
            for tab in list(w['tabs']):
                if tab['id'] != kw['tabId']:
                    continue
                if action == 'navigate':
                    if self.fail_navigation:
                        raise RuntimeError('navigation failed')
                    tab['url'] = kw['url']
                elif action == 'close' and not self.fail_close:
                    w['tabs'].remove(tab)
                return {}
        return {}


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.browser = Browser()
        self.baseline = copy.deepcopy(self.browser.state)
        self.task = mod.TaskTab(self.temp.name, 'task-a', self.browser)

    def test_twenty_runs_reuse_tab_and_leave_window_and_user_tabs_unchanged(self):
        for _ in range(20):
            first = self.task.open('w1', 'https://first.invalid/')
            again = self.task.open('w1', 'https://second.invalid/')
            self.assertEqual(first['tabId'], again['tabId'])
            self.assertEqual(len(self.browser.state['windows']), 2)
            self.assertEqual(len(self.browser.state['windows'][0]['tabs']), 2)
            self.assertTrue(self.task.close()['verifiedAbsent'])
            self.assertEqual(self.browser.state, self.baseline)
        self.assertEqual(self.browser.count, 20)

    def test_error_in_work_closes_tab(self):
        with self.assertRaisesRegex(RuntimeError, 'work failed'):
            with self.task.session('w1', 'https://first.invalid/'):
                raise RuntimeError('work failed')
        self.assertEqual(self.browser.state, self.baseline)

    def test_navigation_error_closes_tab(self):
        self.browser.fail_navigation = True
        with self.assertRaisesRegex(RuntimeError, 'navigation failed'):
            self.task.open('w1', 'https://first.invalid/')
        self.assertEqual(self.browser.state, self.baseline)

    def test_creation_timeout_recovers_marker_without_duplicate(self):
        self.browser.timeout_create = True
        with self.assertRaises(TimeoutError):
            self.task.open('w1', 'https://first.invalid/')
        recovered = mod.TaskTab(self.temp.name, 'task-a', self.browser)
        self.browser.timeout_create = False
        recovered.open('w1', 'https://second.invalid/')
        self.assertEqual(self.browser.count, 1)
        recovered.close()
        self.assertEqual(self.browser.state, self.baseline)

    def test_fresh_process_can_close_unacknowledged_creation(self):
        self.browser.timeout_create = True
        with self.assertRaises(TimeoutError):
            self.task.open('w1', 'https://first.invalid/')
        mod.TaskTab(self.temp.name, 'task-a', self.browser).close()
        self.assertEqual(self.browser.state, self.baseline)

    def test_missing_creation_marker_fails_closed_without_creating_again(self):
        self.browser.timeout_create = True
        with self.assertRaises(TimeoutError):
            self.task.open('w1', 'https://first.invalid/')
        self.browser.state = copy.deepcopy(self.baseline)
        self.browser.timeout_create = False
        with self.assertRaisesRegex(RuntimeError, 'Ambiguous'):
            self.task.open('w1', 'https://second.invalid/')
        self.assertEqual(self.browser.count, 1)
        self.assertEqual(self.browser.state, self.baseline)

    def test_restart_with_recycled_tab_id_never_closes_user_tab(self):
        result = self.task.open('w1', 'https://first.invalid/')
        self.browser.state['instance'] = 'chrome-2'
        self.browser.state['windows'][0]['tabs'][-1]['url'] = 'https://user.invalid/new'
        before = copy.deepcopy(self.browser.state)
        with self.assertRaisesRegex(RuntimeError, 'restarted'):
            self.task.close()
        self.assertEqual(self.browser.state, before)
        self.assertIn(result['tabId'], mod.tabs(before))

    def test_other_task_is_preserved(self):
        self.task.open('w1', 'https://first.invalid/')
        other = mod.TaskTab(self.temp.name, 'task-b', self.browser)
        result = other.open('w1', 'https://second.invalid/')
        self.task.close()
        self.assertIn(result['tabId'], mod.tabs(self.browser.state))
        other.close()
        self.assertEqual(self.browser.state, self.baseline)

    def test_missing_window_does_not_create_window_or_tab(self):
        with self.assertRaisesRegex(RuntimeError, 'current normal window'):
            self.task.open('gone', 'https://first.invalid/')
        self.assertEqual(self.browser.count, 0)
        self.assertEqual(self.browser.state, self.baseline)

    def test_wrong_window_creation_is_cleaned_up_not_reused(self):
        original = self.browser.call
        def misplaced(action, **kwargs):
            if action == 'create':
                kwargs['windowId'] = 'w2'
            return original(action, **kwargs)
        self.browser.call = misplaced
        with self.assertRaisesRegex(RuntimeError, 'different window'):
            self.task.open('w1', 'https://first.invalid/')
        self.assertEqual(self.browser.state, self.baseline)
        self.assertEqual(self.task.read()['status'], 'closed')

    def test_close_failure_retains_ownership_for_retry(self):
        self.task.open('w1', 'https://first.invalid/')
        self.browser.fail_close = True
        with self.assertRaisesRegex(RuntimeError, 'verify'):
            self.task.close()
        self.assertEqual(self.task.read()['status'], 'open')
        self.browser.fail_close = False
        self.task.close()
        self.assertEqual(self.browser.state, self.baseline)

    def test_already_closed_is_idempotent(self):
        self.task.open('w1', 'https://first.invalid/')
        self.task.close()
        self.assertFalse(self.task.close()['closed'])
        self.assertEqual(self.browser.state, self.baseline)

    @unittest.skipIf(__import__('sys').platform == 'win32', 'fcntl on macOS/Linux')
    def test_overlapping_lifecycle_calls_are_serialized(self):
        with self.task.locked():
            with self.assertRaisesRegex(RuntimeError, 'Another lifecycle'):
                self.task.open('w1', 'https://first.invalid/')
        self.assertEqual(self.browser.count, 0)


if __name__ == '__main__':
    unittest.main()
