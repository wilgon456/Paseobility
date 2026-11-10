import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findBrowser, run } from './design-check.mjs';

test('discovery prefers Ego, then Chrome, and never automatically selects Edge', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const stat = fs.statSync;
  const saved = [process.env.DESIGN_CHECK_BROWSER, process.env.CHROME_PATH];
  delete process.env.DESIGN_CHECK_BROWSER;
  delete process.env.CHROME_PATH;
  try {
    for (const host of ['darwin', 'win32']) {
      Object.defineProperty(process, 'platform', { value: host });
      const ego = host === 'darwin' ? /ego lite.*MacOS/ : /ego\.exe$/;
      const chrome = host === 'darwin' ? /Google Chrome.*MacOS/ : /chrome\.exe$/;
      const edge = /Microsoft.*Edge|msedge\.exe$/;
      let available = [ego, chrome, edge];
      fs.statSync = p => {
        if (available.some(re => re.test(String(p)))) return { isFile: () => true };
        throw new Error('fixture: absent');
      };
      assert.match(findBrowser(), ego);
      available = [chrome, edge];
      assert.match(findBrowser(), chrome);
      available = [edge];
      assert.equal(findBrowser(), null);
    }
  } finally {
    Object.defineProperty(process, 'platform', platform);
    fs.statSync = stat;
    for (const [i, name] of ['DESIGN_CHECK_BROWSER', 'CHROME_PATH'].entries()) {
      if (saved[i] === undefined) delete process.env[name];
      else process.env[name] = saved[i];
    }
  }
});

test('invalid render options fail before launching a browser', async () => {
  for (const args of [
    ['--widths', '0'], ['--widths', '375,nope'], ['--widths', '375px'],
    ['--scheme', ','], ['--scheme', 'sepia'], ['--fail-on', 'typo'],
    ['--timeout', '0'], ['--max-height', '-1'], ['--wait', 'NaN'],
  ]) {
    await assert.rejects(run(['about:blank', ...args]), /invalid/i, args.join(' '));
  }
});

test('a browser spawn failure is a tool error and removes its temporary profile', {
  skip: process.platform === 'win32',
}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-check-spawn-test-'));
  try {
    const binary = path.join(dir, 'non-executable-browser');
    fs.writeFileSync(binary, '', { mode: 0o600 });
    const script = fileURLToPath(new URL('./design-check.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, 'about:blank', '--widths', '375', '--no-sheet'], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, DESIGN_CHECK_BROWSER: binary, TMPDIR: dir },
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout + result.stderr, /EACCES/);
    assert.ok(!result.stderr.includes("Unhandled 'error' event"), result.stderr);
    assert.deepEqual(fs.readdirSync(dir).filter(name => name.startsWith('design-check-profile-')), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
