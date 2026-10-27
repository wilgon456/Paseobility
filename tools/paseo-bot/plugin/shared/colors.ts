// Semantic colors supplement Paseo's surface and status tokens, which do not
// include blue, orange or violet. Text is checked against its actual fill.
type RGB = [number, number, number];
function rgb(color: string): RGB | null {
  const hex = /^#([\da-f]{6})$/i.exec(color);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) as RGB;
  const short = /^#([\da-f]{3})$/i.exec(color);
  if (short) return [...short[1]].map(x => parseInt(x + x, 16)) as RGB;
  const decimal = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
  return decimal ? [Number(decimal[1]), Number(decimal[2]), Number(decimal[3])] : null;
}
function hex(c: RGB) { return '#' + c.map(n => Math.round(n).toString(16).padStart(2, '0')).join(''); }
function luminance(c: RGB) {
  const f = c.map(x => { const n = x / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
  return .2126 * f[0] + .7152 * f[1] + .0722 * f[2];
}
export function contrast(a: string, b: string): number {
  const x = rgb(a), y = rgb(b); if (!x || !y) return 0;
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + .05) / (lo + .05);
}
const tones: Record<string, string> = {
  green: '#15965b', orange: '#dc6a13', purple: '#8854d0', blue: '#3186db',
  yellow: '#d99913', red: '#d8464e', gray: '#7b8791', cyan: '#168d9b', pink: '#d0518b',
};
function hueColor(hue: number): string {
  const c = .68, h = hue / 60, x = c * (1 - Math.abs(h % 2 - 1)), m = .16;
  const rgb = h < 1 ? [c,x,0] : h < 2 ? [x,c,0] : h < 3 ? [0,c,x] : h < 4 ? [0,x,c] : h < 5 ? [x,0,c] : [c,0,x];
  return hex(rgb.map(n => (n + m) * 255) as RGB);
}
export function projectTone(project: string, projects: string[] = [project]): string {
  const ids = [...new Set([...projects, project])].sort();
  const used = new Set<number>(); let chosen = 0;
  for (const id of ids) {
    let hash = 2166136261;
    for (const ch of id) { hash ^= ch.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
    let hue = (hash >>> 0) % 360;
    while (used.has(hue) && used.size < 360) hue = (hue + 137) % 360;
    used.add(hue); if (id === project) chosen = hue;
  }
  return hueColor(chosen);
}
export function modelTone(model: string): string {
  return /claude|opus|fable/i.test(model) ? 'orange' : /opencode|deepseek|flash|^go$/i.test(model) ? 'purple' : /terra|sol|gpt|codex/i.test(model) ? 'green' : 'gray';
}
export function effortTone(effort: string): string {
  return /high|ultra|max/i.test(effort) ? 'red' : /medium/i.test(effort) ? 'yellow' : /low/i.test(effort) ? 'blue' : 'gray';
}
export function statusTone(group: string): string {
  return ({waiting:'gray', running:'blue', attention:'yellow', success:'green', failed:'red'} as Record<string,string>)[group] || 'gray';
}
export function requesterTone(requester: string): string {
  return requester === 'grok' ? 'purple' : requester === 'gui' ? 'blue' : 'gray';
}
export function toneInk(tone: string): string {
  return tones[tone] || (/^(#|rgb)/.test(tone) ? tone : tones.gray);
}
/** Tinted fill/border for a tone over a surface; `mix` is the tone share of the fill. */
export function tagColors(surface: string, foreground: string, tone: string, mix = .16) {
  const base = rgb(surface), ink = rgb(toneInk(tone));
  if (!base || !ink) return { background: surface, foreground, border: surface };
  const background = hex(base.map((n, i) => n * (1 - mix) + ink[i] * mix) as RGB);
  const text = contrast(background, foreground) >= 4.5 ? foreground : contrast(background, '#000000') >= contrast(background, '#ffffff') ? '#000000' : '#ffffff';
  const border = hex(base.map((n, i) => n * .48 + ink[i] * .52) as RGB);
  return { background, foreground: text, border };
}
