import { writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ item: vi.fn(), create: vi.fn(), put: vi.fn(), seconds: 5 }));
vi.mock("@/server/db/prisma", () => ({ prisma: { contentItem: { findFirst: m.item }, reelRecording: { create: m.create } } }));
vi.mock("@/server/storage/media", async (orig) => ({ ...(await orig<object>()), putMedia: m.put }));
// ffmpeg writes a WAV of `m.seconds` to its last argument.
vi.mock("@/server/reels/join", async () => {
  const { pcmWav } = await import("@/server/reels/wav");
  return { run: vi.fn(async (args: string[]) => writeFile(args[args.length - 1], pcmWav(new Uint8Array(Math.round(24_000 * 2 * m.seconds))))) };
});

import { uploadRecording } from "@/server/reels/recordings";

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const m4a = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypM4A "), 0, 0, 0, 0]);
const heard = (text: string) => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ text })));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test";
  m.seconds = 5;
  m.item.mockResolvedValue({ id: "i1" });
  m.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "rec1", ...data }));
});

describe("uploading a take", () => {
  it("stores the converted WAV and returns its measured length, what was heard and whether it matches", async () => {
    heard("Une table pensée pour durer.");
    const r = await uploadRecording(scope, "i1", { bytes: m4a, text: "Une table pensée pour durer.", language: "fr" });
    expect(r).toEqual({ id: "rec1", seconds: 5, transcript: "Une table pensée pour durer.", matches: true });
    expect(m.put.mock.calls[0][0]).toMatch(/^w1\/b1\/rec-[0-9a-f-]+\.wav$/);
    expect(m.create.mock.calls[0][0].data).toMatchObject({ contentItemId: "i1", seconds: 5, text: "Une table pensée pour durer." });
    expect(m.item).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i1", workspaceId: "w1", brandId: "b1", studio: true } }));
  });

  it("refuses takes over 15 seconds, empty ones, other files and other reels", async () => {
    heard("x");
    m.seconds = 15.1; // a take stopped at 15 s that measures a little over is fine
    await expect(uploadRecording(scope, "i1", { bytes: m4a, text: "x" })).resolves.toMatchObject({ seconds: 15.1 });
    m.create.mockClear();
    m.seconds = 15.5;
    await expect(uploadRecording(scope, "i1", { bytes: m4a, text: "x" })).rejects.toThrow("Keep it under 15 seconds.");
    m.seconds = 0.2;
    await expect(uploadRecording(scope, "i1", { bytes: m4a, text: "x" })).rejects.toThrow(/empty/);
    await expect(uploadRecording(scope, "i1", { bytes: new Uint8Array(Buffer.from("RIFF....WAVEfmt ")), text: "x" })).rejects.toThrow(/couldn't be read/);
    m.item.mockResolvedValue(null);
    await expect(uploadRecording(scope, "other", { bytes: m4a, text: "x" })).rejects.toThrow("Reel not found");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("rounds the length up so the price covers what renders", async () => {
    heard("x");
    m.seconds = 7.004;
    expect((await uploadRecording(scope, "i1", { bytes: m4a, text: "x" })).seconds).toBe(7.01);
  });
});
