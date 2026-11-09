import assert from 'node:assert/strict';
import test from 'node:test';
import {candidates, pick} from './browser.mjs';

const EGO_WIN = 'C:\\Program Files\\Citro Labs\\ego lite\\Application\\ego.exe';
const EGO_MAC = '/Applications/ego lite.app/Contents/MacOS/ego lite';
const CHROME_WIN = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

test('Windows never auto-selects Ego: every launch opens the Default apps settings window', () => {
  assert.ok(!candidates({}, 'win32').includes(EGO_WIN));
  assert.equal(pick({}, p => p === EGO_WIN || p === CHROME_WIN, 'win32'), CHROME_WIN);
  assert.equal(pick({}, p => p === EGO_WIN, 'win32'), undefined, 'falls back to Playwright Chromium');
  assert.equal(pick({CHROME_PATH: EGO_WIN}, p => p === EGO_WIN, 'win32'), EGO_WIN, 'explicit CHROME_PATH still wins');
});

test('macOS keeps Ego Lite ahead of Chrome', () => {
  assert.equal(pick({}, p => p === EGO_MAC || p.includes('Google Chrome'), 'darwin'), EGO_MAC);
});
