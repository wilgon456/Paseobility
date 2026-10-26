import {existsSync} from 'node:fs';
export const chrome=[process.env.CHROME_PATH,'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/google-chrome'].find(p=>p&&existsSync(p));
