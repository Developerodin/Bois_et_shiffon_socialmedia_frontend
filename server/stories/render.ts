import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { run } from "@/server/reels/join";
import { aiDisclosureLine } from "@/server/reels/plan";
import { aiMarkPng } from "@/server/reels/render";
import { PublishingError } from "@/server/services/publishing";
import { getMediaBytes, mediaExists, mediaKey, putMedia } from "@/server/storage/media";
import { FRAME_MAX_BYTES, type FrameFile, LOGO_MAX_BYTES, MIN_CLIP_SECONDS, STORY_LIMITS, type StoryFrame } from "@/server/stories/body";
import { probeVideo } from "@/server/stories/probe";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
// ponytail: fontconfig reads FONTCONFIG_FILE when Pango first lays out text, so setting it here (before any text
// render in this process) limits fonts to assets/fonts on Linux/Vercel. On Windows the C runtime keeps its own copy of
// the environment from process start, so this is ignored in local dev and fallback glyphs can come from system fonts.
// Each layer also names its font file by script (fontFor), so ordinary text renders the same on every OS.
// Upgrade path if Windows dev must match exactly: set FONTCONFIG_FILE in the environment before node starts.
process.env.FONTCONFIG_FILE = path.join(FONT_DIR, "fonts.conf");

/** Bump when the layout changes: every frame gets a new content key, so old files are never reused for new pixels. */
// 3: clips drop the source's metadata (its title, comment, and any phone location or model tags).
const RENDERER_VERSION = 3;
const W = 1080;
const H = 1920;
const MB = 1024 * 1024;
const PHOTO_MAX_BYTES = 25 * MB;
const VIDEO_MAX_BYTES = 100 * MB;
/** Instagram's story video cap we hold ourselves to. */
/** A rendered clip frame shorter than this is refused (the window starts at or past the clip's end). */
const PIXELS = { limitInputPixels: 40_000_000 } as const;

/**
 * The text layout, shared with the phone (apps/mobile/src/ui/stories/limits.ts copies these numbers and `estimateLines`).
 * Sizes are px on the 1080×1920 frame. `em` is a deliberately generous width per character (as a share of the font
 * size), measured from Inter SemiBold and rounded up, so text the estimate accepts always fits when Pango lays it out.
 */
export const TEXT_BOX = {
  frame: { width: W, height: H },
  safe: { top: 250, bottom: 250 },
  /** The centred text column. */
  width: 900,
  /** Where the text starts (below the brand mark when it's on). */
  textTop: 330,
  label: { size: 32, maxLines: 1, padX: 28, padY: 14 },
  headline: { size: 84, minSize: 64, step: 4, maxLines: 3 },
  body: { size: 40, maxLines: 4 },
  cta: { size: 40, maxLines: 2, padX: 48, padY: 24 },
  /**
   * Blocks are laid out by line boxes, not ink: a block is `lines × size × lineHeight` tall (Inter's own line spacing;
   * Noto scripts use their fonts' taller natural spacing), and the gaps are between those boxes.
   */
  lineHeight: 1.22,
  gaps: { brandMarkToText: 32, labelToHeadline: 28, headlineToBody: 46, textToCta: 32 },
  brandMark: { height: 96, logoWidth: 216, logoHeight: 72 },
  em: { wide: 1.08, upper: 0.8, digit: 0.68, narrow: 0.42, space: 0.3, lower: 0.64, other: 0.75 },
  wideChars: "MWmw@%ЖжШшЩщЮюФф",
  narrowChars: "iljtfrI.,:;'!|()[]{}\"`",
} as const;

export type RenderOpts = {
  scope: { workspaceId: string; brandId: string };
  language: string;
  isLast: boolean;
  cta: string;
  brandMark: boolean;
  logoKey?: string;
  /** Changes whenever the logo's bytes change (a short hash of them), so a replaced logo never reuses old frames. */
  logoTag?: string;
  /** 1-based frame number, for error messages only (not part of the hash). */
  n?: number;
};

type RenderDeps = {
  get: (key: string, maxBytes: number) => Promise<Uint8Array>;
  put: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  exists: (key: string) => Promise<boolean>;
};
const storage: RenderDeps = { get: getMediaBytes, put: putMedia, exists: mediaExists };

// C0 except \n, DEL, C1, bidi controls, line/paragraph separators, lone surrogates.
const UNSAFE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** User text as it will print: unsafe characters stripped, each line trimmed. */
const clean = (s: string) => s.replace(UNSAFE, "").split("\n").map((l) => l.trim()).join("\n");

/** Every user string reaching Pango markup goes through this. */
export const escapeMarkup = (s: string) => clean(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Upper-casing with the brand language's rules; scripts without case (Arabic, Devanagari, Hebrew…) come back unchanged. */
const upper = (s: string, language: string) => {
  try {
    return s.toLocaleUpperCase(language);
  } catch {
    return s.toUpperCase();
  }
};
const isRtl = (language: string) => ["ar", "he", "fa", "ur"].includes(language.toLowerCase().split(/[-_]/)[0]);

function charEm(c: string) {
  const em = TEXT_BOX.em;
  if (c === " ") return em.space;
  if ((TEXT_BOX.wideChars as string).includes(c)) return em.wide;
  if ((TEXT_BOX.narrowChars as string).includes(c)) return em.narrow;
  if (/\d/.test(c)) return em.digit;
  if (c !== c.toLowerCase()) return em.upper;
  if (c !== c.toUpperCase()) return em.lower;
  return em.other;
}

/** Greedy word wrap with the `em` widths; words longer than a line break between characters (as Pango's word-char wrap does). */
export function estimateLines(text: string, size: number, width: number): number {
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

type Field = "label" | "headline" | "body" | "cta";
/** Whether the frame's text fits the layout (labels measured upper-cased). The phone runs the same check while typing. */
export function textFits(frame: Pick<StoryFrame, "label" | "headline" | "body">, isLast: boolean, cta: string): { fits: true } | { fits: false; field: Field } {
  const { label, body, cta: c } = TEXT_BOX;
  const label_ = clean(frame.label).toUpperCase();
  if (label_ && estimateLines(label_, label.size, TEXT_BOX.width - 2 * label.padX) > label.maxLines) return { fits: false, field: "label" };
  if (clean(frame.headline) && headlineSize(frame.headline) === null) return { fits: false, field: "headline" };
  if (clean(frame.body) && estimateLines(clean(frame.body), body.size, TEXT_BOX.width) > body.maxLines) return { fits: false, field: "body" };
  if (isLast && clean(cta) && estimateLines(clean(cta), c.size, TEXT_BOX.width - 2 * c.padX) > c.maxLines) return { fits: false, field: "cta" };
  return { fits: true };
}

/** sha256 of everything that changes the pixels. The CTA only counts on the last frame, so a reorder re-renders. */
export function renderInputsHash(frame: StoryFrame, opts: RenderOpts): string {
  const inputs = [
    RENDERER_VERSION,
    frame.mediaKey ?? "",
    frame.label,
    frame.headline,
    frame.body,
    Object.values(normCrop(frame.crop)),
    frame.clip ? [frame.clip.start, frame.clip.sound] : null,
    opts.isLast ? opts.cta : "",
    !!frame.aiMark,
    opts.brandMark ? [opts.logoKey ?? "", opts.logoTag ?? ""] : "",
    opts.language,
  ];
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
}

/** `<ws>/<brand>/stories/<hash>.jpg|mp4`; mediaKey checks the tenant segments. */
export function renderedKeyFor(scope: RenderOpts["scope"], hash: string, kind: "photo" | "video"): string {
  const file = `${hash}.${kind === "photo" ? "jpg" : "mp4"}`;
  return mediaKey(scope, file).replace(/[^/]+$/, `stories/${file}`);
}

/** A rendered clip's poster: its first picture as a JPEG next to the MP4, for lists that can only show an image. */
export const posterKeyFor = (videoKey: string) => videoKey.replace(/\.mp4$/, ".jpg");

/**
 * Crop, as the phone sends it (and must preview it):
 * - `scale` multiplies the cover fit: 1 = Fill (the frame is covered, the overflow cut), below 1 shows more of the
 *   source with black bars (Fit is min(1080/w, 1920/h) / max(1080/w, 1920/h)). Clamped to 0.1–4.
 * - `x`, `y` (0–1) are the point of the source placed at the frame's centre, clamped so no gap opens on a covered side.
 * - No crop = { x: 0.5, y: 0.5, scale: 1 }.
 * Returns the window to cut from the upright source, in source pixels (left/top/width/height), the size it's scaled to
 * (outWidth × outHeight, even, never more than 1080×1920), and where that sits on the black frame (dx/dy).
 * Cutting first, then scaling, keeps the work bounded by the frame whatever the source's shape or the zoom.
 */
export function cropWindow(srcW: number, srcH: number, crop: StoryFrame["crop"]) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const c = normCrop(crop);
  const s = Math.max(W / srcW, H / srcH) * c.scale;
  const width = clamp(Math.round(Math.min(srcW, W / s)), 1, srcW);
  const height = clamp(Math.round(Math.min(srcH, H / s)), 1, srcH);
  const even = (v: number, max: number) => clamp(2 * Math.round((v * s) / 2), 2, max);
  const outWidth = even(width, W);
  const outHeight = even(height, H);
  return {
    left: Math.floor(clamp(c.x * srcW - width / 2, 0, srcW - width)),
    top: Math.floor(clamp(c.y * srcH - height / 2, 0, srcH - height)),
    width,
    height,
    outWidth,
    outHeight,
    dx: (W - outWidth) / 2,
    dy: (H - outHeight) / 2,
  };
}
const normCrop = (crop: StoryFrame["crop"]) => ({
  x: Math.min(1, Math.max(0, crop?.x ?? 0.5)),
  y: Math.min(1, Math.max(0, crop?.y ?? 0.5)),
  scale: Math.min(4, Math.max(0.1, crop?.scale ?? 1)),
});

/** The bundled font for a text layer, by the script it's written in (deterministic on every OS, see FONTCONFIG_FILE above). */
function fontFor(text: string, bold: boolean): { family: string; file: string } {
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return { family: "Noto Sans Arabic", file: "NotoSansArabic-Regular.ttf" };
  if (/[\u0590-\u05FF\uFB1D-\uFB4F]/.test(text)) return { family: "Noto Sans Hebrew", file: "NotoSansHebrew-Regular.ttf" };
  if (/[\u0900-\u097F\uA8E0-\uA8FF]/.test(text)) return { family: "Noto Sans Devanagari", file: "NotoSansDevanagari-Regular.ttf" };
  return bold ? { family: "Inter SemiBold", file: "Inter-SemiBold.ttf" } : { family: "Inter", file: "Inter-Regular.ttf" };
}

/**
 * sharp crops text images to their ink, so spacing by image height would drift with the letters (a line of "ace" is
 * shorter than "\u00C9g"). Each layer is drawn between two invisible strut lines ("|", alpha \u2248 0, spanning the line box);
 * with the strut's line metrics we know exactly where the text's line boxes start and how tall they are.
 */
const STRUT = `<span alpha="1">|</span>`;
const strutMetrics = new Map<string, Promise<{ bar: number; advance: number }>>();
function strutFor(font: string, fontfile: string) {
  let m = strutMetrics.get(font);
  if (!m) {
    const height = async (t: string) => (await sharp({ text: { text: t, font, fontfile, dpi: 72, rgba: true } }).metadata()).height;
    m = Promise.all([height(STRUT), height(`${STRUT}\n${STRUT}`)]).then(([bar, two]) => ({ bar, advance: two - bar }));
    strutMetrics.set(font, m);
  }
  return m;
}

/** A text image plus its line box: the box starts `boxTop` px below the image top and is `boxHeight` tall. */
type Layer = { input: Buffer; width: number; height: number; boxTop: number; boxHeight: number };
async function textLayer(text: string, o: { size: number; bold: boolean; width: number; color: string; rtl: boolean }): Promise<Layer> {
  const font = fontFor(text, o.bold);
  const desc = `${font.family} ${o.size}`;
  const fontfile = path.join(FONT_DIR, font.file);
  // Our own RLM (user bidi controls are stripped) sets each line's base direction for right-to-left languages.
  const lines = escapeMarkup(text).split("\n").map((l) => (o.rtl ? `\u200F${l}` : l)).join("\n");
  const [{ data, info }, strut] = await Promise.all([
    sharp({
      text: { text: `${STRUT}\n<span foreground="${o.color}">${lines}</span>\n${STRUT}`, font: desc, fontfile, width: o.width, align: "centre", dpi: 72, rgba: true, wrap: "word-char" },
    }).png().toBuffer({ resolveWithObject: true }),
    strutFor(desc, fontfile),
  ]);
  // The ink runs from the top strut's bar to the bottom strut's bar; the bar sits (advance \u2212 bar) / 2 inside its line.
  return { input: data, width: info.width, height: info.height, boxTop: Math.round((strut.advance + strut.bar) / 2), boxHeight: info.height - strut.bar - strut.advance };
}

const svg = (body: string, w: number, h: number) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
/** Fixed, whatever the text: dark at the top through the text (~40% down), clear lower in the middle, dark again behind the CTA. */
const GRADIENT = svg(
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.66"/><stop offset="0.4" stop-color="#000" stop-opacity="0.5"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="0.72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`,
  W,
  H,
);

const frameLabel = (opts: RenderOpts) => `Frame ${opts.n ?? "?"}`;
/** The frame number as refusal data, so the app can word a frame refusal itself. */
const frameData = (opts: RenderOpts) => (opts.n ? { n: opts.n } : undefined);

/** Gradient, brand mark, text and CTA (and the AI mark when asked), positioned on a 1080×1920 frame. */
async function overlayLayers(frame: StoryFrame, opts: RenderOpts, deps: RenderDeps, withAiMark: boolean): Promise<OverlayOptions[]> {
  const layers: OverlayOptions[] = [{ input: GRADIENT, left: 0, top: 0 }];
  const rtl = isRtl(opts.language);
  const t = TEXT_BOX;
  let y: number = t.textTop;

  if (opts.brandMark && opts.logoKey) {
    const bm = t.brandMark;
    const logo = await sharp(await deps.get(opts.logoKey, LOGO_MAX_BYTES), PIXELS)
      .resize({ width: bm.logoWidth, height: bm.logoHeight, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    const tileW = logo.info.width + 48;
    const left = Math.round((W - tileW) / 2);
    layers.push({ input: svg(`<rect width="${tileW}" height="${bm.height}" rx="22" fill="#fff"/>`, tileW, bm.height), left, top: t.safe.top });
    layers.push({ input: logo.data, left: left + 24, top: t.safe.top + Math.round((bm.height - logo.info.height) / 2) });
    y = Math.max(y, t.safe.top + bm.height + t.gaps.brandMarkToText);
  }
  if (withAiMark && frame.aiMark) {
    layers.push({ input: await aiMarkPng(aiDisclosureLine(opts.language)), left: W - 48 - 300, top: t.safe.top });
  }

  // Places a layer so its line box starts at `boxTop`.
  const centred = (l: Layer, boxTop: number): OverlayOptions => ({ input: l.input, left: Math.round((W - l.width) / 2), top: boxTop - l.boxTop });
  let gapBefore = 0;
  if (clean(frame.label)) {
    const l = await textLayer(upper(frame.label, opts.language), { size: t.label.size, bold: true, width: t.width - 2 * t.label.padX, color: "#FFFFFF", rtl });
    const pw = l.width + 2 * t.label.padX;
    const ph = l.boxHeight + 2 * t.label.padY;
    layers.push({ input: svg(`<rect width="${pw}" height="${ph}" rx="14" fill="#fff" fill-opacity="0.24"/>`, pw, ph), left: Math.round((W - pw) / 2), top: y });
    layers.push(centred(l, y + t.label.padY));
    y += ph;
    gapBefore = t.gaps.labelToHeadline;
  }
  if (clean(frame.headline)) {
    const size = headlineSize(frame.headline);
    if (size === null) throw new PublishingError(`${frameLabel(opts)}: the headline doesn't fit.`, 400, "story.textFit", frameData(opts));
    const l = await textLayer(frame.headline, { size, bold: true, width: t.width, color: "#FFFFFF", rtl });
    y += gapBefore;
    layers.push(centred(l, y));
    y += l.boxHeight;
    gapBefore = t.gaps.headlineToBody;
  }
  if (clean(frame.body)) {
    const l = await textLayer(frame.body, { size: t.body.size, bold: false, width: t.width, color: "#FFFFFF", rtl });
    y += gapBefore;
    layers.push(centred(l, y));
    y += l.boxHeight;
  }

  let bottom = H - t.safe.bottom;
  if (opts.isLast && clean(opts.cta)) {
    const l = await textLayer(opts.cta, { size: t.cta.size, bold: true, width: t.width - 2 * t.cta.padX, color: "#111111", rtl });
    const pw = l.width + 2 * t.cta.padX;
    const ph = l.boxHeight + 2 * t.cta.padY;
    const top = bottom - ph;
    layers.push({ input: svg(`<rect width="${pw}" height="${ph}" rx="${Math.min(ph / 2, 48)}" fill="#fff"/>`, pw, ph), left: Math.round((W - pw) / 2), top });
    layers.push(centred(l, top + t.cta.padY));
    bottom = top - t.gaps.textToCta;
  }
  // The estimate is generous, so this only trips if a font measures wider than TEXT_BOX.em allows.
  if (y > bottom) throw new PublishingError(`${frameLabel(opts)}: the text doesn't fit.`, 400, "story.textFit", frameData(opts));
  return layers;
}

function sourceKey(frame: StoryFrame, opts: RenderOpts): string {
  if (!frame.mediaKey) throw new PublishingError(`${frameLabel(opts)} has no photo or clip.`, 400, "story.source", frameData(opts));
  return frame.mediaKey;
}

/** A photo frame: the source fitted to 1080×1920 with its crop, the gradient and text burned in, as JPEG. */
export async function renderPhotoFrame(frame: StoryFrame, opts: RenderOpts, deps: RenderDeps = storage): Promise<{ key: string; file: FrameFile }> {
  const key = renderedKeyFor(opts.scope, renderInputsHash(frame, opts), "photo");
  if (frame.renderedKey === key && frame.file) return { key, file: frame.file };
  // Content-addressed: same key = same pixels, so an existing file is reused. Two renders racing on one key both write
  // identical bytes (accepted; storage has no create-only put here).
  if (await deps.exists(key)) return { key, file: { width: W, height: H, bytes: (await deps.get(key, PHOTO_MAX_BYTES)).length } };

  const src = await deps.get(sourceKey(frame, opts), PHOTO_MAX_BYTES);
  const meta = await sharp(src, PIXELS).metadata();
  const box = cropWindow(meta.autoOrient.width, meta.autoOrient.height, frame.crop);
  // Cut the window in (upright) source pixels first, then scale it: never more than 1080×1920 is produced.
  const piece = await sharp(src, { ...PIXELS, autoOrient: true })
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(box.outWidth, box.outHeight, { fit: "fill" })
    .toBuffer();
  const out = await sharp({ create: { width: W, height: H, channels: 3, background: "#000" } })
    .composite([{ input: piece, left: box.dx, top: box.dy }, ...(await overlayLayers(frame, opts, deps, true))])
    .jpeg({ quality: 88 })
    .toBuffer();
  const bytes = new Uint8Array(out);
  await deps.put(key, bytes, "image/jpeg");
  return { key, file: { width: W, height: H, bytes: bytes.length } };
}

/**
 * ffmpeg arguments for a clip frame (pure). Input locked to the file protocol and the mov/mp4 demuxer, the 15 s window
 * read from `start`, the crop window cut in source pixels and only then scaled (bounded by 1080×1920 whatever the
 * source's shape), the overlay PNG on top, then the AI mark at the top right. `source` is the clip's upright size
 * (ffprobe, rotation applied, matching ffmpeg's auto-rotate); without it the clip is fitted whole. "small" is the one
 * lower-bitrate retry when the first output is over the size cap.
 */
export function clipArgs(input: string, overlayPng: string, out: string, clip: { start: number; sound: boolean }, mark?: string, quality: "normal" | "small" = "normal", source?: { width: number; height: number; crop?: StoryFrame["crop"] }): string[] {
  const fitted = source
    ? (() => {
        const b = cropWindow(source.width, source.height, source.crop);
        return `crop=${b.width}:${b.height}:${b.left}:${b.top},scale=${b.outWidth}:${b.outHeight},pad=${W}:${H}:${b.dx}:${b.dy}:color=black`;
      })()
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const graph = `[0:v]${fitted},setsar=1[b];[b][1:v]overlay=0:0`
    + (mark ? `[o];[o][2:v]overlay=${W - 48 - 300}:${TEXT_BOX.safe.top}` : "") + ",format=yuv420p[v]";
  const still = (file: string) => ["-protocol_whitelist", "file", "-f", "png_pipe", "-i", file];
  const video = quality === "normal" ? ["-crf", "21", "-maxrate", "3500k", "-bufsize", "7000k"] : ["-b:v", "2000k", "-maxrate", "2000k", "-bufsize", "4000k"];
  return [
    "-hide_banner", "-y",
    "-protocol_whitelist", "file", "-f", "mov", "-ss", String(clip.start), "-t", String(STORY_LIMITS.clipSeconds), "-i", input,
    ...still(overlayPng),
    ...(mark ? still(mark) : []),
    "-filter_complex", graph, "-map", "[v]",
    // No metadata or chapters from the source: a phone clip's title, comment, location or model must not go out.
    "-map_metadata", "-1", "-map_chapters", "-1",
    ...(clip.sound ? ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-c:v", "libx264", "-preset", "veryfast", ...video, "-threads", "2",
    "-movflags", "+faststart", out,
  ];
}

/** A clip frame: the chosen 15 s of a phone clip or reel with the same overlay, as MP4 H.264/AAC 1080×1920. */
export async function renderClipFrame(frame: StoryFrame, opts: RenderOpts, deps: RenderDeps = storage): Promise<{ key: string; file: FrameFile }> {
  const key = renderedKeyFor(opts.scope, renderInputsHash(frame, opts), "video");
  if (frame.renderedKey === key && frame.file) return { key, file: frame.file };
  const dir = await mkdtemp(path.join(tmpdir(), "story-frame-"));
  try {
    const out = path.join(dir, "out.mp4");
    const measure = async (bytes: Uint8Array): Promise<FrameFile> => {
      await writeFile(out, bytes);
      return { width: W, height: H, bytes: bytes.length, durationSec: (await probeVideo(out)).durationSec };
    };
    // The poster is taken from the finished MP4 at `out`, so it shows the overlay; a clip rendered before posters
    // existed gets one here the next time it is reused.
    const poster = async () => {
      const jpg = path.join(dir, "poster.jpg");
      await run(["-hide_banner", "-y", "-protocol_whitelist", "file", "-f", "mov", "-i", out, "-frames:v", "1", "-q:v", "3", jpg], 30_000);
      await deps.put(posterKeyFor(key), new Uint8Array(await readFile(jpg)), "image/jpeg");
    };
    if (await deps.exists(key)) {
      const file = await measure(await deps.get(key, VIDEO_MAX_BYTES));
      if (!(await deps.exists(posterKeyFor(key)))) await poster();
      return { key, file };
    }

    const input = path.join(dir, "source");
    await writeFile(input, await deps.get(sourceKey(frame, opts), VIDEO_MAX_BYTES));
    const overlay = path.join(dir, "overlay.png");
    await writeFile(overlay, await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(await overlayLayers(frame, opts, deps, false)).png().toBuffer());
    const mark = frame.aiMark ? path.join(dir, "ai-mark.png") : undefined;
    if (mark) await writeFile(mark, await aiMarkPng(aiDisclosureLine(opts.language)));
    const clip = frame.clip ?? { start: 0, sound: true };
    const src = await probeVideo(input);
    const windowRefused = () => new PublishingError(`${frameLabel(opts)}: the chosen part starts after the clip ends.`, 400, "story.clipWindow", frameData(opts));
    if (clip.start + MIN_CLIP_SECONDS > src.durationSec) throw windowRefused();
    const source = { width: src.width, height: src.height, crop: frame.crop };

    await run(clipArgs(input, overlay, out, clip, mark, "normal", source), 110_000);
    let bytes = new Uint8Array(await readFile(out));
    if (bytes.length > FRAME_MAX_BYTES) {
      await run(clipArgs(input, overlay, out, clip, mark, "small", source), 110_000);
      bytes = new Uint8Array(await readFile(out));
      if (bytes.length > FRAME_MAX_BYTES) throw new PublishingError(`${frameLabel(opts)} is too large after compression.`, 422, "story.frameTooLarge", frameData(opts));
    }
    const file = { width: W, height: H, bytes: bytes.length, durationSec: (await probeVideo(out)).durationSec };
    // The container's duration can disagree with where the frames end; the output itself is the final word.
    if (file.durationSec < MIN_CLIP_SECONDS) throw windowRefused();
    // Poster first: an MP4 in storage always has its poster beside it.
    await poster();
    await deps.put(key, bytes, "video/mp4");
    return { key, file };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
