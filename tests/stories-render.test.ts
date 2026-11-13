import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { StoryFrame } from "@/server/stories/body";
import { clipArgs, cropBox, escapeMarkup, renderClipFrame, renderedKeyFor, renderInputsHash, renderPhotoFrame, type RenderOpts, textFits } from "@/server/stories/render";

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

describe("cropBox", () => {
  it("fills by default, centred", () => {
    expect(cropBox(2000, 1500, undefined)).toEqual({ width: 2560, height: 1920, left: 740, top: 0, dx: 0, dy: 0 });
  });
  it("letterboxes below 1 and clamps the focal point", () => {
    const b = cropBox(2000, 1500, { x: 0.5, y: 0.5, scale: 0.421875 });
    expect(b.width).toBe(1080);
    expect(b.dy).toBeGreaterThan(0);
    expect(cropBox(2000, 1500, { x: 5, y: -1, scale: 1 }).left).toBe(2560 - 1080);
  });
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
});

describe("renderClipFrame", () => {
  it("cuts a phone clip to 1080×1920 H.264 with the overlay", async () => {
    if (!ffmpegPath) return;
    const dir = await mkdtemp(path.join(tmpdir(), "story-clip-test-"));
    try {
      const src = path.join(dir, "src.mp4");
      await new Promise<void>((res, rej) => execFile(ffmpegPath as string, ["-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=3", "-f", "lavfi", "-i", "sine=duration=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", src], (e) => (e ? rej(e) : res())));
      const put = vi.fn(async () => undefined);
      const clip: StoryFrame = { ...frame, mediaKey: "ws1/b1/clip.mp4", mediaKind: "video", clip: { start: 0, sound: false }, aiMark: true };
      const r = await renderClipFrame(clip, { ...opts, n: 2 }, { get: async () => new Uint8Array(await readFile(src)), put, exists: async () => false });
      expect(r.key).toMatch(/^ws1\/b1\/stories\/[0-9a-f]{64}\.mp4$/);
      expect(r.file).toMatchObject({ width: 1080, height: 1920 });
      expect(r.file.durationSec).toBeGreaterThan(2.5);
      expect(r.file.durationSec).toBeLessThan(3.5);
      expect(put.mock.calls[0]).toEqual([r.key, expect.any(Uint8Array), "video/mp4"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
