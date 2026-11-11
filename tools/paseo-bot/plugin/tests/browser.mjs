import {existsSync} from 'node:fs';
// Preference order: an explicit CHROME_PATH, then Ego Lite (macOS only), then Google Chrome.
// Microsoft Edge is never used. With no match Playwright's bundled Chromium runs.
// Windows Ego Lite opens the system Default apps settings window on every separate launch,
// even headless, so test runs never auto-select it there (see ps-design design-check).
export const candidates=(env=process.env,platform=process.platform)=>[
  env.CHROME_PATH,
  '/Applications/ego lite.app/Contents/MacOS/ego lite',
  platform==='win32'?null:'C:\\Program Files\\Citro Labs\\ego lite\\Application\\ego.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
].filter(Boolean);
export const pick=(env=process.env,exists=existsSync,platform=process.platform)=>candidates(env,platform).find(p=>exists(p));
export const chrome=pick();
