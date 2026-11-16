import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/storage/media", () => ({ mediaKnown: vi.fn(async (k: string) => k.includes("sage")), signedMediaUrl: vi.fn(async (k: string) => `https://s3/${k}`) }));

const clones = vi.hoisted(() => ({ live: vi.fn(async () => [] as object[]), one: vi.fn(async () => null as object | null) }));
vi.mock("@/server/reels/clones", () => ({ liveClones: clones.live, liveClone: clones.one }));

import { speak, STOCK_VOICES, voiceList } from "@/server/reels/voice";
import { wavSeconds } from "@/server/reels/wav";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.ELEVENLABS_API_KEY = "test";
  process.env.OPENAI_API_KEY = "test";
});
afterEach(() => vi.useRealTimers());

const pcm = (seconds: number) => new Response(new Uint8Array(24_000 * 2 * seconds));

describe("speak", () => {
  it("refuses a voice that isn't ours instead of using another one", async () => {
    await expect(speak({ text: "x", voice: "eleven:someoneElse" })).rejects.toThrow(/^Unknown voice/);
    await expect(speak({ text: "x", voice: "nova" })).rejects.toThrow(/^Unknown voice/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps ElevenLabs PCM as a 24 kHz WAV", async () => {
    fetchMock.mockResolvedValue(pcm(2));
    const wav = await speak({ text: "Bonjour", voice: "eleven:EXAVITQu4vr4xnSDxMaL" });
    expect(wavSeconds(wav)).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL?output_format=pcm_24000");
  });

  it("waits and tries again when ElevenLabs is busy, then gives up with an error the render calls unavailable", async () => {
    fetchMock.mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "3" } })).mockResolvedValueOnce(pcm(1));
    const ok = speak({ text: "Bonjour", voice: "eleven:EXAVITQu4vr4xnSDxMaL" });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting out Retry-After
    await vi.advanceTimersByTimeAsync(1);
    expect(wavSeconds(await ok)).toBe(1);

    fetchMock.mockReset().mockImplementation(async () => new Response("busy", { status: 429 }));
    const no = speak({ text: "Bonjour", voice: "eleven:EXAVITQu4vr4xnSDxMaL" }).catch((e: Error) => e.message);
    await vi.runAllTimersAsync();
    expect(await no).toMatch(/^ElevenLabs 429/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("stops waiting past the deadline", async () => {
    fetchMock.mockImplementation(async () => new Response("busy", { status: 429 }));
    const no = speak({ text: "Bonjour", voice: "eleven:EXAVITQu4vr4xnSDxMaL", deadline: Date.now() + 1_000 }).catch((e: Error) => e.message);
    expect(await no).toMatch(/^ElevenLabs 429/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("voice list", () => {
  it("lists every stock voice, ElevenLabs ones with their preview", async () => {
    const list = await voiceList("w1", "u1");
    expect(list.map((v) => v.id)).toEqual(STOCK_VOICES.map((v) => v.id));
    expect(list.find((v) => v.id === "coral")?.sampleUrl).toBeNull(); // no sample stored (mocked)
    expect(list.find((v) => v.id === "sage")?.sampleUrl).toBe("https://s3/system/voices/sage.wav");
    expect(list.find((v) => v.id.startsWith("eleven:"))?.sampleUrl).toMatch(/^https:\/\//);
  });
});

describe("cloned voices", () => {
  it("lists the workspace's live clones first, marking the person's own", async () => {
    clones.live.mockResolvedValueOnce([{ id: "v1", name: "Ma voix", ownerUserId: "u1", sampleKey: null }]);
    const [first] = await voiceList("w1", "u1");
    expect(first).toMatchObject({ id: "clone:v1", name: "Ma voix", clone: true, mine: true });
  });

  it("speaks a live clone of the workspace through ElevenLabs, and refuses an archived or foreign one", async () => {
    clones.one.mockResolvedValueOnce({ id: "v1", providerVoiceId: "el123" });
    fetchMock.mockResolvedValue(pcm(1));
    await speak({ text: "Bonjour", voice: "clone:v1", workspaceId: "w1" });
    expect(fetchMock.mock.calls[0][0]).toMatch(/text-to-speech\/el123\?/);
    clones.one.mockResolvedValueOnce(null);
    await expect(speak({ text: "Bonjour", voice: "clone:v1", workspaceId: "w1" })).rejects.toThrow(/^Unknown voice/);
    await expect(speak({ text: "Bonjour", voice: "clone:v1" })).rejects.toThrow(/^Unknown voice/); // no workspace, no clone
  });
});
