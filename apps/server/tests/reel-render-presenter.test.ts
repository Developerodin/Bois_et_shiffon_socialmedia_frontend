import type { ReelRender } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn(), version: vi.fn(), presenter: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { reelRender: { findUnique: m.findUnique, updateMany: m.updateMany }, contentVersion: { findUnique: m.version } } }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob: m.enqueue }));
vi.mock("@/server/reels/presenters", () => ({ donePresenter: m.presenter }));
vi.mock("@/server/content/knowledge", () => ({ productPhotos: vi.fn(async () => [{ key: "w1/b1/table.jpg", title: "Table Bunting" }]) }));
const speaking = vi.hoisted(() => ({ now: 0, most: 0 }));
vi.mock("@/server/reels/voice", () => ({
  isElevenVoice: (id: string) => id.startsWith("eleven:"),
  speak: vi.fn(async () => {
    speaking.most = Math.max(speaking.most, ++speaking.now);
    await new Promise((r) => setTimeout(r, 5));
    speaking.now--;
    return new Uint8Array(8);
  }),
}));
vi.mock("@/server/reels/wav", () => ({ wavSeconds: vi.fn(() => 2.5), padAndJoinWav: vi.fn() }));
vi.mock("@/server/storage/media", async (orig) => ({ ...(await orig<object>()), putMedia: vi.fn(), signedMediaUrl: vi.fn(async (k: string) => `https://s3/${k}`) }));
vi.mock("sharp", () => ({ default: Object.assign(() => ({ resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.alloc(1) }) }) }), { concurrency: () => 1, cache: () => {} }) }));
vi.mock("@/server/reels/agents", () => ({ checkSeam: vi.fn() }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: vi.fn() }));
vi.mock("@/server/notifications/push", () => ({ notifyReelFinished: vi.fn() }));

import { advanceRender } from "@/server/reels/render";

const scene = (over: object) => ({ photoKey: "w1/b1/table.jpg", shot: "s", direction: "d", onScreenText: "o", voiceText: "un deux trois", kind: "room", model: "hailuo-2.3", prompt: "director prompt", ...over });
const render = { id: "r1", workspaceId: "w1", brandId: "b1", contentItemId: "i1", contentVersionId: "v1", step: "VOICE", claimedAt: null, requests: {}, outputs: {}, createdAt: new Date() } as unknown as ReelRender;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) })));
  m.findUnique.mockResolvedValue(render);
  m.enqueue.mockResolvedValue({});
});

describe("presenter scenes at VOICE", () => {
  it("routes by the flag (no backup), signs the sheet, photo and voice, and fixes the prompts", async () => {
    m.version.mockResolvedValue({ body: { title: "T", presenter: "p1", template: "", voice: "coral", caption: "", hashtags: [], scenes: [scene({ presenter: true }), scene({})] } });
    m.presenter.mockResolvedValue({ id: "p1", outputKey: "w1/b1/presenter-p1.jpg" });
    await advanceRender({ renderId: "r1" });
    const out = m.updateMany.mock.calls[0][0].data.outputs;
    expect(out.models).toEqual(["seedance-2.5-ref", "hailuo-2.3"]);
    expect(out.clipSeconds[0]).toBe(4); // the presenter model's shortest clip
    expect(out.refs[0].imageUrls).toEqual(["https://s3/w1/b1/presenter-p1.jpg", expect.stringMatching(/^https:\/\/s3\/w1\/b1\//)]);
    expect(out.refs[0].audioUrl).toMatch(/\.wav$/);
    expect(out.refs[1]).toBeNull();
    expect(out.prompts[0]).toMatch(/Table Bunting/);
    expect(out.prompts[1]).toBe("director prompt");
  });

  it("never moves on to clips when the presenter was removed after the charge", async () => {
    m.version.mockResolvedValue({ body: { title: "T", presenter: "gone", template: "", voice: "coral", caption: "", hashtags: [], scenes: [scene({ presenter: true }), scene({})] } });
    m.presenter.mockResolvedValue(null);
    await advanceRender({ renderId: "r1" }).catch(() => {}); // failRender's transaction isn't mocked here
    expect(m.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: "CLIPS" }) }));
  });

  it("speaks ElevenLabs scenes one at a time, OpenAI ones together", async () => {
    m.presenter.mockResolvedValue(null);
    const body = (voice: string) => ({ body: { title: "T", presenter: "none", template: "", voice, caption: "", hashtags: [], scenes: [scene({}), scene({}), scene({})] } });
    speaking.most = 0;
    m.version.mockResolvedValue(body("eleven:EXAVITQu4vr4xnSDxMaL"));
    await advanceRender({ renderId: "r1" });
    expect(speaking.most).toBe(1);
    speaking.most = 0;
    m.version.mockResolvedValue(body("coral"));
    await advanceRender({ renderId: "r1" });
    expect(speaking.most).toBe(3);
  });
});
