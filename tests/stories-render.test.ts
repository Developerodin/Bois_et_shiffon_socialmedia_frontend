import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { StoryFrame } from "@/server/stories/body";
import { clipArgs, cropWindow, escapeMarkup, posterKeyFor, renderClipFrame, renderedKeyFor, renderInputsHash, renderPhotoFrame, type RenderOpts, textFits } from "@/server/stories/render";

const scope = { workspaceId: "ws1", brandId: "b1" };
const opts: RenderOpts = { scope, language: "fr", isLast: true, cta: "Voir la table", brandMark: false };
const frame: StoryFrame = { label: "Collection Bunting", headline: "L'acacia, tout naturellement.", body: "", mediaKey: "ws1/b1/photo.jpg", mediaKind: "photo" };
const fixture = path.join(__dirname, "fixtures", "photo-2000x1500.jpg");

describe("escapeMarkup", () => {
  it("escapes markup and strips control and bidi characters", () => {
    expect(escapeMarkup('<image href="x"/> & \u0007\u202Eabc')).toBe("&lt;image href=&quot;x&quot;/&gt; &amp; abc");
  });
  it("removes line and paragraph separators, lone surrogates, C1 and DEL; keeps newlines; trims each line", () => {
    expect(escapeMarkup("a\u2028b\u2029c\uD800d\u0085\u007Fe")).toBe("abcde");
    expect(escapeMarkup("  one \n two  ")).toBe("one\ntwo");
    expect(escapeMarkup("it's 😀")).toBe("it&apos;s 😀");
  });
});

describe("renderInputsHash", () => {
  const base = renderInputsHash(frame, opts);
  it("is stable for the same inputs", () => expect(renderInputsHash({ ...frame }, { ...opts })).toBe(base));
  it("changes with the headline", () => expect(renderInputsHash({ ...frame, headline: "Autre" }, opts)).not.toBe(base));
  it("changes when the frame stops being the last one (reorder)", () => expect(renderInputsHash(frame, { ...opts, isLast: false })).not.toBe(base));
  it("changes with the AI mark", () => expect(renderInputsHash({ ...frame, aiMark: true }, opts)).not.toBe(base));
  it("ignores the CTA on frames that aren't last", () =>
    expect(renderInputsHash(frame, { ...opts, isLast: false, cta: "A" })).toBe(renderInputsHash(frame, { ...opts, isLast: false, cta: "B" })));
  it("keys the file under the brand's stories folder", () => {
    expect(renderedKeyFor(scope, base, "photo")).toBe(`ws1/b1/stories/${base}.jpg`);
    expect(renderedKeyFor(scope, base, "video")).toBe(`ws1/b1/stories/${base}.mp4`);
    expect(() => renderedKeyFor({ workspaceId: "../x", brandId: "b1" }, base, "photo")).toThrow();
  });
});

describe("clipArgs", () => {
  const args = clipArgs("in.mov", "overlay.png", "out.mp4", { start: 12, sound: false });
  it("locks ffmpeg down for user files", () => {
    expect(args.join(" ")).toContain("-protocol_whitelist file");
    expect(args.indexOf("-f")).toBeLessThan(args.indexOf("-i"));
    expect(args[args.indexOf("-f") + 1]).toBe("mov");
    expect(args.join(" ")).toContain("-threads 2");
    expect(args.join(" ")).not.toMatch(/concat|http/);
  });
  it("drops the source's metadata (a phone clip's GPS location)", () => {
    expect(args.join(" ")).toContain("-map_metadata -1");
    expect(args.indexOf("-map_metadata")).toBeLessThan(args.indexOf("out.mp4"));
  });
  it("takes the 15 s window from the start", () => {
    expect(args[args.indexOf("-ss") + 1]).toBe("12");
    expect(args[args.indexOf("-t") + 1]).toBe("15");
  });
  it("drops audio only when sound is off", () => {
    expect(args).toContain("-an");
    expect(clipArgs("in.mov", "overlay.png", "out.mp4", { start: 0, sound: true })).not.toContain("-an");
  });
  it("adds the mark as a third input", () => {
    const withMark = clipArgs("in.mov", "overlay.png", "out.mp4", { start: 0, sound: true }, "mark.png");
    expect(withMark.filter((a) => a === "-i")).toHaveLength(3);
  });
  it("uses a lower bitrate for the small re-encode", () => {
    const small = clipArgs("in.mov", "overlay.png", "out.mp4", { start: 0, sound: true }, undefined, "small");
    expect(small.join(" ")).toContain("-b:v 2000k");
  });
});

describe("textFits", () => {
  it("refuses a headline of 60 W", () => expect(textFits({ ...frame, headline: "W".repeat(60) }, false, "")).toEqual({ fits: false, field: "headline" }));
  it("accepts the Figma headline", () => expect(textFits(frame, true, "Voir la table")).toEqual({ fits: true }));
  it("names the CTA only on the last frame", () => {
    const cta = "W".repeat(40);
    expect(textFits(frame, true, cta)).toEqual({ fits: false, field: "cta" });
    expect(textFits(frame, false, cta)).toEqual({ fits: true });
  });
});

describe("cropWindow", () => {
  it("fills by default, centred, cutting the window in source pixels", () => {
    expect(cropWindow(2000, 1500, undefined)).toEqual({ left: 578, top: 0, width: 844, height: 1500, outWidth: 1080, outHeight: 1920, dx: 0, dy: 0 });
  });
  it("letterboxes below 1 and clamps the focal point", () => {
    expect(cropWindow(2000, 1500, { x: 0.5, y: 0.5, scale: 0.421875 })).toEqual({ left: 0, top: 0, width: 2000, height: 1500, outWidth: 1080, outHeight: 810, dx: 0, dy: 555 });
    expect(cropWindow(2000, 1500, { x: 5, y: -1, scale: 1 })).toMatchObject({ left: 1156, top: 0 });
  });
  it("never outputs more than the frame, whatever the source shape or zoom", () => {
    for (const [w, h, scale] of [[4096, 64, 1], [64, 4096, 4], [240, 240, 4], [4096, 4096, 0.1]]) {
      const b = cropWindow(w, h, { x: 0.5, y: 0.5, scale });
      expect(b.outWidth).toBeLessThanOrEqual(1080);
      expect(b.outHeight).toBeLessThanOrEqual(1920);
      expect(b.left + b.width).toBeLessThanOrEqual(w);
      expect(b.top + b.height).toBeLessThanOrEqual(h);
    }
  });
});

describe("clipArgs geometry", () => {
  it("crops a 4096×64 source before scaling, and never scales past 1080×1920", () => {
    const graph = (crop?: { x: number; y: number; scale: number }) => {
      const a = clipArgs("in.mov", "overlay.png", "out.mp4", { start: 0, sound: true }, undefined, "normal", { width: 4096, height: 64, crop });
      return a[a.indexOf("-filter_complex") + 1];
    };
    for (const g of [graph(), graph({ x: 0.9, y: 0.5, scale: 4 }), graph({ x: 0.5, y: 0.5, scale: 0.1 })]) {
      expect(g.indexOf("crop=")).toBeGreaterThan(-1);
      expect(g.indexOf("crop=")).toBeLessThan(g.indexOf("scale="));
      const targets = [...g.matchAll(/scale=(\d+):(\d+)/g)];
      expect(targets.length).toBeGreaterThan(0);
      for (const [, w, h] of targets) {
        expect(Number(w)).toBeLessThanOrEqual(1080);
        expect(Number(h)).toBeLessThanOrEqual(1920);
      }
    }
  });
});

describe("renderInputsHash crop", () => {
  it("treats no crop and the default crop as the same pixels", () =>
    expect(renderInputsHash({ ...frame, crop: { x: 0.5, y: 0.5, scale: 1 } }, opts)).toBe(renderInputsHash(frame, opts)));
});

describe("renderPhotoFrame", () => {
  it("renders the 2000×1500 fixture to a 1080×1920 JPEG under its content key", async () => {
    const put = vi.fn(async () => undefined);
    const get = vi.fn(async () => new Uint8Array(await readFile(fixture)));
    const r = await renderPhotoFrame(frame, opts, { get, put, exists: async () => false });
    expect(r.key).toBe(renderedKeyFor(scope, renderInputsHash(frame, opts), "photo"));
    expect(r.file).toMatchObject({ width: 1080, height: 1920 });
    expect(put).toHaveBeenCalledTimes(1);
    const [key, bytes, type] = put.mock.calls[0] as unknown as [string, Uint8Array, string];
    expect(key).toBe(r.key);
    expect(type).toBe("image/jpeg");
    expect(r.file.bytes).toBe(bytes.length);
    const meta = await sharp(bytes).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 1080, height: 1920 });
  });
  it("reuses an existing file without writing it again", async () => {
    const put = vi.fn(async () => undefined);
    const jpg = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#000" } }).jpeg().toBuffer();
    const r = await renderPhotoFrame(frame, opts, { get: async () => new Uint8Array(jpg), put, exists: async () => true });
    expect(put).not.toHaveBeenCalled();
    expect(r.file).toEqual({ width: 1080, height: 1920, bytes: jpg.length });
  });
  it("renders right-to-left and uncased scripts", async () => {
    const put = vi.fn(async () => undefined);
    const get = async () => new Uint8Array(await readFile(fixture));
    const ar = { ...frame, label: "مجموعة", headline: "طاولة من خشب الأكاسيا", body: "שלום" };
    await expect(renderPhotoFrame(ar, { ...opts, language: "ar" }, { get, put, exists: async () => false })).resolves.toMatchObject({ file: { width: 1080 } });
  });
  it("crops a phone photo upright (EXIF orientation applied before the window is cut)", async () => {
    // Stored 400×200 with orientation 6: shown as 200×400.
    const rotated = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#864" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const put = vi.fn(async () => undefined);
    const r = await renderPhotoFrame({ ...frame, crop: { x: 0.5, y: 0.9, scale: 1 } }, opts, { get: async () => new Uint8Array(rotated), put, exists: async () => false });
    expect(r.file).toMatchObject({ width: 1080, height: 1920 });
  });
});

describe("renderClipFrame window", () => {
  it("refuses a window that starts after the clip ends, before storing anything", async () => {
    if (!ffmpegPath) return;
    const dir = await mkdtemp(path.join(tmpdir(), "story-clip-test-"));
    try {
      const src = path.join(dir, "src.mp4");
      await new Promise<void>((res, rej) => execFile(ffmpegPath as string, ["-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", src], (e) => (e ? rej(e) : res())));
      const put = vi.fn(async () => undefined);
      const clip: StoryFrame = { ...frame, mediaKey: "ws1/b1/clip.mp4", mediaKind: "video", clip: { start: 10, sound: true } };
      await expect(renderClipFrame(clip, { ...opts, n: 3 }, { get: async () => new Uint8Array(await readFile(src)), put, exists: async () => false }))
        .rejects.toMatchObject({ status: 400, code: "story.clipWindow" });
      expect(put).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("renderClipFrame", () => {
  it("cuts a phone clip to 1080×1920 H.264 with the overlay", async () => {
    if (!ffmpegPath) return;
    const dir = await mkdtemp(path.join(tmpdir(), "story-clip-test-"));
    try {
      const src = path.join(dir, "src.mp4");
      await new Promise<void>((res, rej) => execFile(ffmpegPath as string, ["-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=3", "-f", "lavfi", "-i", "sine=duration=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-metadata", "location=+48.8566+002.3522/", "-metadata", "comment=from-the-phone", "-movflags", "use_metadata_tags", src], (e) => (e ? rej(e) : res())));
      const put = vi.fn(async () => undefined);
      const clip: StoryFrame = { ...frame, mediaKey: "ws1/b1/clip.mp4", mediaKind: "video", clip: { start: 0, sound: false }, aiMark: true };
      const r = await renderClipFrame(clip, { ...opts, n: 2 }, { get: async () => new Uint8Array(await readFile(src)), put, exists: async () => false });
      expect(r.key).toMatch(/^ws1\/b1\/stories\/[0-9a-f]{64}\.mp4$/);
      expect(r.file).toMatchObject({ width: 1080, height: 1920 });
      expect(r.file.durationSec).toBeGreaterThan(2.5);
      expect(r.file.durationSec).toBeLessThan(3.5);
      expect(put.mock.calls[0]).toEqual([posterKeyFor(r.key), expect.any(Uint8Array), "image/jpeg"]);
      expect(put.mock.calls[1]).toEqual([r.key, expect.any(Uint8Array), "video/mp4"]);
      // The source's tags (a phone clip's location, its comment) stay out of the rendered clip.
      const out = Buffer.from((put.mock.calls[1] as unknown as [string, Uint8Array])[1]);
      expect((await readFile(src)).includes("from-the-phone")).toBe(true);
      expect(out.includes("from-the-phone")).toBe(false);
      expect(out.includes("+48.8566")).toBe(false);
      const jpg = (put.mock.calls[0] as unknown as [string, Uint8Array])[1];
      expect(await sharp(jpg).metadata()).toMatchObject({ format: "jpeg", width: 1080, height: 1920 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
