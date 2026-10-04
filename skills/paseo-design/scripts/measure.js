// In-page measurement for design-check. Evaluated as `(source)(opts)` inside the
// rendered page; returns { meta, stats, findings }. No dependencies, no network.
// Rects are document coordinates (scroll offset added). Levels: "error" must be
// fixed before UI work is called done; "warn" needs a fix or a stated reason.
(opts) => {
  opts = opts || {};
  const W = document.documentElement.clientWidth || window.innerWidth; // layout viewport; innerWidth grows when mobile Chrome zooms out over wide content
  const DEVICE = opts.deviceWidth || W; // real device width; W is the layout viewport
  const MOBILE = DEVICE <= 480;
  const DESKTOP = W >= 1024;
  const VSCALE = W > DEVICE + 1 ? DEVICE / W : 1; // <1 when a phone page has no viewport meta (laid out ~980px, shown shrunk)
  const IGNORE = (opts.ignore || []).filter(Boolean);
  const OFF = new Set(opts.disable || []);
  const findings = [];

  // ---------- helpers ----------
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'BR', 'WBR',
    'SOURCE', 'TRACK', 'PARAM', 'OPTION', 'OPTGROUP', 'DATALIST', 'AREA', 'MAP']);
  const styles = new Map();
  const S = (el) => { let s = styles.get(el); if (!s) { s = getComputedStyle(el); styles.set(el, s); } return s; };
  const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, r: r.right + scrollX, b: r.bottom + scrollY }; };
  const rr = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
  const ignored = (el) => IGNORE.length > 0 && IGNORE.some((s) => { try { return el.closest(s); } catch (e) { return false; } });

  const visCache = new Map();
  function visible(el) {
    if (visCache.has(el)) return visCache.get(el);
    let v = true;
    if (el.checkVisibility) v = el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
    if (v) { const r = el.getBoundingClientRect(); v = r.width > 0.5 && r.height > 0.5; }
    if (v) {
      const s = S(el);
      if (s.clip && /rect\(0(px)?,?\s*0(px)?/.test(s.clip)) v = false;
      if (s.clipPath && /inset\(\s*50%/.test(s.clipPath)) v = false;
    }
    if (v && ignored(el)) v = false;
    visCache.set(el, v);
    return v;
  }
  const opCache = new Map();
  function opacity(el) {
    if (!el || el.nodeType !== 1) return 1;
    if (opCache.has(el)) return opCache.get(el);
    const v = num(S(el).opacity, 1) * opacity(el.parentElement);
    opCache.set(el, v);
    return v;
  }
  function pinned(el) { // fixed or sticky self/ancestor
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const p = S(e).position; if (p === 'fixed' || p === 'sticky') return true; }
    return false;
  }
  function absolute(el) { const p = S(el).position; return p === 'absolute' || p === 'fixed'; }
  function cssPath(el) {
    const parts = [];
    let e = el;
    for (let i = 0; e && e.nodeType === 1 && e !== document.body && e !== document.documentElement && i < 4; i++) {
      let p = e.tagName.toLowerCase();
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) { parts.unshift(p + '#' + e.id); break; }
      const cls = [...e.classList].filter((c) => /^[A-Za-z_][\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) p += '.' + cls.join('.');
      const par = e.parentElement;
      if (par) { const same = [...par.children].filter((c) => c.tagName === e.tagName); if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(e) + 1) + ')'; }
      parts.unshift(p);
      e = e.parentElement;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }
  const clip = (t, n = 36) => { t = (t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
  const textOf = (el) => clip(el.innerText || el.textContent || '');
  const target = (el, rect) => ({ sel: cssPath(el), text: textOf(el), rect: rr(rect || R(el)) });
  function add(level, rule, msg, targets, data) {
    if (OFF.has(rule)) return;
    findings.push({ level, rule, msg, targets: (targets || []).slice(0, 6), data: data || {} });
  }

  // colors via canvas (handles rgb, oklch, lab, color(), named)
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  function color(str) {
    if (!str || str === 'transparent' || str === 'none') return { r: 0, g: 0, b: 0, a: 0 };
    if (colorCache.has(str)) return colorCache.get(str);
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = str; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const c = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    colorCache.set(str, c);
    return c;
  }
  const over = (top, base) => { const a = top.a + base.a * (1 - top.a); if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 }; const m = (k) => (top[k] * top.a + base[k] * base.a * (1 - top.a)) / a; return { r: m('r'), g: m('g'), b: m('b'), a }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const sat = (c) => { const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); return mx === 0 ? 0 : (mx - mn) / mx; };
  function background(el) { // composite solid background behind el; {unknown:true} over images/gradients
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = S(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return { unknown: true };
      const c = color(s.backgroundColor);
      if (c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { color: base };
  }
  const solidBg = (el) => { const b = background(el); return b.unknown ? null : b.color; };
  function cardLike(el) {
    if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 48 || r.height < 32) return false;
    const s = S(el);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((k) => num(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none' && color(s['border' + k + 'Color']).a > 0.08).length;
    const shadow = s.boxShadow && s.boxShadow !== 'none';
    const own = color(s.backgroundColor);
    let tinted = false;
    if (own.a > 0.08) { const behind = el.parentElement ? solidBg(el.parentElement) : null; tinted = !behind || Math.abs(lum(own) - lum(behind)) > 0.012 || Math.abs(own.r - behind.r) + Math.abs(own.g - behind.g) + Math.abs(own.b - behind.b) > 12; }
    return sides >= 3 || shadow || tinted || (s.backgroundImage !== 'none' && num(s.borderTopLeftRadius) > 0);
  }
  const SECTION = 'section,header,footer,nav,aside,article,main,dialog,[role=dialog],[role=region]';
  const groupCache = new Map();
  function groupOf(el) { // nearest visual box or section ancestor (not el itself)
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      if (groupCache.has(e)) { if (groupCache.get(e)) return e; continue; }
      const g = cardLike(e) || e.matches(SECTION);
      groupCache.set(e, g);
      if (g) return e;
    }
    return document.body;
  }
  const HANGUL = /[가-힣]/;
  const HANGUL_G = /[가-힣]/g;
  const WORD = /[\p{L}\p{N}]/u;
  const EMOJI = /\p{Extended_Pictographic}/u;
  const range = document.createRange();
  function lineHeightPx(s) { const lh = s.lineHeight; return lh === 'normal' ? num(s.fontSize) * 1.2 : num(lh, num(s.fontSize) * 1.2); }
  const isHeading = (el, s) => /^H[1-6]$/.test(el.tagName) || el.getAttribute('role') === 'heading' || (num(s.fontSize) >= 20 && num(s.fontWeight) >= 600);
  const leftish = (a) => ['start', 'left', 'justify', '-webkit-left', 'match-parent'].includes(a);
  const centerish = (a) => a === 'center' || a === '-webkit-center';

  // ---------- collect ----------
  const all = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (SKIP.has(el.tagName) || el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (el.id === '__dc_overlay' || el.closest('#__dc_overlay')) continue;
    if (visible(el)) all.push(el);
  }
  const INLINE = new Set(['inline', 'contents']);
  const blockOf = (node) => { let e = node.nodeType === 1 ? node : node.parentElement; while (e && e !== document.body && INLINE.has(S(e).display)) e = e.parentElement; return e; };
  const blockMap = new Map();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  while (tw.nextNode()) {
    const n = tw.currentNode;
    const p = n.parentElement;
    if (!p || SKIP.has(p.tagName) || p.closest('svg,canvas,noscript,template,textarea,select,[aria-hidden="true"],#__dc_overlay')) continue;
    if (!visible(p)) continue;
    const b = blockOf(n);
    if (!b || !visible(b)) continue;
    if (!blockMap.has(b)) blockMap.set(b, []);
    blockMap.get(b).push(n);
  }
  const blocks = [];
  for (const [el, nodes] of blockMap) {
    const s = S(el);
    const rects = [];
    for (const n of nodes) {
      // text inside an inline chip (<code>, <mark>, a badge) starts, to the eye, at the chip's edge rather than at the glyph
      let chipLeft = null;
      for (let e = n.parentElement; e && e !== el; e = e.parentElement) {
        const es = S(e);
        if (color(es.backgroundColor).a > 0.08 || (num(es.borderLeftWidth) > 0 && es.borderLeftStyle !== 'none')) { const c0 = e.getClientRects()[0]; if (c0) chipLeft = c0.left + scrollX; }
      }
      range.selectNodeContents(n);
      let first = true;
      for (const q of range.getClientRects()) {
        if (!(q.width > 0.5 && q.height > 0.5)) continue;
        const rq = { x: q.left + scrollX, y: q.top + scrollY, w: q.width, h: q.height, r: q.right + scrollX, b: q.bottom + scrollY };
        if (first && chipLeft !== null && chipLeft < rq.x && rq.x - chipLeft <= 16) { rq.x = chipLeft; rq.w = rq.r - rq.x; }
        first = false;
        rects.push(rq);
      }
    }
    for (const m of el.querySelectorAll('img,svg,picture,video,canvas')) {
      if (blockOf(m) !== el || !visible(m)) continue;
      if (!['inline', 'inline-block'].includes(S(m).display)) continue;
      const q = R(m); if (q.w > 0.5 && q.h > 0.5) rects.push(q);
    }
    if (!rects.length) continue;
    const fs = num(s.fontSize);
    rects.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const q of rects) {
      const cy = q.y + q.h / 2;
      const line = lines.find((L) => Math.abs(L.cy - cy) < Math.max(4, fs * 0.55));
      if (line) { line.x = Math.min(line.x, q.x); line.r = Math.max(line.r, q.r); line.y = Math.min(line.y, q.y); line.b = Math.max(line.b, q.b); }
      else lines.push({ cy, x: q.x, r: q.r, y: q.y, b: q.b });
    }
    lines.sort((a, b) => a.y - b.y);
    const text = nodes.map((n) => n.nodeValue).join('').replace(/\s+/g, ' ').trim();
    const hangul = (text.match(HANGUL_G) || []).length;
    const letters = (text.match(/[\p{L}]/gu) || []).length;
    const box = R(el);
    let centeredBox = false;
    const par = el.parentElement;
    if (par && par !== document.body) {
      const ps = S(par); const pr = R(par);
      const cl = pr.x + num(ps.borderLeftWidth) + num(ps.paddingLeft);
      const crr = pr.r - num(ps.borderRightWidth) - num(ps.paddingRight);
      const lg = box.x - cl, rg = crr - box.r;
      if (lg > 0.75 && Math.abs(lg - rg) <= 1.5) centeredBox = true; // symmetric side gaps = centered by construction, whatever text-align says
      if (centerish(ps.textAlign) && /inline/.test(s.display)) centeredBox = true;
      if ((ps.display.includes('flex') && (ps.justifyContent === 'center' || ps.alignItems === 'center' && ps.flexDirection.startsWith('column'))) || (ps.display.includes('grid') && (ps.justifyItems === 'center' || s.justifySelf === 'center'))) {
        if (lg > 0.75 && Math.abs(lg - rg) <= 1.5) centeredBox = true; // symmetric side gaps = centered by construction, whatever text-align says
      }
    }
    const ownBox = color(s.backgroundColor).a > 0.08 || (s.boxShadow && s.boxShadow !== 'none')
      || ['Top', 'Right', 'Bottom', 'Left'].filter((k) => num(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none' && color(s['border' + k + 'Color']).a > 0.08).length >= 3;
    const selfCentered = (s.display.includes('flex') && ((!s.flexDirection.startsWith('column') && s.justifyContent === 'center') || (s.flexDirection.startsWith('column') && s.alignItems === 'center')))
      || (s.display.includes('grid') && (s.justifyItems === 'center' || s.justifyContent === 'center'));
    blocks.push({
      el, s, nodes, rects, lines, text, box, centeredBox, ownBox, selfCentered,
      fs, lh: lineHeightPx(s), weight: num(s.fontWeight, 400),
      align: s.textAlign, heading: isHeading(el, s),
      hangulRatio: letters ? hangul / letters : 0, hangul: hangul > 0,
      ink: { x: lines[0].x, y: lines[0].y, r: Math.max(...lines.map((L) => L.r)), b: lines[lines.length - 1].b },
      faint: opacity(el) < 0.35, pinned: pinned(el), abs: absolute(el),
    });
  }

  const CONTROL_SEL = 'button,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea,[role=button],a[class*=btn],a[class*=button],a[class*=Button],.btn';
  const controls = all.filter((el) => el.matches(CONTROL_SEL) && !el.closest('[aria-hidden="true"]'));
  const INTERACTIVE_SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=menuitem],[onclick],[tabindex]:not([tabindex="-1"])';
  const media = all.filter((el) => el.matches('img,picture,video,canvas,iframe,svg') && !el.closest('button,a') && !absolute(el));
  const cards = all.filter((el) => cardLike(el));

  // ---------- E: overflow / cut off ----------
  const sw = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const clipsX = (e) => { const ox = S(e).overflowX; return ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll'; };
  function insideClipX(el) { for (let e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) if (clipsX(e)) return true; return false; }
  const outside = [];
  for (const el of all) {
    if (S(el).position === 'fixed' || insideClipX(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) {
      const p = el.parentElement; const pr = p ? p.getBoundingClientRect() : null;
      const parentInside = !p || p === document.body || (pr.right <= W + 1 && pr.left >= -1);
      if (parentInside) outside.push(el);
    }
  }
  if (sw > W + 1) {
    add('error', 'overflow-x', `화면이 옆으로 ${Math.round(sw - W)}px 넘친다(가로 스크롤이 생김).`, outside.slice(0, 6).map((e) => target(e)), { scrollWidth: sw, viewport: W });
  } else {
    const cut = outside.filter((e) => { const r = e.getBoundingClientRect(); return r.left < W - 1 && r.right > W + 1 || r.left < -1 && r.right > 1; });
    if (cut.length) add('error', 'cut-off-x', `화면 가장자리에서 잘리는 요소가 ${cut.length}개 있다(가로 넘침을 숨겨서 안 보일 뿐이다).`, cut.slice(0, 6).map((e) => target(e)));
  }
  if (MOBILE) {
    const mv = document.querySelector('meta[name=viewport]');
    if (!mv || !/width\s*=\s*device-width/.test(mv.content || '') || W > DEVICE + 1) add('error', 'viewport-meta', `모바일 화면 폭 설정(<meta name="viewport" content="width=device-width, initial-scale=1">)이 없거나 안 먹는다(기기 ${DEVICE}px인데 ${W}px로 그려진다).`, []);
  }

  // ---------- E: text overlap ----------
  const solid = blocks.filter((b) => !b.faint && !b.pinned);
  const flat = [];
  solid.forEach((b, i) => b.rects.forEach((q) => flat.push({ i, q })));
  flat.sort((a, b) => a.q.y - b.q.y);
  const overlapPairs = new Set();
  for (let a = 0; a < flat.length && overlapPairs.size < 20; a++) {
    const A = flat[a];
    for (let c = a + 1; c < flat.length; c++) {
      const B = flat[c];
      if (B.q.y > A.q.b) break;
      if (A.i === B.i) continue;
      const ow = Math.min(A.q.r, B.q.r) - Math.max(A.q.x, B.q.x);
      const oh = Math.min(A.q.b, B.q.b) - Math.max(A.q.y, B.q.y);
      if (ow > 2 && oh > 3) {
        const ea = solid[A.i].el, eb = solid[B.i].el;
        if (ea.contains(eb) || eb.contains(ea)) continue;
        const key = Math.min(A.i, B.i) + ':' + Math.max(A.i, B.i);
        if (overlapPairs.has(key)) continue;
        overlapPairs.add(key);
        add('error', 'text-overlap', `글자끼리 겹친다: "${clip(solid[A.i].text, 16)}" / "${clip(solid[B.i].text, 16)}".`, [target(ea), target(eb)]);
      }
    }
  }

  // ---------- E: clipped text ----------
  for (const b of blocks) {
    if (b.faint) continue;
    const el = b.el, s = b.s;
    const lineClamp = s.webkitLineClamp && s.webkitLineClamp !== 'none';
    if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis') {
      add('error', 'text-clipped', `글자가 오른쪽에서 잘린다(내용 ${el.scrollWidth}px > 칸 ${el.clientWidth}px).`, [target(el)]); continue;
    }
    if ((s.overflowY === 'hidden' || s.overflowY === 'clip') && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2 && !lineClamp) {
      add('error', 'text-clipped', `글자가 아래에서 잘린다(내용 ${el.scrollHeight}px > 칸 ${el.clientHeight}px).`, [target(el)]); continue;
    }
    const p = el.parentElement;
    if (p && p !== document.body) {
      const ps = S(p); const pr = R(p); const bx = b.ink;
      const clipsH = ps.overflowX === 'hidden' || ps.overflowX === 'clip';
      const clipsV = ps.overflowY === 'hidden' || ps.overflowY === 'clip';
      const plc = ps.webkitLineClamp && ps.webkitLineClamp !== 'none';
      if (clipsH && bx.x < pr.r - 1 && bx.r > pr.r + 1) add('error', 'text-clipped', '글자가 감싼 칸 오른쪽에서 잘린다.', [target(el)]);
      else if (clipsV && !plc && bx.y < pr.b - 1 && bx.b > pr.b + 2) add('error', 'text-clipped', '글자가 감싼 칸 아래에서 잘린다.', [target(el)]);
    }
  }

  // ---------- E: contrast ----------
  const contrastGroups = new Map();
  let unknownBg = 0;
  for (const b of blocks) {
    if (b.faint || b.el.closest('[disabled],[aria-disabled="true"]')) continue;
    const bg = background(b.el);
    if (bg.unknown) { unknownBg++; continue; }
    let fg = color(b.s.color);
    if (fg.a < 1) fg = over(fg, bg.color);
    const op = opacity(b.el);
    if (op < 1) fg = { r: fg.r * op + bg.color.r * (1 - op), g: fg.g * op + bg.color.g * (1 - op), b: fg.b * op + bg.color.b * (1 - op), a: 1 };
    const large = b.fs >= 24 || (b.fs >= 18.66 && b.weight >= 700);
    const need = large ? 3 : 4.5;
    const cr = ratio(fg, bg.color);
    if (cr + 1e-6 < need) {
      const key = hex(fg) + '/' + hex(bg.color) + '/' + need;
      if (!contrastGroups.has(key)) contrastGroups.set(key, { fg: hex(fg), bg: hex(bg.color), cr, need, els: [] });
      contrastGroups.get(key).els.push(b.el);
    }
  }
  for (const g of contrastGroups.values()) add('error', 'contrast', `글자색 ${g.fg} / 배경 ${g.bg} 대비가 ${g.cr.toFixed(2)}:1이라 기준 ${g.need}:1보다 낮다(${g.els.length}곳).`, g.els.slice(0, 4).map((e) => target(e)), { count: g.els.length });

  // ---------- E/W: tap targets, tiny text ----------
  if (MOBILE) {
    const small = [], under44 = [];
    for (const el of all) {
      if (!el.matches(INTERACTIVE_SEL) || S(el).pointerEvents === 'none') continue;
      if (el.tagName === 'A' && S(el).display === 'inline') { const pb = blockOf(el); if (pb && (pb.innerText || '').trim().length > (el.innerText || '').trim().length + 8) continue; }
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const m = Math.min(r.width, r.height) * VSCALE;
      if (m < 24) small.push(el); else if (m < 44) under44.push(el);
    }
    if (small.length) add('error', 'tap-target', `손가락으로 누르기 힘든 24px 미만 버튼·링크가 ${small.length}개 있다.`, small.slice(0, 6).map((e) => target(e)), { count: small.length });
    if (under44.length) add('warn', 'tap-target-44', `폰에서 44px보다 작은 누름 대상이 ${under44.length}개 있다.`, under44.slice(0, 6).map((e) => target(e)), { count: under44.length });
  }
  const tiny = blocks.filter((b) => !b.faint && b.fs * VSCALE < 10);
  if (tiny.length) add('error', 'tiny-text', `10px보다 작은 글자가 ${tiny.length}곳 있다.`, tiny.slice(0, 4).map((b) => target(b.el)), { sizes: [...new Set(tiny.map((b) => b.fs))] });
  const small12 = blocks.filter((b) => !b.faint && b.fs * VSCALE >= 10 && b.fs * VSCALE < 12);
  if (small12.length) add('warn', 'small-text', `12px보다 작은 글자가 ${small12.length}곳 있다.`, small12.slice(0, 4).map((b) => target(b.el)), { sizes: [...new Set(small12.map((b) => b.fs))] });

  // ---------- E: Hangul mid-word breaks, W: orphan heading line ----------
  let breakBudget = 25000, breaksFound = 0;
  const hangulHits = [];
  for (const b of blocks) {
    if (breakBudget <= 0 || breaksFound >= 60) break;
    if (b.faint || b.lines.length < 2 || (!b.hangul && !b.heading)) continue;
    let prev = null, acc = '', lineChars = [0];
    const marks = [];
    outer: for (const n of b.nodes) {
      const t = n.nodeValue;
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (/\s/.test(ch)) { if (prev) prev.space = true; if (!acc.endsWith(' ')) acc += ' '; continue; }
        if (--breakBudget <= 0) break outer;
        range.setStart(n, i); range.setEnd(n, i + 1);
        const q = range.getClientRects()[0];
        if (!q) continue;
        if (prev && q.top > prev.top + b.lh * 0.5) {
          lineChars.push(0);
          if (!prev.space && WORD.test(prev.ch) && WORD.test(ch) && (HANGUL.test(prev.ch) || HANGUL.test(ch))) marks.push(acc.length);
        }
        lineChars[lineChars.length - 1]++;
        acc += ch;
        prev = { ch, top: q.top, space: false };
      }
    }
    if (marks.length && b.hangul) {
      breaksFound++;
      const k = marks[0];
      hangulHits.push({ el: b.el, n: marks.length, sample: `${acc.slice(Math.max(0, k - 6), k)}⏎${acc.slice(k, k + 6)}`, wordBreak: b.s.wordBreak });
    }
    const last = lineChars[lineChars.length - 1];
    if (b.heading && lineChars.length >= 2 && last > 0 && last <= 2) add('warn', 'orphan-line', `제목 마지막 줄에 ${last}글자만 남는다.`, [target(b.el)]);
  }

  if (hangulHits.length) {
    const total = hangulHits.reduce((a, h) => a + h.n, 0);
    const wb = [...new Set(hangulHits.map((h) => h.wordBreak))].join('/');
    add('error', 'hangul-break', `한글 단어가 줄 끝에서 쪼개진다(${hangulHits.length}문단 ${total}곳, word-break: ${wb}). 예: ${hangulHits.slice(0, 3).map((h) => `"${h.sample}"`).join(', ')}.`, hangulHits.slice(0, 6).map((h) => target(h.el)), { paragraphs: hangulHits.length, breaks: total });
  }

  // ---------- E: near-miss alignment (left/right edges), top edges in a row ----------
  const items = [];
  for (const b of blocks) {
    if (b.faint || b.pinned || b.abs || b.centeredBox) continue;
    if (b.s.transform && b.s.transform !== 'none') continue;
    if (b.el.tagName === 'SUMMARY') continue; // its disclosure marker is UA-drawn; the text start is not a design decision
    if (b.ownBox) { // a chip, button or callout aligns by its own edge, not by the glyphs inside
      if (b.box.w > W * 0.96) continue;
      items.push({ el: b.el, g: groupOf(b.el), x: b.box.x, r: b.box.r, y: b.box.y, b: b.box.b, kind: 'box', label: clip(b.text, 18) });
      continue;
    }
    if (b.selfCentered || !leftish(b.align)) continue;
    items.push({ el: b.el, g: groupOf(b.el), x: b.ink.x, r: null, y: b.ink.y, b: b.ink.b, kind: 'text', label: clip(b.text, 18) });
  }
  for (const el of [...media, ...controls, ...cards]) {
    if (absolute(el) || pinned(el)) continue;
    const q = R(el);
    if (q.w < 8 || q.w > W * 0.96) continue;
    items.push({ el, g: groupOf(el), x: q.x, r: q.r, y: q.y, b: q.b, kind: 'box', label: clip(textOf(el), 18) || el.tagName.toLowerCase() });
  }
  const byGroup = new Map();
  for (const it of items) { if (!byGroup.has(it.g)) byGroup.set(it.g, []); byGroup.get(it.g).push(it); }
  const near = (A, B) => A.some((a) => B.some((c) => Math.max(a.y, c.y) - Math.min(a.b, c.b) < 160));
  function edgeMiss(list, key, label) {
    const vals = list.filter((i) => i[key] != null);
    const clusters = [];
    for (const it of vals.sort((a, b) => a[key] - b[key])) {
      const c = clusters.find((k) => Math.abs(k.v - it[key]) <= 0.75);
      if (c) c.items.push(it); else clusters.push({ v: it[key], items: [it] });
    }
    let n = 0;
    for (let i = 0; i < clusters.length && n < 3; i++) for (let j = i + 1; j < clusters.length && n < 3; j++) {
      const d = clusters[j].v - clusters[i].v;
      if (d <= 0.75 || d > 6) continue;
      if (!near(clusters[i].items, clusters[j].items)) continue;
      const [few, many] = clusters[i].items.length <= clusters[j].items.length ? [clusters[i], clusters[j]] : [clusters[j], clusters[i]];
      n++;
      add('error', 'align-' + key, `${label}이 ${d.toFixed(1)}px 어긋난다: "${few.items[0].label}"(${Math.round(few.v)})와 "${many.items[0].label}"(${Math.round(many.v)}).`,
        [...few.items.slice(0, 3), many.items[0]].map((it) => target(it.el)), { dx: +d.toFixed(1) });
    }
  }
  for (const list of byGroup.values()) { if (list.length < 2) continue; edgeMiss(list, 'x', '왼쪽 선'); edgeMiss(list.filter((i) => i.kind === 'box'), 'r', '오른쪽 끝선'); }
  // tops of sibling boxes sitting in one row
  const rowParents = new Map();
  for (const el of [...cards, ...media]) { if (absolute(el) || pinned(el) || !el.parentElement) continue; const p = el.parentElement; if (!rowParents.has(p)) rowParents.set(p, []); rowParents.get(p).push(el); }
  const reportedPairs = new Set();
  const pairKey = (a, b) => { const ia = all.indexOf(a), ib = all.indexOf(b); return Math.min(ia, ib) + ':' + Math.max(ia, ib); };
  let topMiss = 0;
  for (const [p, kids] of rowParents) {
    if (kids.length < 2 || topMiss >= 6) continue;
    const qs = kids.map((k) => ({ k, q: R(k) }));
    for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
      const a = qs[i].q, c = qs[j].q;
      const vov = Math.min(a.b, c.b) - Math.max(a.y, c.y);
      if (vov < Math.min(a.h, c.h) * 0.5) continue;
      if (a.x < c.r && c.x < a.r) continue;
      const d = Math.abs(a.y - c.y);
      if (d > 0.75 && d <= 6 && topMiss < 6) { topMiss++; reportedPairs.add(pairKey(qs[i].k, qs[j].k)); add('error', 'align-top', `한 줄에 놓인 상자의 윗선이 ${d.toFixed(1)}px 어긋난다.`, [target(qs[i].k), target(qs[j].k)], { dy: +d.toFixed(1) }); }
    }
  }

  // ---------- E: controls in one row (height / vertical center) ----------
  const ctl = controls.filter((el) => !absolute(el)).map((el) => {
    const s = S(el);
    const boxed = color(s.backgroundColor).a > 0.08 || ['Top', 'Bottom'].some((k) => num(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none') || el.matches('input,select,textarea');
    return { el, q: R(el), boxed };
  });
  let rowMiss = 0;
  for (let i = 0; i < ctl.length && rowMiss < 8; i++) for (let j = i + 1; j < ctl.length && rowMiss < 8; j++) {
    const A = ctl[i], B = ctl[j];
    if (A.el.contains(B.el) || B.el.contains(A.el) || reportedPairs.has(pairKey(A.el, B.el))) continue;
    const a = A.q, c = B.q;
    const vov = Math.min(a.b, c.b) - Math.max(a.y, c.y);
    if (vov < Math.min(a.h, c.h) * 0.5) continue;
    const gap = Math.max(a.x, c.x) - Math.min(a.r, c.r);
    if (gap < 0 || gap > 48) continue;
    const dh = Math.abs(a.h - c.h);
    const dc = Math.abs((a.y + a.h / 2) - (c.y + c.h / 2));
    if (A.boxed && B.boxed && a.h >= 28 && c.h >= 28 && dh >= 2) { rowMiss++; add('error', 'row-height', `한 줄에 놓인 컨트롤 높이가 다르다(${Math.round(a.h)}px / ${Math.round(c.h)}px).`, [target(A.el), target(B.el)]); }
    else if (dc >= 2) { rowMiss++; add('error', 'row-center', `한 줄에 놓인 컨트롤의 세로 가운데가 ${dc.toFixed(1)}px 어긋난다.`, [target(A.el), target(B.el)]); }
  }

  // ---------- W: icon vs text vertical center ----------
  let iconMiss = 0;
  for (const el of all) {
    if (iconMiss >= 8) break;
    if (!el.matches('svg,img,i,[class*=icon]') || el.closest('svg') !== null && el.tagName.toLowerCase() !== 'svg') continue;
    const q = R(el);
    if (q.w > 32 || q.h > 32 || q.w < 6) continue;
    const p = el.parentElement; if (!p) continue;
    const ps = S(p);
    if (!ps.display.includes('flex') || ps.flexDirection.startsWith('column') || ps.alignItems === 'baseline') continue;
    for (const sib of p.childNodes) {
      if (sib === el) continue;
      let tq = null;
      if (sib.nodeType === 3 && sib.nodeValue.trim()) { range.selectNodeContents(sib); const z = range.getClientRects()[0]; if (z) tq = { y: z.top + scrollY, h: z.height }; }
      else if (sib.nodeType === 1 && visible(sib) && blockMap.has(sib)) { const bb = blocks.find((x) => x.el === sib); if (bb && bb.lines.length === 1) tq = { y: bb.lines[0].y, h: bb.lines[0].b - bb.lines[0].y }; }
      if (!tq) continue;
      const d = Math.abs((q.y + q.h / 2) - (tq.y + tq.h / 2));
      if (d >= 2.5) { iconMiss++; add('warn', 'icon-text-center', `아이콘과 글자의 세로 가운데가 ${d.toFixed(1)}px 어긋난다.`, [target(el), target(p)]); }
      break;
    }
  }

  // ---------- W: off-center content in small round/square chips ----------
  let chipMiss = 0;
  for (const el of all) {
    if (chipMiss >= 8) break;
    const q = el.getBoundingClientRect();
    if (q.width > 72 || q.height > 72 || q.width < 16 || q.height < 16) continue;
    const s = S(el);
    const rad = num(s.borderTopLeftRadius);
    const shaped = rad >= Math.min(q.width, q.height) * 0.4 && (color(s.backgroundColor).a > 0.08 || num(s.borderTopWidth) > 0);
    if (!shaped) continue;
    const kids = [...el.children].filter((k) => visible(k));
    let cq = null;
    if (kids.length === 1 && !el.textContent.trim().replace(kids[0].textContent.trim(), '')) cq = kids[0].getBoundingClientRect();
    else if (!kids.length && el.textContent.trim().length <= 2 && el.textContent.trim()) { range.selectNodeContents(el); cq = range.getBoundingClientRect(); }
    if (!cq || cq.width === 0) continue;
    const dx = Math.abs((cq.left + cq.width / 2) - (q.left + q.width / 2));
    const dy = Math.abs((cq.top + cq.height / 2) - (q.top + q.height / 2));
    if (dx >= 1.5 || dy >= 1.5) { chipMiss++; add('warn', 'chip-center', `작은 동그라미·네모 안의 내용이 가운데가 아니다(가로 ${dx.toFixed(1)}px, 세로 ${dy.toFixed(1)}px).`, [target(el)]); }
  }

  // ---------- W: sibling rhythm, card heights ----------
  const sig = (el) => el.tagName + '.' + [...el.classList].sort().join('.');
  let gapMiss = 0, cardMiss = 0;
  for (const p of new Set(all.map((e) => e.parentElement))) {
    if (!p || gapMiss >= 8) continue;
    const kids = [...p.children].filter((k) => visible(k) && !absolute(k) && !SKIP.has(k.tagName));
    if (kids.length < 3) continue;
    const counts = new Map(); kids.forEach((k) => counts.set(sig(k), (counts.get(sig(k)) || 0) + 1));
    const [topSig, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topN < 3) continue;
    const same = kids.filter((k) => sig(k) === topSig).map((k) => ({ k, q: R(k) }));
    const rows = [];
    for (const it of same) { const row = rows.find((rw) => Math.abs(rw[0].q.y - it.q.y) <= 2); if (row) row.push(it); else rows.push([it]); }
    if (rows.length >= 3 && rows.every((rw) => rw.length === 1)) {
      const col = rows.map((rw) => rw[0]).sort((a, b) => a.q.y - b.q.y);
      const gaps = col.slice(1).map((it, i) => it.q.y - col[i].q.b);
      if (gaps.every((g) => g >= 0) && Math.max(...gaps) - Math.min(...gaps) >= 2) { gapMiss++; add('warn', 'gap-rhythm', `같은 종류 ${col.length}개 사이 세로 간격이 제각각이다(${gaps.map((g) => Math.round(g)).join('/')}px).`, col.slice(0, 3).map((it) => target(it.k))); }
    }
    for (const rw of rows) {
      if (rw.length < 3) continue;
      rw.sort((a, b) => a.q.x - b.q.x);
      const gaps = rw.slice(1).map((it, i) => it.q.x - rw[i].q.r);
      if (gaps.every((g) => g >= 0) && Math.max(...gaps) - Math.min(...gaps) >= 2 && gapMiss < 8) { gapMiss++; add('warn', 'gap-rhythm', `같은 줄 ${rw.length}개 사이 가로 간격이 제각각이다(${gaps.map((g) => Math.round(g)).join('/')}px).`, rw.slice(0, 3).map((it) => target(it.k))); }
      if (cardMiss < 6 && rw.every((it) => cardLike(it.k))) {
        const hs = rw.map((it) => it.q.h);
        if (Math.max(...hs) - Math.min(...hs) > 4) { cardMiss++; add('warn', 'card-height', `같은 줄 카드 높이가 다르다(${hs.map((h) => Math.round(h)).join('/')}px).`, rw.slice(0, 3).map((it) => target(it.k))); }
      }
    }
  }

  // ---------- W: container drift across top-level sections (desktop) ----------
  if (DESKTOP) {
    const main = document.querySelector('main') || document.body;
    const secs = [...main.children].filter((e) => visible(e) && !absolute(e) && R(e).w >= W * 0.6);
    const lefts = [];
    for (const sec of secs) {
      const xs = items.filter((it) => sec.contains(it.el) && (it.kind === 'text' || R(it.el).w < W * 0.95)).map((it) => it.x);
      if (xs.length >= 2) lefts.push({ sec, x: Math.min(...xs) });
    }
    const vals = [...new Set(lefts.map((l) => Math.round(l.x)))].sort((a, b) => a - b);
    for (let i = 1; i < vals.length; i++) {
      const d = vals[i] - vals[i - 1];
      if (d >= 1 && d <= 24) {
        const a = lefts.find((l) => Math.round(l.x) === vals[i - 1]), c = lefts.find((l) => Math.round(l.x) === vals[i]);
        add('warn', 'container-drift', `구역마다 내용 시작선이 다르다(${vals[i - 1]}px / ${vals[i]}px). 같은 컨테이너를 쓰지 않은 것이다.`, [target(a.sec), target(c.sec)]);
        break;
      }
    }
  }

  // ---------- W: cramped heading ----------
  let cramped = 0;
  for (const b of blocks) {
    if (cramped >= 6 || !b.heading || b.faint || b.pinned || b.abs) continue;
    let prev = b.el.previousElementSibling;
    while (prev && (!visible(prev) || absolute(prev))) prev = prev.previousElementSibling;
    if (!prev) continue;
    const pq = R(prev);
    if (num(S(prev).fontSize) < 15 && pq.h < 40) continue;
    const gap = b.ink.y - pq.b;
    if (gap >= 0 && gap < 8) { cramped++; add('warn', 'cramped-heading', `제목 위 여백이 ${Math.round(gap)}px로 앞 내용에 붙어 있다.`, [target(b.el), target(prev)]); }
  }
  const header = all.filter((e) => S(e).position === 'fixed' || S(e).position === 'sticky').map((e) => R(e)).filter((q) => q.y <= 2 && q.w >= W * 0.6 && q.h < 160);
  if (header.length) {
    const hb = Math.max(...header.map((q) => q.b));
    const first = blocks.filter((b) => !b.pinned && !b.faint && b.ink.y >= hb - 4).sort((a, c) => a.ink.y - c.ink.y)[0];
    if (first && first.ink.y - hb < 8 && first.ink.y - hb > -4) add('warn', 'cramped-heading', `고정 머리줄 바로 밑 내용이 ${Math.round(first.ink.y - hb)}px 간격으로 붙어 있다.`, [target(first.el)]);
  }

  // ---------- W: typography for Hangul ----------
  const paras = blocks.filter((b) => !b.faint && b.lines.length >= 2 && b.text.length >= 60 && !b.heading);
  const longKo = [], longEn = [], tightKo = [], tightEn = [];
  for (const b of paras) {
    const perLine = b.text.length / b.lines.length;
    const ko = b.hangulRatio >= 0.5;
    if (ko && perLine > 48) longKo.push(b); else if (!ko && perLine > 90) longEn.push(b);
    const lhr = b.lh / b.fs;
    if (ko && lhr < 1.45) tightKo.push(b); else if (!ko && lhr < 1.35) tightEn.push(b);
  }
  if (longKo.length) add('warn', 'line-length', `한글 문단 한 줄이 48자를 넘는다(${longKo.length}곳). 읽기 편한 폭은 30~45자다.`, longKo.slice(0, 3).map((b) => target(b.el)));
  if (longEn.length) add('warn', 'line-length', `영문 문단 한 줄이 90자를 넘는다(${longEn.length}곳).`, longEn.slice(0, 3).map((b) => target(b.el)));
  if (tightKo.length) add('warn', 'line-height', `한글 문단 줄 간격이 1.45배보다 좁다(${tightKo.length}곳).`, tightKo.slice(0, 3).map((b) => target(b.el)));
  if (tightEn.length) add('warn', 'line-height', `문단 줄 간격이 1.35배보다 좁다(${tightEn.length}곳).`, tightEn.slice(0, 3).map((b) => target(b.el)));
  const tracked = blocks.filter((b) => !b.faint && b.hangulRatio >= 0.5 && b.fs <= 18 && num(b.s.letterSpacing) / b.fs > 0.01);
  if (tracked.length) add('warn', 'hangul-tracking', `한글 본문에 자간을 벌렸다(${tracked.length}곳). 한글은 벌리면 성겨 보인다.`, tracked.slice(0, 3).map((b) => target(b.el)));
  const LATIN_ONLY = /^(inter|geist|geist sans|dm sans|poppins|manrope|space grotesk|plus jakarta sans|outfit|sora|montserrat|roboto|helvetica neue|helvetica|arial|segoe ui|sf pro( text| display)?|system-ui|-apple-system|blinkmacsystemfont|ibm plex sans|open sans|lato|nunito|work sans|figtree|lexend|urbanist|raleway|source sans 3|source sans pro|ui-sans-serif)$/i;
  const koBlocks = blocks.filter((b) => b.hangulRatio >= 0.5 && !b.faint);
  if (koBlocks.length) {
    const firsts = new Map();
    for (const b of koBlocks) { const f = (b.s.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim(); firsts.set(f, (firsts.get(f) || 0) + 1); }
    const bad = [...firsts.entries()].filter(([f]) => LATIN_ONLY.test(f));
    if (bad.length) add('warn', 'hangul-font', `한글 문장인데 첫 글꼴이 ${bad.map(([f]) => f).join(', ')}이라 한글이 기기마다 다른 글꼴로 그려진다. Pretendard·Noto Sans KR 같은 한글 글꼴을 맨 앞에 둔다.`, []);
  }

  // ---------- W: scale discipline (spacing, sizes, radii, shadows) ----------
  const spaces = new Map(), radii = new Map(), shadows = new Map();
  for (const el of all) {
    const s = S(el);
    for (const k of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'rowGap', 'columnGap']) {
      const v = Math.round(num(s[k]) * 100) / 100;
      if (v > 0 && v < 400) spaces.set(v, (spaces.get(v) || 0) + 1);
    }
    const rad = num(s.borderTopLeftRadius);
    if (rad > 0 && rad < 200 && !s.borderTopLeftRadius.includes('%')) {
      const q = el.getBoundingClientRect();
      if (rad < Math.min(q.width, q.height) / 2 - 0.5) radii.set(rad, (radii.get(rad) || 0) + 1);
    }
    if (s.boxShadow && s.boxShadow !== 'none') shadows.set(s.boxShadow, (shadows.get(s.boxShadow) || 0) + 1);
  }
  const offScale = [...spaces.entries()].filter(([v]) => v > 2 && Math.abs(v / 4 - Math.round(v / 4)) > 0.01).sort((a, b) => b[1] - a[1]);
  if (offScale.length >= 3) add('warn', 'spacing-scale', `4px 눈금에서 벗어난 여백 값이 ${offScale.length}종이다: ${offScale.slice(0, 10).map(([v, c]) => v + 'px×' + c).join(', ')}.`, [], { values: offScale.slice(0, 20) });
  const sizes = [...new Set(blocks.filter((b) => !b.faint).map((b) => Math.round(b.fs * 100) / 100))].sort((a, b) => a - b);
  if (sizes.length > 7) add('warn', 'type-scale', `글자 크기가 ${sizes.length}종이다(${sizes.join(', ')}px). 6~7단계로 줄인다.`, [], { sizes });
  const twins = [];
  for (let i = 1; i < sizes.length; i++) if (sizes[i] - sizes[i - 1] < 1.5) twins.push(sizes[i - 1] + '/' + sizes[i]);
  if (twins.length) add('warn', 'type-twins', `눈으로 구분이 안 되는 글자 크기 쌍이 있다(${twins.join(', ')}px). 덧대어 고친 흔적이다.`, [], { twins });
  const radList = [...radii.keys()].sort((a, b) => a - b);
  if (radList.length > 3) add('warn', 'radius-scale', `모서리 둥글기가 ${radList.length}종이다(${radList.join(', ')}px). 2~3종으로 줄인다.`, [], { radii: radList });
  if (shadows.size > 3) add('warn', 'shadow-scale', `그림자가 ${shadows.size}종이다. 2~3단계로 줄인다.`, [], { count: shadows.size });

  // ---------- W: AI tells ----------
  const docArea = Math.max(1, document.documentElement.scrollWidth * document.documentElement.scrollHeight);
  const grads = all.filter((el) => /gradient\(/.test(S(el).backgroundImage) && !el.matches('img,svg'));
  const gradArea = grads.reduce((a, el) => { const q = el.getBoundingClientRect(); return a + q.width * q.height; }, 0);
  if (grads.length >= 3 || gradArea / docArea > 0.08) add('warn', 'ai-gradient', `장식용 그라데이션 배경이 ${grads.length}곳(화면의 ${Math.round(100 * gradArea / docArea)}%)이다.`, grads.slice(0, 3).map((e) => target(e)));
  const glows = all.filter((el) => { const s = S(el); const m = (s.boxShadow || '').match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/); if (m && +m[3] >= 32) { const c = color((s.boxShadow.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}|oklch\([^)]*\)/i) || ['#000'])[0]); if (sat(c) > 0.35 && c.a > 0.15) return true; } return /blur\((\d+)px\)/.test(s.filter) && +s.filter.match(/blur\((\d+)px\)/)[1] >= 20; });
  if (glows.length) add('warn', 'ai-glow', `빛이 번지는 장식(색 그림자·흐림 덩어리)이 ${glows.length}곳이다.`, glows.slice(0, 3).map((e) => target(e)));
  const glass = all.filter((el) => { const f = S(el).backdropFilter; return f && f !== 'none'; });
  if (glass.length >= 2) add('warn', 'ai-glass', `유리 효과(배경 흐림)가 ${glass.length}곳이다.`, glass.slice(0, 3).map((e) => target(e)));
  const eyebrows = blocks.filter((b) => b.fs <= 14 && num(b.s.letterSpacing) / b.fs >= 0.05 && (b.s.textTransform === 'uppercase' || (/[A-Z]{3,}/.test(b.text) && b.text === b.text.toUpperCase())));
  if (eyebrows.length >= 2) add('warn', 'ai-eyebrow', `자간을 벌린 대문자 꼬리표가 ${eyebrows.length}곳이다(예: "${clip(eyebrows[0].text, 24)}").`, eyebrows.slice(0, 3).map((b) => target(b.el)));
  const rails = cards.filter((el) => { const s = S(el); const l = num(s.borderLeftWidth); return l >= 3 && num(s.borderTopWidth) <= 1 && num(s.borderRightWidth) <= 1 && sat(color(s.borderLeftColor)) > 0.3; });
  if (rails.length >= 2) add('warn', 'ai-accent-rail', `왼쪽에 색 막대를 단 상자가 ${rails.length}곳이다.`, rails.slice(0, 3).map((e) => target(e)));
  const nested = cards.filter((el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (cards.includes(e) && (num(S(e).borderTopWidth) > 0 || S(e).boxShadow !== 'none') && (num(S(el).borderTopWidth) > 0 || S(el).boxShadow !== 'none')) return true; return false; });
  if (nested.length >= 2) add('warn', 'ai-nested-cards', `카드 안에 테두리·그림자 카드를 또 넣은 곳이 ${nested.length}곳이다.`, nested.slice(0, 3).map((e) => target(e)));
  const emojiHeads = blocks.filter((b) => (b.heading || b.el.matches('button,a,label,li,dt,th')) && EMOJI.test(b.text.slice(0, 3)));
  if (emojiHeads.length >= 2) add('warn', 'ai-emoji-icons', `이모지를 아이콘처럼 쓴 제목·단추가 ${emojiHeads.length}곳이다.`, emojiHeads.slice(0, 3).map((b) => target(b.el)));
  if (DESKTOP) {
    const longText = blocks.filter((b) => !b.heading && b.lines.length >= 2 && !b.faint);
    const centered = longText.filter((b) => centerish(b.align));
    if (longText.length >= 4 && centered.length / longText.length > 0.5) add('warn', 'ai-center-stack', `여러 줄 문단의 ${Math.round(100 * centered.length / longText.length)}%가 가운데 정렬이다.`, centered.slice(0, 3).map((b) => target(b.el)));
  }
  const stats = blocks.filter((b) => b.fs >= 40 && /^[\d.,\s]+[%+×xKkMm만억천배점개명건년]*\+?$/.test(b.text));
  if (stats.length >= 3) add('warn', 'ai-big-numbers', `큰 숫자를 늘어놓은 띠가 있다(${stats.length}곳).`, stats.slice(0, 3).map((b) => target(b.el)));
  const arrows = blocks.filter((b) => b.el.matches('a,button,a *,button *') && /(→|->|↗)\s*$/.test(b.text));
  if (arrows.length >= 2) add('warn', 'ai-arrow-cta', `단추·링크 글 끝에 화살표를 붙인 곳이 ${arrows.length}곳이다.`, arrows.slice(0, 3).map((b) => target(b.el)));
  const toppers = cards.filter((c) => { const first = [...c.children].find((k) => visible(k)); if (!first || !first.matches('svg,img,span,div,i')) return false; const q = R(first), cq = R(c); if (q.w > 72 || q.h > 72 || q.w < 16) return false; const head = c.querySelector('h1,h2,h3,h4,h5,h6,[role=heading],strong,b'); return head && R(head).y > q.b - 2 && Math.abs((q.x + q.w / 2) - (cq.x + cq.w / 2)) < 3; });
  if (toppers.length >= 3) add('warn', 'ai-icon-topper', `카드마다 제목 위 가운데에 아이콘을 얹었다(${toppers.length}곳).`, toppers.slice(0, 3).map((e) => target(e)));

  const firstFont = (S(document.body).fontFamily.split(',')[0] || '').replace(/["']/g, '').trim();
  return {
    meta: { url: location.href, title: document.title, width: W, height: innerHeight, docHeight: document.documentElement.scrollHeight, scrollWidth: sw },
    stats: {
      textBlocks: blocks.length, fontSizes: sizes, firstFont,
      spacingTop: [...spaces.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
      radii: radList, shadows: shadows.size, unknownBackgrounds: unknownBg,
      containerLefts: DESKTOP ? [...new Set(items.filter((i) => i.kind === 'text').map((i) => Math.round(i.x)))].sort((a, b) => a - b).slice(0, 12) : [],
    },
    findings,
  };
}
