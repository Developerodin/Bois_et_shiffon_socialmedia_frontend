/**
 * Copies of the server's story limits and text layout, for the editor's caps and live fit warning:
 * `STORY_LIMITS` from apps/web/server/stories/body.ts, `TEXT_BOX`, `estimateLines`, `headlineSize` and `textFits` from
 * apps/web/server/stories/render.ts. Change them there first, then here.
 *
 * ponytail: the fit check is the server's character-width heuristic (TEXT_BOX.em), not a real text layout, and it
 * upper-cases labels without the brand language's rules and doesn't strip control characters. It only warns while
 * typing; the server runs the same check on save and its render is the truth (it refuses with story.textFit).
 */
export const STORY_LIMITS = { frames: [3, 5], maxFrames: 5, label: 30, headline: 60, body: 120, cta: 40, composition: 100, clipSeconds: 15, link: 2000 } as const;

export const TEXT_BOX = {
  frame: { width: 1080, height: 1920 },
  safe: { top: 250, bottom: 250 },
  width: 900,
  textTop: 330,
  label: { size: 32, maxLines: 1, padX: 28, padY: 14 },
  headline: { size: 84, minSize: 64, step: 4, maxLines: 3 },
  body: { size: 40, maxLines: 4 },
  cta: { size: 40, maxLines: 2, padX: 48, padY: 24 },
  lineHeight: 1.22,
  gaps: { brandMarkToText: 32, labelToHeadline: 28, headlineToBody: 46, textToCta: 32 },
  brandMark: { height: 96, logoWidth: 216, logoHeight: 72 },
  em: { wide: 1.08, upper: 0.8, digit: 0.68, narrow: 0.42, space: 0.3, lower: 0.64, other: 0.75 },
  wideChars: "MWmw@%ЖжШшЩщЮюФф",
  narrowChars: "iljtfrI.,:;'!|()[]{}\"`",
} as const;

const clean = (s: string) => s.split("\n").map((l) => l.trim()).join("\n");

function charEm(c: string): number {
  const em = TEXT_BOX.em;
  if (c === " ") return em.space;
  if ((TEXT_BOX.wideChars as string).includes(c)) return em.wide;
  if ((TEXT_BOX.narrowChars as string).includes(c)) return em.narrow;
  if (/\d/.test(c)) return em.digit;
  if (c !== c.toLowerCase()) return em.upper;
  if (c !== c.toUpperCase()) return em.lower;
  return em.other;
}

/** Greedy word wrap with the `em` widths; words longer than a line break between characters. */
function estimateLines(text: string, size: number, width: number): number {
  let lines = 0;
  for (const para of text.split("\n")) {
    lines++;
    let x = 0;
    for (const word of para.split(/ +/).filter(Boolean)) {
      const chars = [...word];
      const w = chars.reduce((s, c) => s + charEm(c) * size, 0);
      const space = x > 0 ? TEXT_BOX.em.space * size : 0;
      if (x + space + w <= width) {
        x += space + w;
        continue;
      }
      if (x > 0) {
        lines++;
        x = 0;
      }
      if (w <= width) {
        x = w;
        continue;
      }
      for (const c of chars) {
        const cw = charEm(c) * size;
        if (x + cw > width && x > 0) {
          lines++;
          x = 0;
        }
        x += cw;
      }
    }
  }
  return lines;
}

/** The largest headline size whose text fits its lines, or null when it doesn't fit even at the minimum. */
export function headlineSize(headline: string): number | null {
  const h = TEXT_BOX.headline;
  for (let size: number = h.size; size >= h.minSize; size -= h.step) {
    if (estimateLines(clean(headline), size, TEXT_BOX.width) <= h.maxLines) return size;
  }
  return null;
}

type FitField = "label" | "headline" | "body" | "cta";
/** Whether a frame's text fits the layout (labels measured upper-cased); the CTA only counts on the last frame. */
export function textFits(frame: { label: string; headline: string; body: string }, isLast: boolean, cta: string): { fits: true } | { fits: false; field: FitField } {
  const { label, body, cta: c } = TEXT_BOX;
  const label_ = clean(frame.label).toUpperCase();
  if (label_ && estimateLines(label_, label.size, TEXT_BOX.width - 2 * label.padX) > label.maxLines) return { fits: false, field: "label" };
  if (clean(frame.headline) && headlineSize(frame.headline) === null) return { fits: false, field: "headline" };
  if (clean(frame.body) && estimateLines(clean(frame.body), body.size, TEXT_BOX.width) > body.maxLines) return { fits: false, field: "body" };
  if (isLast && clean(cta) && estimateLines(clean(cta), c.size, TEXT_BOX.width - 2 * c.padX) > c.maxLines) return { fits: false, field: "cta" };
  return { fits: true };
}
