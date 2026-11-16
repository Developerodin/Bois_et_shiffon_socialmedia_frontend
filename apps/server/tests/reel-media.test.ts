import { DISSOLVE_SECONDS, videoFilter } from "@/server/reels/join";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchResult, higgsfield } from "@/server/reels/higgsfield";
import { padAndJoinWav, wavSeconds } from "@/server/reels/wav";

/** A 16-bit mono WAV like OpenAI's streamed one: the RIFF and data size fields say 0xFFFFFFFF. */
function wav(seconds: number, rate = 24_000, streamed = true) {
  const data = Math.round(seconds * rate) * 2;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0);
  b.writeUInt32LE(streamed ? 0xffffffff : 36 + data, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); // byte rate
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(streamed ? 0xffffffff : data, 40);
  return new Uint8Array(b);
}

describe("wav", () => {
  it("reads a streamed WAV's length from its size, not its header", () => {
    expect(wavSeconds(wav(1.5))).toBeCloseTo(1.5, 5);
  });

  it("pads each scene's voice to its clip and joins them with a correct header", () => {
    const out = wavSeconds(padAndJoinWav([wav(1), wav(0.5)], [2, 1]));
    expect(out).toBeCloseTo(3, 5);
    const joined = Buffer.from(padAndJoinWav([wav(1), wav(0.5)], [2, 1]));
    expect(joined.readUInt32LE(40)).toBe(joined.length - 44);
  });

  it("refuses voices in different formats", () => {
    expect(() => padAndJoinWav([wav(1, 24_000), wav(1, 16_000)], [2, 2])).toThrow(/format/);
  });
});

describe("higgsfield", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "id1:secret1");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const respond = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }));

  it("animates a photo with our key, a webhook and an idempotency key", async () => {
    respond(200, { status: "queued", request_id: "r1" });
    const id = await higgsfield.animate({ model: "kling-3-std", photoUrl: "https://s3/p.jpg", prompt: "push in", seconds: 8, webhook: "https://app/hook?s=x", idempotencyKey: "rend:clip:0" });
    expect(id).toBe("r1");
    const { url, init } = calls[0];
    expect(url).toBe(`https://api.higgsfield.ai/kling-video/v3.0/std/image-to-video?hf_webhook=${encodeURIComponent("https://app/hook?s=x")}`);
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Key id1:secret1");
    expect(h["Idempotency-Key"]).toBe("rend:clip:0");
    expect(JSON.parse(init.body as string)).toEqual({ image_url: "https://s3/p.jpg", prompt: "push in", duration: 8, sound: "off" });
  });

  it("joins a separate secret when the id holds only the id", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "id2");
    vi.stubEnv("HIGGSFIELD_API_KEY_SECRET", "secret2");
    respond(200, { request_id: "r2" });
    await higgsfield.animate({ model: "kling-3-std", photoUrl: "https://s3/p.jpg", prompt: "p", seconds: 3, webhook: "https://app/h", idempotencyKey: "k" });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Key id2:secret2");
  });

  it("maps request status", async () => {
    respond(200, { status: "completed", request_id: "r1", video: { url: "https://cdn/x.mp4" } });
    await expect(higgsfield.status("r1")).resolves.toEqual({ state: "completed", url: "https://cdn/x.mp4" });
    expect(calls[0].url).toBe("https://api.higgsfield.ai/requests/r1/status");
    respond(200, { status: "nsfw", request_id: "r1" });
    await expect(higgsfield.status("r1")).resolves.toMatchObject({ state: "failed" });
    respond(200, { status: "in_progress", request_id: "r1" });
    await expect(higgsfield.status("r1")).resolves.toEqual({ state: "in_progress" });
  });

  it("surfaces Higgsfield's reason on a refusal", async () => {
    respond(403, { detail: "not_enough_credits" });
    await expect(higgsfield.animate({ model: "kling-3-std", photoUrl: "https://s3/p.jpg", prompt: "p", seconds: 3, webhook: "https://app/h", idempotencyKey: "k" })).rejects.toThrow(/not_enough_credits/);
  });

  it("never downloads from a private address", async () => {
    await expect(fetchResult("http://10.0.0.1/x.mp4")).rejects.toThrow();
    await expect(fetchResult("https://127.0.0.1/x.mp4")).rejects.toThrow();
  });
});

describe("videoFilter (cuts and dissolves)", () => {
  it("joins plain cuts with concat and nothing held at the end", () => {
    const f = videoFilter([{ seconds: 3, transition: "match" }, { seconds: 4 }]);
    expect(f).toContain("[v0][v1]concat=n=2:v=1:a=0[j1]");
    expect(f.endsWith("[j1]null[v]")).toBe(true);
  });
  it("crossfades a dissolve at the end of the first scene and holds the last frame by the time it overlaps", () => {
    const f = videoFilter([{ seconds: 3, transition: "dissolve" }, { seconds: 4, transition: "cut" }, { seconds: 5 }]);
    expect(f).toContain(`[v0][v1]xfade=transition=fade:duration=${DISSOLVE_SECONDS}:offset=${(3 - DISSOLVE_SECONDS).toFixed(3)}[j1]`);
    expect(f).toContain("[j1][v2]concat=n=2:v=1:a=0[j2]");
    expect(f.endsWith(`[j2]tpad=stop_mode=clone:stop_duration=${DISSOLVE_SECONDS.toFixed(3)}[v]`)).toBe(true);
  });
});
