#!/usr/bin/env python3
"""Opt-in macOS lifecycle test: transient tabs in a specified existing Chrome window.
Never run implicitly during installation. Preserves baseline tabs/windows.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location('chrome_tabs', Path(__file__).with_name('chrome-tabs.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--window', required=True)
    p.add_argument('--runs', type=int, default=5)
    args = p.parse_args()
    if not 1 <= args.runs <= 20:
        p.error('--runs must be 1..20')
    backend = m.Chrome()
    baseline = backend.call('snapshot')
    def layout(s):
        return {w['id']: sorted(t['id'] for t in w['tabs']) for w in s['windows']}
    state = tempfile.mkdtemp(prefix='paseo-chrome-tab-test-')
    print(json.dumps({'recoveryState': state}), flush=True)
    try:
        task = m.TaskTab(state, 'live-lifecycle', backend)
        try:
            for cycle in range(args.runs):
                for fail in (False, True):
                    try:
                        with task.session(args.window, 'about:blank#paseobility-test-a') as first:
                            again = task.open(args.window, 'about:blank#paseobility-test-b')
                            assert first['tabId'] == again['tabId'], 'task tab was not reused'
                            during = backend.call('snapshot', instance=baseline['instance'])
                            assert set(layout(during)) == set(layout(baseline)), 'window count/IDs changed'
                            assert len(m.tabs(during)) == len(m.tabs(baseline)) + 1, 'unexpected tab accumulation'
                            assert m.tabs(during)[first['tabId']][1]['url'] == 'about:blank#paseobility-test-b'
                            if fail:
                                raise ValueError('injected task failure')
                    except ValueError as e:
                        if not fail or str(e) != 'injected task failure':
                            raise
                    after = backend.call('snapshot', instance=baseline['instance'])
                    assert after['instance'] == baseline['instance'], 'Chrome restarted'
                    assert layout(after) == layout(baseline), 'baseline layout changed'
                    print(json.dumps({'cycle': cycle + 1, 'injectedFailure': fail,
                                      'windows': len(after['windows']), 'tabs': len(m.tabs(after)),
                                      'baselinePreserved': True}), flush=True)
        finally:
            task.close()
        # Separate CLI processes must recover the same journal, including a
        # controller that exits after creation but before recording the ID.
        recovery_task = m.TaskTab(state, 'live-process-recovery', backend)
        helper = str(Path(__file__).with_name('chrome-tabs.py'))
        child = '''import importlib.util,sys,os
s=importlib.util.spec_from_file_location('ct',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class CrashAfterCreate(m.Chrome):
 def call(self,action,**kw):
  result=super().call(action,**kw)
  if action=='create': os._exit(73)
  return result
m.TaskTab(sys.argv[2],'live-process-recovery',CrashAfterCreate()).open(sys.argv[3],'about:blank')
'''
        try:
            crashed = subprocess.run([sys.executable, '-B', '-c', child, helper, state, args.window], timeout=60)
            assert crashed.returncode == 73, 'fault injection did not reach creation'
            leaked = backend.call('snapshot', instance=baseline['instance'])
            owned_ids = set(m.tabs(leaked)) - set(m.tabs(baseline))
            assert len(owned_ids) == 1, 'expected exactly one recoverable test tab'
            command = [sys.executable, '-B', helper, 'open', '--task', 'live-process-recovery',
                       '--state-dir', state, '--window', args.window, '--url', 'about:blank']
            result = subprocess.run(command, capture_output=True, text=True, timeout=60, check=True)
            assert json.loads(result.stdout)['tabId'] in owned_ids, 'recovery created a duplicate tab'
        finally:
            recovery_task.close()
        assert layout(backend.call('snapshot', instance=baseline['instance'])) == layout(baseline)
        print(json.dumps({'processDeathRecovery': True, 'duplicateTabs': 0, 'baselinePreserved': True}), flush=True)
    except BaseException:
        print(json.dumps({'recoveryStatePreserved': state}), flush=True)
        raise
    else:
        shutil.rmtree(state)
    print(json.dumps({'passed': args.runs * 2 + 1, 'windowIds': sorted(layout(baseline)),
                      'baselineTabs': len(m.tabs(baseline))}), flush=True)


if __name__ == '__main__':
    main()
