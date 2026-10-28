/** Brand-colour helpers for brand assets: parse CSS colours, drop neutrals, merge near-duplicates. */
export type Rgb = [number, number, number];

export const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** `#abc`, `#aabbcc`, `rgb(1,2,3)` or a bare `1,2,3` triple (Shopify themes store CSS vars that way). */
export function parseColor(raw: string): Rgb | null {
  const s = raw.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
  }
  const triple = /^(?:rgba?\()?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,[^)]*)?\)?$/.exec(s);
  if (triple) {
    const rgb = triple.slice(1, 4).map(Number) as Rgb;
    return rgb.every((v) => v <= 255) ? rgb : null;
  }
  return null;
}

/** White, black, greys and washed-out tints say nothing about a brand. */
export function isNeutral([r, g, b]: Rgb) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return s < 0.15 || l > 0.93 || l < 0.08;
}

const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Keep the first of any colours closer than `minDistance`, up to `max`. Input order = priority. */
export function distinctColors<T extends { rgb: Rgb }>(colors: T[], max: number, minDistance = 40): T[] {
  const kept: T[] = [];
  for (const c of colors) {
    if (kept.length >= max) break;
    if (!kept.some((k) => distance(k.rgb, c.rgb) < minDistance)) kept.push(c);
  }
  return kept;
}

/**
 * Dominant non-neutral colours of an image's raw RGB(A) pixels, most frequent first.
 * ponytail: 4-bit-per-channel buckets on a tiny thumbnail; k-means if palettes look muddy.
 */
export function dominantColors(pixels: Uint8Array, channels: number, max = 3): Rgb[] {
  const buckets = new Map<number, { n: number; sum: Rgb }>();
  for (let i = 0; i + 2 < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] < 128) continue; // transparent logo background
    const rgb: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    if (isNeutral(rgb)) continue;
    const key = ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4);
    const b = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] };
    b.n++;
    b.sum = [b.sum[0] + rgb[0], b.sum[1] + rgb[1], b.sum[2] + rgb[2]];
    buckets.set(key, b);
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((b) => ({ rgb: b.sum.map((v) => v / b.n) as Rgb }));
  return distinctColors(ranked, max).map((c) => c.rgb);
}
