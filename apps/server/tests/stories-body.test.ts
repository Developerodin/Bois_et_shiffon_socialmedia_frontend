import { describe, expect, it, vi } from "vitest";
import { parseStoryInput, storySlides, isStoryBody } from "@/server/stories/body";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

const frame = (over: Record<string, unknown> = {}) => ({ label: "A", headline: "B", body: "C", ...over });
const input = (over: Record<string, unknown> = {}) => ({ frames: [frame(), frame(), frame()], cta: "Voir", link: "https://x.fr", brandMark: true, ...over });
const codeOf = (raw: unknown) => { try { parseStoryInput(raw); } catch (e) { return (e as { code?: string; status?: number }); } return null; };

describe("parseStoryInput", () => {
  it("strips server-only fields", () => {
    const out = parseStoryInput(input({ frames: [frame({ mediaKey: "k", renderedKey: "r", aiMark: true, rights: { kind: "owned" }, file: { width: 1, height: 1, bytes: 1 } })] })) as { frames: Record<string, unknown>[] };
    for (const k of ["mediaKey", "renderedKey", "aiMark", "rights", "file"]) expect(out.frames[0]).not.toHaveProperty(k);
  });
  it("accepts 0 frames", () => {
    expect(parseStoryInput(input({ frames: [] })).frames).toEqual([]);
  });
  it.each([
    ["6 frames", input({ frames: Array.from({ length: 6 }, () => frame()) })],
    ["long headline", input({ frames: [frame({ headline: "x".repeat(61) })] })],
    ["http link", input({ link: "http://x.fr" })],
    ["javascript link", input({ link: "javascript:alert(1)" })],
    ["negative clip start", input({ frames: [frame({ clip: { start: -1, sound: true } })] })],
  ])("rejects %s", (_n, raw) => {
    const e = codeOf(raw);
    expect(e?.code).toBe("story.invalid");
    expect(e?.status).toBe(400);
  });
});

describe("storySlides", () => {
  it("joins fields, drops empties, appends CTA", () => {
    expect(storySlides({ frames: [{ label: "COLLECTION", headline: "L'acacia", body: "" }, { label: "", headline: "Table", body: "Massif" }], cta: "Voir" }))
      .toEqual(["COLLECTION\nL'acacia", "Table\nMassif", "Voir"]);
  });
});

describe("isStoryBody", () => {
  it("recognises the shape", () => {
    expect(isStoryBody({ frames: [], cta: "", link: "", hook: "", productIds: [], brandMark: false })).toBe(true);
    expect(isStoryBody({ frames: "x" })).toBe(false);
    expect(isStoryBody(null)).toBe(false);
  });
});
