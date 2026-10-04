#!/usr/bin/env node
// design-check: render pages at phone/tablet/desktop widths in a headless
// Chromium (Chrome, Edge, Chromium or a Playwright download), measure layout
// and typography in the page, save clean + marked screenshots and a report.
// Zero npm dependencies: talks to the browser over --remote-debugging-pipe.
//
//   node design-check.mjs <url|file.html>... [options]
//   node design-check.mjs --selftest
//
// Exit codes: 0 pass, 1 findings at the --fail-on level (or new findings over
// --baseline), 2 tool error (no browser, page failed to load).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEASURE = fs.readFileSync(path.join(HERE, 'measure.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '').trim();
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const HINTS = {
  'overflow-x': '고정 폭(px)·min-width·줄바꿈 안 되는 긴 글자를 찾는다. max-width:100%, flex-wrap:wrap, minmax(0,1fr)로 줄이고, 긴 글자 때문에 못 줄어드는 칸에만 min-width:0이나 overflow-wrap:anywhere를 준다.',
  'cut-off-x': 'html/body의 overflow-x:hidden이 넘침을 가리고 있다. 숨기지 말고 넘치는 요소의 폭을 고친다.',
  'viewport-meta': '<head>에 <meta name="viewport" content="width=device-width, initial-scale=1">를 넣는다.',
  'text-overlap': '음수 여백·절대 위치·고정 높이를 찾는다. 겹치는 두 요소가 같은 흐름 안에서 gap으로 떨어지게 한다.',
  'text-clipped': '글자가 들어가는 칸에 고정 높이·고정 폭을 주지 않는다. 꼭 잘라야 하면 말줄임(text-overflow:ellipsis)이나 line-clamp를 쓴다.',
  'contrast': '글자색을 진하게(또는 배경을 바꿔) 일반 글자 4.5:1, 큰 글자 3:1 이상으로 맞춘다. 흐린 회색 본문을 피한다.',
  'tap-target': '버튼·링크의 누르는 영역을 최소 44px(최저 24px)로 키운다. 글자는 그대로 두고 padding이나 min-height로 키운다.',
  'tap-target-44': '폰에서 자주 누르는 것은 44px 이상으로 키운다.',
  'tiny-text': '10px 미만 글자는 쓰지 않는다. 최소 12px, 본문은 14~16px.',
  'small-text': '12px 미만은 보조 정보에만, 가능하면 12px 이상으로 올린다.',
  'hangul-break': 'body에 word-break: keep-all; overflow-wrap: break-word;를 한 번 준다. anywhere를 전체에 주면 칸이 한 글자 폭까지 줄어 라벨·단추가 쪼개지니 꼭 줄어들어야 하는 칸에만 쓴다. 제목은 text-wrap: balance도 같이 준다.',
  'orphan-line': '제목에 text-wrap: balance를 주거나 문장을 줄여 마지막 줄에 한두 글자만 남지 않게 한다.',
  'align-x': '같은 묶음의 왼쪽 선을 하나로 맞춘다. 대개 형제끼리 padding·margin·border 두께가 다르거나, 테두리 없는 칸에만 안쪽 여백이 있다.',
  'align-r': '같은 묶음의 오른쪽 끝선을 맞춘다. 폭을 컨테이너 기준(100%·같은 grid 열)으로 정한다.',
  'align-top': '한 줄에 놓인 상자들은 같은 부모에서 align-items: start(또는 stretch)로 윗선을 맞추고, 개별 margin-top을 없앤다.',
  'row-height': '한 줄에 놓이는 입력칸·버튼은 같은 높이 토큰(예: --control-h: 40px, 폰 44px)을 쓴다.',
  'row-center': '줄을 감싼 부모에 display:flex; align-items:center를 주고 개별 margin-top/vertical-align을 없앤다.',
  'icon-text-center': '아이콘과 글자를 감싼 줄에 align-items:center를 주고, 아이콘은 display:block(또는 flex: none)로 바꾼다.',
  'chip-center': '동그라미·네모 칩은 display:grid; place-items:center로 가운데를 잡고 아이콘은 display:block으로 둔다.',
  'gap-rhythm': '형제마다 margin을 주지 말고 부모의 gap 하나로 간격을 정한다.',
  'card-height': '같은 줄 카드는 grid로 놓고 높이를 늘여(align-items: stretch) 맞춘다. 내용 길이 차이는 카드 안에서 흡수한다.',
  'container-drift': '모든 구역이 같은 컨테이너(같은 max-width·같은 좌우 padding)를 쓰게 한다.',
  'cramped-heading': '제목 위 간격을 본문 간격보다 크게(예: 24~48px) 준다. 고정 머리줄 밑에는 그 높이만큼 여백을 둔다.',
  'line-length': '문단 폭을 max-width: 40em(한글 약 30~45자) 안쪽으로 줄인다.',
  'line-height': '한글 본문은 line-height 1.6~1.75, 영문은 1.5 안팎.',
  'hangul-tracking': '한글 본문의 letter-spacing은 0(또는 -0.01em)으로 둔다. 벌리는 것은 영문 대문자 꼬리표에만.',
  'hangul-font': 'font-family 맨 앞에 "Pretendard Variable", Pretendard, "Noto Sans KR" 같은 한글 글꼴을 둔다.',
  'spacing-scale': '여백은 4px 눈금(4·8·12·16·24·32·48·64) 토큰에서만 고른다.',
  'type-scale': '글자 크기는 6~7단계 토큰(예: 12·14·16·20·24·32)만 쓴다.',
  'type-twins': '1.5px도 차이 안 나는 크기는 하나로 합친다.',
  'radius-scale': '모서리는 컨트롤용·카드용 두세 값만 쓴다.',
  'shadow-scale': '그림자는 두세 단계 토큰만 쓴다.',
  'ai-gradient': '브랜드가 요구하지 않으면 장식 그라데이션을 걷어 내고 단색 면·여백·글자 크기로 위계를 만든다.',
  'ai-glow': '색 그림자·흐린 빛 덩어리를 지운다.',
  'ai-glass': '유리 효과는 실제로 뒤에 내용이 비칠 때만 쓴다.',
  'ai-eyebrow': '모든 제목 위에 대문자 꼬리표를 달지 않는다. 정말 분류가 필요할 때만 쓴다.',
  'ai-accent-rail': '왼쪽 색 막대 대신 제목·여백으로 묶음을 보여 준다.',
  'ai-nested-cards': '카드 안에는 카드 대신 구분선·여백·배경 한 톤으로 나눈다.',
  'ai-emoji-icons': '이모지 대신 프로젝트의 아이콘 세트(한 종류)를 쓰거나 아이콘 없이 간다.',
  'ai-center-stack': '여러 줄 문단은 왼쪽 정렬한다. 가운데 정렬은 짧은 제목·한 줄 문구에만.',
  'ai-big-numbers': '큰 숫자 띠는 실제 근거 있는 수치일 때만, 한 번만 쓴다.',
  'ai-arrow-cta': '단추 글에 화살표를 붙이지 않는다. 무엇이 일어나는지 동사로 쓴다.',
  'ai-icon-topper': '카드마다 아이콘을 얹지 말고, 아이콘이 정말 구분에 도움이 될 때만 제목 옆에 작게 둔다.',
  'image-distorted': 'img에 object-fit: cover(또는 contain)를 주거나 width·height 중 하나만 정해 원본 비율을 지킨다.',
  'img-alt': '뜻이 있는 그림은 내용을 alt에 쓰고, 장식 그림은 alt=""로 비운다.',
  'control-text-center': '단추의 위아래 padding을 같게 하고 line-height를 글자 크기에 맞춘다. 가장 확실한 것은 display:inline-flex; align-items:center에 height만 정하는 것이다.',
  'control-heights': '단추·입력칸 높이를 토큰 하나(폰 44px, 데스크톱 40px)로 통일하고, 작은 보조 단추만 둘째 값으로 둔다.',
  'icon-size-mix': '한 줄의 아이콘은 같은 크기(보통 16 또는 20px)와 같은 선 굵기로 맞춘다.',
  'text-colors': '글자색을 토큰 넷(먹색·흐린색·강조색·상태색)으로 줄이고 나머지는 토큰을 참조하게 한다.',
  'infinite-animation': '@media (prefers-reduced-motion: reduce) 안에서 animation을 끄거나, 로딩 표시처럼 꼭 필요한 것만 남긴다.',
  'focus-invisible': 'outline:none을 지우거나 :focus-visible에 보이는 테두리(outline 2px + offset 2px)나 ring을 넣는다.',
  'contrast-unmeasured': '그림·그라데이션 위 글자는 반투명한 어두운 막(scrim)을 깔거나 글자에 배경판을 주고, 가장 밝은 자리에서 대비를 눈으로 확인한다.',
  'screenshot-cut': '--max-height 값을 올리거나 긴 쪽을 구역별 주소로 나눠 돌린다.',
  'tool-error': '주소·서버 상태·로그인 여부를 확인하고 다시 돌린다. 검사 자체가 돌지 않은 것이지 통과한 것이 아니다.',
};

const LABEL = { error: '오류', warn: '경고', info: '참고' };
const ORDER = { error: 0, warn: 1, info: 2 };

// Keyboard-focus probe. Runs after the screenshots because focusing can open menus or move the page.
const FOCUS_JS = `(() => {
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[tabindex]:not([tabindex="-1"])';
  const out = []; let checked = 0, skipped = 0;
  // transitions would make the ring invisible at the instant we look, so switch them off for the probe
  const st = document.createElement('style'); st.id = '__dc_notrans'; st.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important}'; document.head.appendChild(st);
  const vis = (el) => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
  const snap = (el) => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join('|'); };
  const path = (el) => { let p = el.tagName.toLowerCase(); if (el.id) p += '#' + el.id; else if (el.classList.length) p += '.' + [...el.classList].slice(0, 2).join('.'); return p; };
  for (const el of document.querySelectorAll(SEL)) {
    if (checked >= 24) break;
    if (!vis(el) || el.disabled) continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const before = snap(el);
    try { el.focus({ preventScroll: true }); } catch (e) { continue; }
    if (document.activeElement !== el) continue;
    if (!el.matches(':focus-visible')) { skipped++; el.blur(); continue; }
    const s = getComputedStyle(el);
    const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || snap(el) !== before;
    checked++;
    if (!ring) out.push({ sel: path(el), text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30), rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } });
    el.blur();
  }
  st.remove();
  return { checked, skipped, invisible: out };
})()`;

// ---------------- browser discovery ----------------
function exists(p) { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } }
function globChromium(root, sub) {
  try {
    return fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1])
      .flatMap((d) => sub.map((s) => path.join(root, d, s))).filter(exists);
  } catch { return []; }
}
export function findBrowser() {
  const env = process.env.DESIGN_CHECK_BROWSER || process.env.CHROME_PATH;
  if (env) return exists(env) ? env : null;
  const home = os.homedir();
  const c = [];
  if (process.platform === 'win32') {
    const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
    const pfx = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const la = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    c.push(path.join(pf, 'Google/Chrome/Application/chrome.exe'), path.join(pfx, 'Google/Chrome/Application/chrome.exe'), path.join(la, 'Google/Chrome/Application/chrome.exe'),
      path.join(pfx, 'Microsoft/Edge/Application/msedge.exe'), path.join(pf, 'Microsoft/Edge/Application/msedge.exe'));
    c.push(...globChromium(path.join(la, 'ms-playwright'), ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']));
  } else if (process.platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
    c.push(...globChromium(path.join(home, 'Library/Caches/ms-playwright'), ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']));
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']) {
      const r = spawnSync('which', [name], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) c.push(r.stdout.trim());
    }
    c.push(...globChromium(path.join(home, '.cache/ms-playwright'), ['chrome-linux/chrome', 'chrome-linux64/chrome']));
  }
  return c.find(exists) || null;
}

// ---------------- CDP over pipe ----------------
class Browser {
  constructor(exe) {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-check-profile-'));
    const args = ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-sync', '--disable-component-update', '--disable-default-apps', '--hide-scrollbars',
      '--mute-audio', '--force-color-profile=srgb', '--disable-features=Translate,MediaRouter,OptimizationHints', `--user-data-dir=${this.dir}`, 'about:blank'];
    if (process.platform === 'linux') { args.push('--disable-dev-shm-usage'); if ((process.getuid && process.getuid() === 0) || process.env.DESIGN_CHECK_NO_SANDBOX) args.push('--no-sandbox'); }
    this.proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], windowsHide: true });
    this.err = '';
    this.proc.stderr.on('data', (d) => { this.err = (this.err + d).slice(-4000); });
    this.out = this.proc.stdio[3];
    this.in = this.proc.stdio[4];
    this.seq = 0; this.pending = new Map(); this.listeners = new Set();
    let buf = Buffer.alloc(0);
    this.in.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      let i;
      while ((i = buf.indexOf(0)) >= 0) {
        const raw = buf.subarray(0, i).toString('utf8'); buf = buf.subarray(i + 1);
        let m; try { m = JSON.parse(raw); } catch { continue; }
        if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(`${p.method}: ${m.error.message}`)) : p.res(m.result); }
        else if (m.method) for (const l of [...this.listeners]) l(m);
      }
    });
    this.closed = new Promise((res) => this.proc.on('exit', res));
    this.proc.on('exit', () => { for (const p of this.pending.values()) p.rej(new Error('browser exited: ' + this.err.split('\n').slice(-3).join(' '))); this.pending.clear(); });
  }
  send(method, params = {}, sessionId, timeout = 30000) {
    const id = ++this.seq; const msg = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method}: timeout`)); }, timeout);
      this.pending.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); }, method });
      this.out.write(JSON.stringify(msg) + '\0');
    });
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  waitFor(pred, timeout) {
    return new Promise((res) => { const off = this.on((m) => { if (pred(m)) { off(); clearTimeout(t); res(m); } }); const t = setTimeout(() => { off(); res(null); }, timeout); });
  }
  async close() {
    try { await this.send('Browser.close', {}, undefined, 3000); } catch { /* already gone */ }
    await Promise.race([this.closed, new Promise((r) => setTimeout(r, 3000))]);
    try { this.proc.kill(); } catch { /* ignore */ }
    for (let i = 0; i < 5; i++) { try { fs.rmSync(this.dir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
  }
}

async function openTab(b) {
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p, t) => b.send(m, p, sessionId, t);
  await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable');
  let inflight = 0, last = Date.now();
  b.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Network.requestWillBeSent') { inflight++; last = Date.now(); }
    else if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') { inflight = Math.max(0, inflight - 1); last = Date.now(); }
  });
  const idle = async (quiet = 500, max = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (inflight <= 0 && Date.now() - last >= quiet) return; await new Promise((r) => setTimeout(r, 100)); } };
  const evaluate = async (expression, timeout = 60000) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
    if (r.exceptionDetails) throw new Error('page script: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  };
  return { targetId, sessionId, s, idle, evaluate, close: () => b.send('Target.closeTarget', { targetId }).catch(() => {}) };
}

// ---------------- one page at one width ----------------
async function checkOne(b, url, width, cfg) {
  const height = width <= 480 ? 844 : width <= 900 ? 1024 : 900;
  const tab = await openTab(b);
  const { s, idle, evaluate } = tab;
  try {
    const mobile = width < 600;
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: cfg.scheme }] });
    if (mobile) { await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await s('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA }); }
    const loaded = b.waitFor((m) => m.sessionId === tab.sessionId && m.method === 'Page.loadEventFired', cfg.timeout);
    const nav = await s('Page.navigate', { url }, cfg.timeout);
    if (nav.errorText) throw new Error(`load failed: ${nav.errorText}`);
    await loaded;
    await idle(500, 8000);
    await evaluate('document.fonts ? document.fonts.ready.then(() => true) : true', 15000).catch(() => {});
    await evaluate(`(async () => { const h = () => document.documentElement.scrollHeight; for (let y = 0; y < Math.min(h(), ${cfg.maxHeight}); y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 250)); return true; })()`, 60000).catch(() => {});
    await idle(400, 5000);
    if (cfg.wait) await new Promise((r) => setTimeout(r, cfg.wait));
    const res = await evaluate(`(${MEASURE})(${JSON.stringify({ ignore: cfg.ignore, disable: cfg.disable, deviceWidth: width })})`, 120000);
    if (res.meta.docHeight > cfg.maxHeight) res.findings.push({ level: 'info', rule: 'screenshot-cut', msg: `화면 그림은 ${cfg.maxHeight}px까지만 담았다(문서 ${res.meta.docHeight}px). --max-height로 늘릴 수 있다.`, targets: [], data: {} });
    // number findings and draw marks
    res.findings.forEach((f, i) => { f.n = i + 1; f.hint = HINTS[f.rule] || ''; });
    const shot = async (file) => {
      const m = await s('Page.getLayoutMetrics');
      const cs = m.cssContentSize || m.contentSize;
      const h = Math.min(Math.ceil(cs.height), cfg.maxHeight);
      const r = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.max(h, 1), scale: 1 } }, 90000);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    };
    const suffix = cfg.scheme && cfg.scheme !== 'light' ? '-' + cfg.scheme : '';
    const base = path.join(cfg.dir, `${cfg.slug}-${width}${suffix}`);
    const clean = await shot(base + '.png');
    const marks = res.findings.filter((f) => f.targets.length && f.level !== 'info').slice(0, 80).map((f) => ({ n: f.n, level: f.level, rects: f.targets.map((t) => t.rect) }));
    await evaluate(`(() => { const L = ${JSON.stringify(marks)}; const o = document.createElement('div'); o.id = '__dc_overlay';
      o.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
      for (const f of L) f.rects.forEach((r, k) => { const c = f.level === 'error' ? '#e11d48' : '#d97706';
        const d = document.createElement('div'); d.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid ' + c + ';background:' + c + '14;left:' + (r.x - 2) + 'px;top:' + (r.y - 2) + 'px;width:' + (r.w + 4) + 'px;height:' + (r.h + 4) + 'px';
        if (k === 0) { const t = document.createElement('span'); t.textContent = f.n; t.style.cssText = 'position:absolute;left:-2px;top:-18px;font:700 11px/16px system-ui,sans-serif;color:#fff;background:' + c + ';padding:0 4px;border-radius:3px'; d.appendChild(t); }
        o.appendChild(d); });
      document.documentElement.appendChild(o); return true; })()`);
    const marked = await shot(base + '-marked.png');
    await evaluate(`(() => { const o = document.getElementById('__dc_overlay'); if (o) o.remove(); return true; })()`);
    try {
      const fz = await evaluate(FOCUS_JS, 30000);
      if (fz && fz.invisible && fz.invisible.length) res.findings.push({ n: res.findings.length + 1, level: 'warn', rule: 'focus-invisible', msg: `키보드 초점이 보이지 않는 요소가 ${fz.invisible.length}개다(초점 검사 ${fz.checked}개 중).`, targets: fz.invisible.slice(0, 6), data: { checked: fz.checked, skipped: fz.skipped }, hint: HINTS['focus-invisible'] });
    } catch (e) { /* focus probing is best effort */ }
    return { width, scheme: cfg.scheme, clean, marked, ...res };
  } finally {
    await tab.close();
  }
}

async function contactSheet(b, cfg, pages) {
  const cols = pages.map((p) => {
    const view = p.width <= 480 ? 844 * 1.6 : p.width <= 900 ? 1024 * 1.3 : 900 * 1.3;
    const colW = 520;
    const scale = colW / p.width;
    return `<figure><figcaption>${p.width}px${p.scheme && p.scheme !== 'light' ? ' ' + p.scheme : ''} · 오류 ${p.findings.filter((f) => f.level === 'error').length} · 경고 ${p.findings.filter((f) => f.level === 'warn').length}</figcaption>
      <div style="width:${colW}px;height:${Math.round(view * scale)}px;overflow:hidden;border:1px solid #d4d4d8;background:#fff"><img src="${pathToFileURL(p.marked).href}" style="width:${colW}px;display:block"></div></figure>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#f4f4f5;font:14px system-ui,sans-serif;display:flex;gap:24px;align-items:flex-start}figure{margin:0}figcaption{margin:0 0 8px;font-weight:600;color:#18181b}</style>${cols}`;
  const file = path.join(cfg.dir, `${cfg.slug}-sheet.html`);
  fs.writeFileSync(file, html);
  const tab = await openTab(b);
  try {
    await tab.s('Emulation.setDeviceMetricsOverride', { width: 24 * 2 + pages.length * 544, height: 800, deviceScaleFactor: 1, mobile: false });
    const loaded = b.waitFor((m) => m.sessionId === tab.sessionId && m.method === 'Page.loadEventFired', 20000);
    await tab.s('Page.navigate', { url: pathToFileURL(file).href });
    await loaded;
    const m = await tab.s('Page.getLayoutMetrics');
    const cs = m.cssContentSize || m.contentSize;
    const r = await tab.s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 } });
    const out = path.join(cfg.dir, `${cfg.slug}-sheet.png`);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    fs.rmSync(file, { force: true });
    return out;
  } finally { await tab.close(); }
}

// ---------------- report ----------------
function toUrl(arg) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg) || arg.startsWith('about:') || arg.startsWith('data:')) return arg;
  const p = path.resolve(arg);
  if (!fs.existsSync(p)) throw new Error(`not a URL and no such file: ${arg}`);
  return pathToFileURL(p).href;
}
function slugOf(url) {
  let s = url.replace(/^file:\/\/\/?/, '').replace(/^[a-z]+:\/\//i, '').replace(/[?#].*$/, '');
  s = s.split(/[\\/]/).filter(Boolean).slice(-3).join('-').replace(/[^\w.-]+/g, '_').replace(/\.html?$/i, '');
  return (s || 'page').slice(0, 60);
}
const pageKey = (p) => `${p.width}${p.scheme && p.scheme !== 'light' ? '-' + p.scheme : ''}`;
function counts(pages) { const c = {}; for (const p of pages) { const k = pageKey(p); c[k] = {}; for (const f of p.findings) if (f.level !== 'info') c[k][f.rule] = (c[k][f.rule] || 0) + 1; } return c; }
function writeReport(cfg, url, pages, sheet) {
  const L = [];
  const errs = pages.reduce((a, p) => a + p.findings.filter((f) => f.level === 'error').length, 0);
  const warns = pages.reduce((a, p) => a + p.findings.filter((f) => f.level === 'warn').length, 0);
  L.push(`# design-check: ${url}`, '', `오류 ${errs} · 경고 ${warns} · ${new Date().toISOString()}`, '');
  if (sheet) L.push(`한눈에 보기: ${sheet}`, '');
  for (const p of pages) {
    L.push(`## ${p.width}px${p.scheme && p.scheme !== 'light' ? ' · ' + p.scheme : ''}`, '', `- 깨끗한 화면: ${p.clean}`, `- 표시한 화면: ${p.marked}`,
      `- 글자 크기 ${p.stats.fontSizes.length}종: ${p.stats.fontSizes.join(', ')} · 첫 글꼴: ${p.stats.firstFont} · 모서리: ${p.stats.radii.join(', ') || '-'}`, '');
    if (!p.findings.length) { L.push('걸린 것 없음.', ''); continue; }
    for (const f of [...p.findings].sort((a, b) => (ORDER[a.level] - ORDER[b.level]) || (a.n - b.n))) {
      L.push(`${f.n}. **${LABEL[f.level] || f.level} ${f.rule}**: ${f.msg}`);
      for (const t of f.targets.slice(0, 3)) L.push(`   - \`${t.sel}\`${t.text ? ` "${t.text}"` : ''} @ ${t.rect.x},${t.rect.y} ${t.rect.w}×${t.rect.h}`);
      if (f.hint) L.push(`   - 고치는 법: ${f.hint}`);
    }
    L.push('');
  }
  const file = path.join(cfg.dir, `${cfg.slug}-report.md`);
  fs.writeFileSync(file, L.join('\n'));
  fs.writeFileSync(path.join(cfg.dir, `${cfg.slug}-report.json`), JSON.stringify({ url, pages: pages.map(({ clean, marked, width, scheme, meta, stats, findings }) => ({ width, scheme, clean, marked, meta, stats, findings })), sheet }, null, 1));
  return { file, errs, warns };
}

// ---------------- main ----------------
export async function run(args, opts = {}) {
  const cfg = { widths: [375, 768, 1440], out: null, scheme: 'light', maxHeight: 8000, timeout: 45000, wait: 0, ignore: [], disable: [], failOn: 'error', baseline: null, updateBaseline: false, sheet: true, quiet: false, ...opts };
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => { const v = args[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--widths') cfg.widths = next().split(',').map((v) => parseInt(v, 10)).filter((v) => v > 0);
    else if (a === '--out') cfg.out = next();
    else if (a === '--scheme') cfg.scheme = next();
    else if (a === '--max-height') cfg.maxHeight = parseInt(next(), 10);
    else if (a === '--timeout') cfg.timeout = parseInt(next(), 10) * 1000;
    else if (a === '--wait') cfg.wait = parseInt(next(), 10);
    else if (a === '--ignore') cfg.ignore.push(...next().split(',').map((v) => v.trim()));
    else if (a === '--disable') cfg.disable.push(...next().split(',').map((v) => v.trim()));
    else if (a === '--fail-on') cfg.failOn = next();
    else if (a === '--baseline') cfg.baseline = next();
    else if (a === '--update-baseline') cfg.updateBaseline = true;
    else if (a === '--no-sheet') cfg.sheet = false;
    else if (a === '--quiet') cfg.quiet = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else targets.push(a);
  }
  if (!targets.length) throw new Error('usage: design-check <url|file.html>... [--widths 375,768,1440] [--out dir] [--baseline file [--update-baseline]] [--fail-on error|warn|none] [--ignore selectors] [--scheme light|dark]');
  const exe = findBrowser();
  if (!exe) { const e = new Error('no Chromium-family browser found. Install Chrome/Edge or set DESIGN_CHECK_BROWSER=<path to chrome>.'); e.code = 'NO_BROWSER'; throw e; }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  const b = new Browser(exe);
  const results = [];
  const toolErrors = [];
  const schemes = String(cfg.scheme).split(',').map((s) => s.trim()).filter(Boolean);
  try {
    for (const t of targets) {
      const url = toUrl(t);
      const slug = slugOf(url);
      const dir = path.resolve(cfg.out || path.join(os.tmpdir(), 'design-check', `${slug}-${stamp}`));
      fs.mkdirSync(dir, { recursive: true });
      const c = { ...cfg, dir, slug };
      const pages = [];
      for (const sch of schemes) for (const w of cfg.widths) {
        try { pages.push(await checkOne(b, url, w, { ...c, scheme: sch })); }
        catch (e) { toolErrors.push({ url, width: w, scheme: sch, error: e.message }); }
      }
      if (!pages.length) { results.push({ url, dir, pages, sheet: null, report: null, errors: 0, warnings: 0, counts: {} }); continue; }
      const sheet = cfg.sheet ? await contactSheet(b, c, pages) : null;
      const rep = writeReport(c, url, pages, sheet);
      results.push({ url, dir, pages, sheet, report: rep.file, errors: rep.errs, warnings: rep.warns, counts: counts(pages) });
    }
  } finally { await b.close(); }

  // baseline (ratchet): fail only when a rule count grows
  let regressions = [];
  if (cfg.baseline) {
    const prev = fs.existsSync(cfg.baseline) ? JSON.parse(fs.readFileSync(cfg.baseline, 'utf8')) : {};
    for (const r of results) for (const [w, rules] of Object.entries(r.counts)) for (const [rule, n] of Object.entries(rules)) {
      const before = (((prev[r.url] || {})[w]) || {})[rule] || 0;
      if (n > before) regressions.push(`${r.url} ${w}px ${rule}: ${before} → ${n}`);
    }
    if (cfg.updateBaseline) { const next = { ...prev }; for (const r of results) next[r.url] = r.counts; fs.writeFileSync(cfg.baseline, JSON.stringify(next, null, 1)); regressions = []; }
  }
  const failing = cfg.baseline ? regressions.length > 0
    : results.some((r) => r.pages.some((p) => p.findings.some((f) => cfg.failOn === 'none' ? false : f.level === 'error' || (cfg.failOn === 'warn' && f.level === 'warn'))));
  return { results, regressions, failing, browser: exe, toolErrors };
}

function printSummary(out) {
  for (const r of out.results) {
    console.log(`\n${r.url}`);
    for (const p of r.pages) {
      const e = p.findings.filter((f) => f.level === 'error'), w = p.findings.filter((f) => f.level === 'warn');
      const ai = new Set(p.findings.filter((f) => f.rule.startsWith('ai-')).map((f) => f.rule)).size;
      console.log(`  ${String(p.width).padStart(4)}px${p.scheme && p.scheme !== 'light' ? ' ' + p.scheme : ''}  오류 ${e.length}  경고 ${w.length}  AI 티 ${ai}종${e.length ? '  ← ' + [...new Set(e.map((f) => f.rule))].join(', ') : ''}`);
    }
    if (r.report) console.log(`  보고서: ${r.report}`);
    if (r.sheet) console.log(`  한눈에: ${r.sheet}`);
  }
  if (out.regressions.length) { console.log('\n기준보다 늘어난 것:'); for (const x of out.regressions) console.log('  ' + x); }
  if (out.toolErrors.length) { console.log('\n검사가 돌지 않은 쪽:'); for (const t of out.toolErrors) console.log(`  ${t.url} ${t.width}px${t.scheme !== 'light' ? ' ' + t.scheme : ''}: ${t.error}`); }
  console.log(out.toolErrors.length ? '\n결과: 일부 쪽은 검사하지 못했다 (exit 2)' : out.failing ? '\n결과: 고칠 것이 남았다 (exit 1)' : '\n결과: 통과 (exit 0)');
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--selftest') {
    const r = spawnSync(process.execPath, [path.join(HERE, 'design-check.test.mjs')], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
  run(args).then((out) => { printSummary(out); process.exit(out.toolErrors.length ? 2 : out.failing ? 1 : 0); })
    .catch((e) => { console.error('design-check: ' + e.message); process.exit(2); });
}
