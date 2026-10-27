import {existsSync} from 'node:fs';
// Preference order: an explicit CHROME_PATH, then Ego Lite, then Google Chrome.
// Microsoft Edge is never used. With no match Playwright's bundled Chromium runs.
export const candidates=(env=process.env)=>[
  env.CHROME_PATH,
  '/Applications/ego lite.app/Contents/MacOS/ego lite',
  'C:\\Program Files\\Citro Labs\\ego lite\\Application\\ego.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
].filter(Boolean);
export const pick=(env=process.env,exists=existsSync)=>candidates(env).find(p=>exists(p));
export const chrome=pick();
