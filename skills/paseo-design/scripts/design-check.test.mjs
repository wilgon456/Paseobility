// Selftest for design-check: renders the fixtures in a real headless browser and
// asserts that planted defects are reported and a clean page stays clean.
// Run: node design-check.mjs --selftest   (or: node design-check.test.mjs)
// Without a Chromium-family browser it prints SKIP and exits 0, unless
// DESIGN_CHECK_REQUIRE_BROWSER=1 (CI) makes that fatal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { run, findBrowser } from './design-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const browser = findBrowser();
if (!browser) {
  const msg = 'design-check selftest: no Chromium-family browser found (Ego Lite, Chrome, Chromium or a Playwright download)';
  if (process.env.DESIGN_CHECK_REQUIRE_BROWSER) { console.error(msg); process.exit(1); }
  console.log('SKIP ' + msg + ' — set DESIGN_CHECK_REQUIRE_BROWSER=1 to make this fatal');
  process.exit(0);
}
console.log('browser: ' + browser);

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'design-check-selftest-'));
const rules = (page, level) => new Set(page.findings.filter((f) => !level || f.level === level).map((f) => f.rule));
let failures = 0;
function check(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

try {
  const bad = await run([path.join(FIX, 'bad.html'), '--out', out, '--widths', '375,1440']);
  const [phone, desktop] = bad.results[0].pages;
  check('bad.html at 375 reports the planted errors', () => {
    const e = rules(phone, 'error');
    for (const r of ['overflow-x', 'hangul-break', 'contrast', 'tap-target', 'tiny-text', 'align-x', 'row-height', 'text-overlap', 'image-distorted']) {
      assert.ok(e.has(r), `missing error ${r}; got: ${[...e].join(', ')}`);
    }
  });
  check('bad.html at 375 reports the planted warnings', () => {
    const w = rules(phone, 'warn');
    for (const r of ['type-twins', 'hangul-tracking', 'hangul-font', 'img-alt', 'control-text-center', 'control-heights', 'icon-size-mix', 'infinite-animation', 'focus-invisible']) {
      assert.ok(w.has(r), `missing warn ${r}; got: ${[...w].join(', ')}`);
    }
  });
  check('bad.html at 375 reports the AI tells as info, never as errors or warnings', () => {
    const i = rules(phone, 'info');
    for (const r of ['ai-eyebrow', 'ai-gradient', 'ai-accent-rail']) assert.ok(i.has(r), `missing info ${r}; got: ${[...i].join(', ')}`);
    assert.ok(![...rules(phone, 'warn'), ...rules(phone, 'error')].some((r) => r.startsWith('ai-')));
  });
  check('text inside an open shadow root is measured', () => {
    const tiny = phone.findings.find((f) => f.rule === 'tiny-text');
    assert.ok(tiny && tiny.data.sizes.includes(8), `tiny-text sizes: ${tiny && JSON.stringify(tiny.data.sizes)}`);
  });
  check('bad.html at 1440 drops the phone-only overflow but keeps alignment and contrast', () => {
    const e = rules(desktop, 'error');
    assert.ok(!e.has('overflow-x'), 'overflow-x must not fire at 1440');
    assert.ok(e.has('align-x') && e.has('contrast'), `got: ${[...e].join(', ')}`);
  });
  check('bad.html produces screenshots, a report and a contact sheet, and fails', () => {
    for (const p of bad.results[0].pages) {
      assert.ok(fs.statSync(p.clean).size > 1000, 'clean screenshot too small');
      assert.ok(fs.statSync(p.marked).size > 1000, 'marked screenshot too small');
    }
    const r = bad.results[0];
    assert.ok(fs.existsSync(r.report) && fs.existsSync(r.sheet));
    assert.ok(fs.readFileSync(r.report, 'utf8').includes('hangul-break'));
    assert.ok(fs.existsSync(r.report.replace(/\.md$/, '.json')));
    assert.equal(bad.failing, true);
  });
  check('every finding carries a usable target rect and a fix hint', () => {
    for (const f of phone.findings) {
      if (f.targets.length) { const r = f.targets[0].rect; assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && r.w >= 0 && r.h >= 0, `bad rect on ${f.rule}`); }
      assert.ok(f.hint, `no hint for ${f.rule}`);
    }
  });

  const good = await run([path.join(FIX, 'good.html'), '--out', out, '--no-sheet']);
  check('good.html is clean at 375, 768 and 1440 (hidden table header, unit chart, right-anchored label, button in a bar)', () => {
    for (const p of good.results[0].pages) {
      assert.deepEqual(p.findings.map((f) => `${p.width}px ${f.level} ${f.rule}: ${f.msg}`), [], 'unexpected findings');
    }
    assert.equal(good.failing, false);
  });

  const clipped = await run([path.join(FIX, 'clipped.html'), '--out', out, '--widths', '375', '--no-sheet']);
  check('line-clamped text and enlarged touch layers are not reported, a real overlap still is', () => {
    const [page] = clipped.results[0].pages;
    const overlaps = page.findings.filter((f) => f.rule === 'text-overlap');
    assert.equal(overlaps.length, 1, `text-overlap: ${overlaps.map((f) => f.msg).join(' | ')}`);
    assert.match(overlaps[0].msg, /진짜로 겹친 글자/);
    assert.ok(!rules(page, 'error').has('tap-target'), 'a 20px button with a 48px touch layer is not a tiny target');
  });

  const wrap = await run([path.join(FIX, 'inline-wrap.html'), '--out', out, '--widths', '375', '--no-sheet']);
  check('a space in its own text node is a legal break, and wrapped inline code is not an edge', () => {
    const e = rules(wrap.results[0].pages[0], 'error');
    assert.ok(!e.has('hangul-break'), 'break at a separate whitespace node reported as a mid-word break');
    assert.ok(!e.has('align-r') && !e.has('align-x'), `wrapped inline boxes reported as misaligned: ${[...e].join(', ')}`);
  });

  const nometa = await run([path.join(FIX, 'nometa.html'), '--out', out, '--widths', '375', '--no-sheet']);
  check('a page without viewport meta is flagged on the phone width', () => {
    assert.ok(rules(nometa.results[0].pages[0], 'error').has('viewport-meta'));
  });

  const dark = await run([path.join(FIX, 'good.html'), '--out', out, '--widths', '375', '--scheme', 'light,dark', '--no-sheet']);
  check('--scheme light,dark renders both schemes and names the dark files', () => {
    const pages = dark.results[0].pages;
    assert.equal(pages.length, 2);
    assert.deepEqual(pages.map((p) => p.scheme), ['light', 'dark']);
    assert.ok(pages[1].clean.endsWith('-375-dark.png') && fs.existsSync(pages[1].clean));
    for (const p of pages) assert.deepEqual(p.findings, [], 'good.html must stay clean in both schemes');
  });

  const dead = await run(['http://127.0.0.1:9/', '--out', out, '--widths', '375', '--no-sheet']);
  check('a page that cannot load is reported as a tool error, not as a pass', () => {
    assert.equal(dead.toolErrors.length, 1);
    assert.equal(dead.results[0].pages.length, 0);
    assert.equal(dead.failing, false);
  });

  const slow = createServer((req, res) => {
    if (req.url === '/pending.png') return; // Intentionally never reaches the load event.
    res.end('<!doctype html><title>Pending load</title><img src="/pending.png">');
  });
  try {
    await new Promise((resolve, reject) => {
      slow.once('error', reject);
      slow.listen(0, '127.0.0.1', resolve);
    });
    const pending = await run([`http://127.0.0.1:${slow.address().port}/`, '--out', out, '--widths', '375', '--timeout', '1', '--no-sheet']);
    check('a page that never finishes loading is a tool error, not a measured pass', () => {
      assert.equal(pending.results[0].pages.length, 0);
      assert.equal(pending.toolErrors.length, 1);
      assert.match(pending.toolErrors[0].error, /timeout/);
    });
  } finally {
    slow.closeAllConnections();
    await new Promise(resolve => slow.close(resolve));
  }

  const disabled = await run([path.join(FIX, 'bad.html'), '--out', out, '--widths', '375', '--no-sheet', '--disable', 'focus-invisible']);
  check('--disable applies to keyboard-focus findings too', () => {
    assert.ok(!rules(disabled.results[0].pages[0]).has('focus-invisible'));
    assert.ok(rules(disabled.results[0].pages[0]).has('contrast'));
  });

  const ignored = await run([path.join(FIX, 'bad.html'), '--out', out, '--widths', '375', '--no-sheet', '--ignore', 'body']);
  check('--ignore excludes keyboard-focus targets inside ignored containers', () => {
    assert.ok(!rules(ignored.results[0].pages[0]).has('focus-invisible'));
  });

  const base = path.join(out, 'baseline.json');
  const r1 = await run([path.join(FIX, 'bad.html'), '--out', out, '--widths', '375', '--no-sheet', '--baseline', base, '--update-baseline']);
  const r2 = await run([path.join(FIX, 'bad.html'), '--out', out, '--widths', '375', '--no-sheet', '--baseline', base]);
  check('baseline ratchet passes while nothing grows', () => {
    assert.equal(r1.failing, false);
    assert.equal(r2.failing, false);
    assert.deepEqual(r2.regressions, []);
  });
  const b = JSON.parse(fs.readFileSync(base, 'utf8'));
  const url = Object.keys(b)[0];
  b[url]['375'].contrast = 0;
  fs.writeFileSync(base, JSON.stringify(b));
  const r3 = await run([path.join(FIX, 'bad.html'), '--out', out, '--widths', '375', '--no-sheet', '--baseline', base]);
  check('baseline ratchet fails when a rule count grows', () => {
    assert.equal(r3.failing, true);
    assert.ok(r3.regressions.some((x) => x.includes('contrast')), r3.regressions.join('; '));
  });
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall design-check selftests passed');
process.exit(failures ? 1 : 0);
