import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ voice: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { voice: { findFirst: m.voice } } }));

import { isLibraryVoice, LibraryQuery, searchLibrary } from "@/server/reels/library";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.ELEVENLABS_API_KEY = "test";
  m.voice.mockResolvedValue(null);
});

describe("the ElevenLabs voice library", () => {
  it("passes the filters on and returns library ids with their previews", async () => {
    fetchMock.mockResolvedValue(Response.json({ has_more: true, voices: [
      { voice_id: "SptHT9PQ49isQvxFm28t", name: "Agathe", gender: "female", age: "young", accent: "standard", language: "fr", use_case: "social_media", preview_url: "https://storage.googleapis.com/x.mp3" },
      { voice_id: "../evil", name: "Bad id" },
    ] }));
    const r = await searchLibrary(LibraryQuery.parse({ language: "fr", gender: "female", useCase: "social_media", search: "calme", page: "1" }));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ page_size: "30", page: "1", language: "fr", gender: "female", use_cases: "social_media", search: "calme" });
    expect(r).toEqual({ more: true, voices: [{ id: "library:SptHT9PQ49isQvxFm28t", name: "Agathe", gender: "female", age: "young", accent: "standard", language: "fr", useCase: "social_media", previewUrl: "https://storage.googleapis.com/x.mp3" }] });
  });

  it("refuses filters it doesn't know", () => {
    expect(LibraryQuery.safeParse({ gender: "robot" }).success).toBe(false);
    expect(LibraryQuery.safeParse({ language: "french" }).success).toBe(false);
  });

  it("accepts a library id, never one of the workspaces' clones held in our account", async () => {
    expect(await isLibraryVoice("library:SptHT9PQ49isQvxFm28t")).toBe(true);
    expect(await isLibraryVoice("library:short")).toBe(false);
    expect(await isLibraryVoice("eleven:SptHT9PQ49isQvxFm28t")).toBe(false);
    m.voice.mockResolvedValue({ id: "v1" }); // some workspace's clone has this ElevenLabs id
    expect(await isLibraryVoice("library:SptHT9PQ49isQvxFm28t")).toBe(false);
  });
});
