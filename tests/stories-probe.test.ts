import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProbeJson, videoProblem, type VideoMeta } from "@/server/stories/probe";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const ok: VideoMeta = { durationSec: 10, width: 1080, height: 1920, fps: 30, videoStreams: 1, audioStreams: 1 };

describe("parseProbeJson", () => {
  it("reads a phone clip's size, frame rate and streams", () => {
    expect(parseProbeJson(fixture("phone-video.ffprobe.json"))).toMatchObject({ width: 1080, height: 1920, fps: 30, videoStreams: 1, audioStreams: 1 });
  });
  it("takes the real duration, not one written into the file's tags", () => {
    const real = parseProbeJson(fixture("phone-video.ffprobe.json")).durationSec;
    const spoof = parseProbeJson(fixture("phone-video-spoof.ffprobe.json")).durationSec;
    expect(real).toBeGreaterThan(1.9);
    expect(real).toBeLessThan(2.2);
    expect(spoof).toBe(real);
  });
  it("refuses output that isn't ffprobe JSON", () => {
    expect(() => parseProbeJson("nope")).toThrow();
    expect(() => parseProbeJson("{}")).toThrow();
  });
  it("reports the upright size of a clip with rotation metadata", () => {
    const json = (extra: object) => JSON.stringify({ format: { duration: "3" }, streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1", ...extra }] });
    expect(parseProbeJson(json({ side_data_list: [{ rotation: -90 }] }))).toMatchObject({ width: 1080, height: 1920 });
    expect(parseProbeJson(json({ tags: { rotate: "270" } }))).toMatchObject({ width: 1080, height: 1920 });
    expect(parseProbeJson(json({ side_data_list: [{ rotation: 180 }] }))).toMatchObject({ width: 1920, height: 1080 });
  });
});

describe("videoProblem", () => {
  it("accepts a normal clip", () => expect(videoProblem(ok)).toBeNull());
  it.each([
    ["too long", { durationSec: 181 }],
    ["too wide", { width: 4097 }],
    ["too tall", { height: 4097 }],
    ["too fast", { fps: 61 }],
    ["two video streams", { videoStreams: 2 }],
    ["no video stream", { videoStreams: 0 }],
    ["two audio streams", { audioStreams: 2 }],
  ])("refuses %s", (_n, patch) => {
    const p = videoProblem({ ...ok, ...patch });
    expect(p?.code).toMatch(/^story\./);
    expect(p?.message).toBeTruthy();
  });
  it("accepts the limits themselves", () => expect(videoProblem({ ...ok, durationSec: 180, width: 4096, fps: 60, audioStreams: 0 })).toBeNull());
  it("refuses a sliver or a tiny clip by its shape", () => {
    expect(videoProblem({ ...ok, width: 4096, height: 64 })?.code).toBe("story.videoShape");
    expect(videoProblem({ ...ok, width: 239, height: 426 })?.code).toBe("story.videoShape");
    expect(videoProblem({ ...ok, width: 240, height: 426 })).toBeNull();
  });
});
