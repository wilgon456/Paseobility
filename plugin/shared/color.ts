/** Mixes a theme color with transparency. Unknown formats return the fallback. */
export function withAlpha(color: string, alpha: number, fallback: string): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (d) => d + d) : hex[1];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
  return fallback;
}

