import type { ReelRender } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    contentItem: { findFirst: fn(), update: fn() },
    contentVersion: { create: fn() },
    reelRender: { create: fn(), findFirst: fn(), update: fn(), updateMany: fn(), findUnique: fn(), aggregate: fn() },
    auditEvent: { create: fn() },
  };
  return {
    tx,
    prisma: { ...tx, $transaction: vi.fn(async (f: (t: typeof tx) => unknown) => f(tx)), contentVersion: { ...tx.contentVersion, findUnique: fn() } },
    animate: fn(),
    status: fn(),
    spend: fn(),
    refund: fn(),
    enqueue: fn(),
    startAgentRun: fn(),
  };
});
vi.mock("@/server/db/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/server/reels/higgsfield", () => ({ higgsfield: { animate: m.animate, status: m.status }, fetchResult: vi.fn(async () => new Uint8Array(4)) }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), spendCredits: m.spend, refundCharge: m.refund }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob: m.enqueue }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: m.startAgentRun }));
vi.mock("@/server/storage/media", async (orig) => ({ ...(await orig<object>()), putMedia: vi.fn(), signedMediaUrl: vi.fn(async (k: string) => `https://s3/${k}`) }));
vi.mock("@/server/reels/join", () => ({ joinReel: vi.fn(async () => undefined) }));
vi.mock("node:fs/promises", async (orig) => ({ ...(await orig<object>()), readFile: vi.fn(async () => Buffer.alloc(8)) }));

import { advanceRender, nextStep, startRender } from "@/server/reels/render";

const scope = { workspaceId: "w1", brandId: "b1" };
const photo = "w1/b1/0b4b2c1e-6a1d-4f7e-9a40-0c6f2d8e1a11.jpg";
const plan = {
  title: "Bunting", presenter: "none", template: "spotlight", voice: "coral", caption: "Une table.", hashtags: [],
  scenes: [
    { photoKey: photo, shot: "Wide", direction: "slow push in", onScreenText: "Acacia", voiceText: "mot ".repeat(12), kind: "room", model: "seedance-2.5", prompt: "slow push in, warm light" },
    { photoKey: photo, shot: "Close", direction: "orbit", onScreenText: "Grain", voiceText: "mot ".repeat(10), kind: "detail", model: "kling-3-std", prompt: "slow orbit on the grain" },
  ],
};
const outputs = { voiceKeys: ["a.wav", "b.wav"], voiceSeconds: [6, 5], photoKeys: [photo, photo], models: ["seedance-2.5", "kling-3-std"], clipSeconds: [6, 5], backups: [] };
const render = (over: object = {}) => ({ id: "r1", ...scope, contentItemId: "i1", contentVersionId: "v1", attempt: 1, step: "CLIPS", claimedAt: null, requests: {}, outputs, chargeId: "v1:1", webhookSecret: "s", createdAt: new Date(), ...over }) as unknown as ReelRender;

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.contentVersion.findUnique.mockResolvedValue({ id: "v1", version: 2, body: plan });
  m.enqueue.mockResolvedValue({});
  m.startAgentRun.mockResolvedValue({});
});

describe("nextStep", () => {
  const now = Date.now();
  it("starts with the voice", () => expect(nextStep(render({ step: "VOICE" }), [], now)).toEqual({ action: "voice" }));
  it("submits clips when none were sent", () => expect(nextStep(render(), [], now)).toEqual({ action: "submit" }));
  it("waits while a fresh submit is in flight", () => expect(nextStep(render({ claimedAt: new Date(now - 30_000) }), [], now)).toEqual({ action: "wait" }));
  it("resubmits after a stale claim (same idempotency keys, no double charge)", () => expect(nextStep(render({ claimedAt: new Date(now - 180_000) }), [], now)).toEqual({ action: "submit" }));
  it("retries a failed scene on the backup model once", () => {
    const r = render({ requests: { CLIPS: ["a", "b"] } });
    expect(nextStep(r, [{ state: "completed", url: "https://x/1" }, { state: "failed", error: "e" }], now)).toEqual({ action: "backup", scenes: [1] });
    expect(nextStep(render({ requests: { CLIPS: ["a", "b"] }, outputs: { ...outputs, backups: [1] } }), [{ state: "completed", url: "u" }, { state: "failed", error: "boom" }], now)).toEqual({ action: "fail", error: "Scene 2: boom" });
  });
  it("joins when every clip is done", () =>
    expect(nextStep(render({ requests: { CLIPS: ["a", "b"] } }), [{ state: "completed", url: "https://x/1" }, { state: "completed", url: "https://x/2" }], now)).toEqual({ action: "join", urls: ["https://x/1", "https://x/2"] }));
  it("waits while clips are running", () => expect(nextStep(render({ requests: { CLIPS: ["a", "b"] } }), [{ state: "completed", url: "u" }, { state: "queued" }], now)).toEqual({ action: "wait" }));
  it("gives up after a day", () => expect(nextStep(render({ requests: { CLIPS: ["a"] }, createdAt: new Date(now - 25 * 3600_000) }), [{ state: "queued" }], now)).toMatchObject({ action: "fail" }));
});

describe("advanceRender", () => {
  it("claim is single-flight: a lost claim submits nothing", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render());
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 0 });
    await advanceRender({ renderId: "r1" });
    expect(m.animate).not.toHaveBeenCalled();
  });

  it("submits each scene on its routed model with a stable idempotency key", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render());
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    m.animate.mockResolvedValueOnce("ra").mockResolvedValueOnce("rb");
    await advanceRender({ renderId: "r1" });
    expect(m.animate.mock.calls.map((c) => [c[0].model, c[0].idempotencyKey, c[0].seconds, c[0].prompt])).toEqual([
      ["seedance-2.5", "r1:clip:0", 6, "slow push in, warm light"],
      ["kling-3-std", "r1:clip:1", 5, "slow orbit on the grain"],
    ]);
    expect(m.tx.reelRender.update.mock.calls.at(-1)?.[0].data).toMatchObject({ requests: { CLIPS: ["ra", "rb"] }, claimedAt: null });
  });

  it("resume polls stored ids instead of resubmitting", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render({ requests: { CLIPS: ["ra", "rb"] } }));
    m.status.mockResolvedValue({ state: "in_progress" });
    await advanceRender({ renderId: "r1" });
    expect(m.animate).not.toHaveBeenCalled();
    expect(m.status).toHaveBeenCalledTimes(2);
    expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: expect.stringMatching(/^reel:r1:at:\d+$/) }));
  });

  it("a failed render refunds its credits", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render({ requests: { CLIPS: ["ra"] }, outputs: { ...outputs, backups: [0] } }));
    m.status.mockResolvedValue({ state: "failed", error: "nope" });
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    await advanceRender({ renderId: "r1" });
    expect(m.refund).toHaveBeenCalledWith("w1", "v1:1");
  });

  it("joining starts the quality check for that reel", async () => {
    const wav = Buffer.alloc(44 + 48_000);
    wav.write("RIFF", 0); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24_000, 24); wav.writeUInt32LE(48_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(wav)));
    m.tx.reelRender.findUnique.mockResolvedValue(render({ requests: { CLIPS: ["ra", "rb"] } }));
    m.status.mockResolvedValue({ state: "completed", url: "https://cdn/x.mp4" });
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", versions: [{ id: "v1", version: 2, body: plan }] });
    await advanceRender({ renderId: "r1" });
    expect(m.tx.contentVersion.create.mock.calls[0][0].data).toMatchObject({ version: 3, createdBy: "agent", body: expect.objectContaining({ videoKey: expect.stringMatching(/^w1\/b1\/.+\.mp4$/) }) });
    expect(m.startAgentRun).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "quality", input: { itemId: "i1" } }));
    vi.unstubAllGlobals();
  });
});

describe("startRender", () => {
  const ready = () => {
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", studio: true, versions: [{ id: "v1", version: 2, body: plan }] });
    m.tx.reelRender.findFirst.mockResolvedValue(null);
    m.tx.reelRender.aggregate.mockResolvedValue({ _max: { attempt: null } });
    m.tx.reelRender.create.mockImplementation(async (a: { data: object }) => ({ id: "r1", ...a.data }));
    m.tx.reelRender.update.mockResolvedValue({});
    m.spend.mockImplementation(async (i: { refId: string }) => i.refId);
  };

  it("charges the plan's price once per attempt", async () => {
    ready();
    await startRender({ ...scope, userId: "u1", itemId: "i1", version: 2 });
    expect(m.spend).toHaveBeenCalledWith(expect.objectContaining({ amount: 22, reason: "reel-render", refId: "v1:1" }));
  });

  it("a second tap while it renders returns the same render, no second charge", async () => {
    ready();
    m.tx.reelRender.findFirst.mockResolvedValue(render({ step: "VOICE" }));
    const r = await startRender({ ...scope, userId: "u1", itemId: "i1", version: 2 });
    expect(r.id).toBe("r1");
    expect(m.spend).not.toHaveBeenCalled();
  });

  it("try again after a failure is a new, charged attempt", async () => {
    ready();
    m.tx.reelRender.aggregate.mockResolvedValue({ _max: { attempt: 1 } });
    await startRender({ ...scope, userId: "u1", itemId: "i1", version: 2 });
    expect(m.spend).toHaveBeenCalledWith(expect.objectContaining({ refId: "v1:2" }));
  });

  it("refuses a plan with prompt problems before charging", async () => {
    ready();
    const bad = { ...plan, scenes: [{ ...plan.scenes[0], prompt: "no people please" }, plan.scenes[1]] };
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", studio: true, versions: [{ id: "v1", version: 2, body: bad }] });
    await expect(startRender({ ...scope, userId: "u1", itemId: "i1", version: 2 })).rejects.toThrow(/positively/);
    expect(m.spend).not.toHaveBeenCalled();
  });
});
