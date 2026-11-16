import { afterEach, describe, expect, it, vi } from "vitest";
import { higgsfield } from "@/server/reels/higgsfield";
import { promptProblems } from "@/server/reels/prompt-check";
import { modelSeconds, needsReencode, routeScene, VIDEO_MODELS } from "@/server/reels/router";

describe("scene routing", () => {
  it("sends each kind of scene to the model that suits it", () => {
    expect(routeScene("detail")).toBe("kling-3-std");
    expect(routeScene("room")).toBe("seedance-2.5");
    expect(routeScene("physics")).toBe("hailuo-2.3");
  });

  it("fits clip length to each model's limits", () => {
    expect(modelSeconds("hailuo-2.3", 7.2)).toBe(10);
    expect(modelSeconds("hailuo-2.3", 4)).toBe(6);
    expect(modelSeconds("hailuo-2.3", 12)).toBe(10);
    expect(modelSeconds("seedance-2.5", 2)).toBe(4);
    expect(modelSeconds("kling-3-std", 16)).toBe(15);
    expect(modelSeconds("kling-3-std", 7.2)).toBe(8);
  });

  it("asks Seedance for 1080p and no sound of its own", () => {
    expect(VIDEO_MODELS["seedance-2.5"].body({ photoUrl: "u", prompt: "p", seconds: 6 })).toEqual({ image_url: "u", prompt: "p", duration: 6, resolution: "1080p", generate_audio: false });
  });

  it("re-encodes only when clips differ or need trimming", () => {
    expect(needsReencode([{ model: "kling-3-std", clip: 8, scene: 8 }, { model: "seedance-2.5", clip: 6, scene: 6 }])).toBe(true);
    expect(needsReencode([{ model: "kling-3-std", clip: 8, scene: 8 }, { model: "kling-3-std", clip: 5, scene: 5 }])).toBe(false);
    expect(needsReencode([{ model: "hailuo-2.3", clip: 10, scene: 8 }, { model: "hailuo-2.3", clip: 6, scene: 6 }])).toBe(true);
  });
});

describe("prompt check", () => {
  it("passes a concrete motion prompt", () => {
    expect(promptProblems("slow push in on the oak grain, warm morning light, tack sharp")).toEqual([]);
  });

  it("flags negative phrasing, re-describing the still and length", () => {
    expect(promptProblems("slow pan, no people in the room")).toEqual([expect.stringMatching(/positively/)]);
    expect(promptProblems("A photo of a table in a room, the camera pushes in")).toEqual([expect.stringMatching(/motion/)]);
    expect(promptProblems("x ".repeat(700))).toEqual([expect.stringMatching(/long/)]);
  });
});

describe("animate per model", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("posts to the routed model's endpoint", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY_ID", "a:b");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ request_id: "r9" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await higgsfield.animate({ model: "hailuo-2.3", photoUrl: "https://s/p.jpg", prompt: "fabric falls", seconds: 6, webhook: "https://app/h", idempotencyKey: "k" });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toMatch(/^https:\/\/api\.higgsfield\.ai\/minimax\/hailuo-2\.3\/standard\/image-to-video\?hf_webhook=/);
  });
});
