import type { ReelRender } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    contentItem: { findFirst: fn(), update: fn(), findUnique: fn() },
    creditEntry: { findFirst: fn() },
    contentVersion: { create: fn(), findFirst: fn() },
    reelRender: { create: fn(), findFirst: fn(), update: fn(), updateMany: fn(), findUnique: fn(), findUniqueOrThrow: fn(), aggregate: fn() },
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
    joinReel: vi.fn(async () => undefined),
    seam: vi.fn(async () => ({ fits: true, note: "" })),
    notify: vi.fn(async () => undefined),
  };
});
// Plans are tested in subscriptions.test.ts; here every workspace has one.
vi.mock("@/server/services/subscriptions", () => ({ requirePlan: vi.fn(async () => undefined), PlanRequiredError: class extends Error {} }));
vi.mock("@/server/db/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/server/reels/higgsfield", () => ({ higgsfield: { animate: m.animate, status: m.status }, fetchResult: vi.fn(async () => new Uint8Array(4)) }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), spendCredits: m.spend, refundCharge: m.refund }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob: m.enqueue }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: m.startAgentRun }));
vi.mock("@/server/storage/media", async (orig) => ({ ...(await orig<object>()), putMedia: vi.fn(), signedMediaUrl: vi.fn(async (k: string) => `https://s3/${k}`) }));
vi.mock("@/server/reels/join", () => ({ joinReel: m.joinReel, frameOf: vi.fn(async () => undefined) }));
vi.mock("@/server/reels/agents", () => ({ checkSeam: m.seam }));
vi.mock("@/server/notifications/push", () => ({ notifyReelFinished: m.notify }));
vi.mock("node:fs/promises", async (orig) => ({ ...(await orig<object>()), readFile: vi.fn(async () => Buffer.alloc(8)) }));

import { advanceRender, nextStep, renderFailure, startRender } from "@/server/reels/render";

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
  m.tx.reelRender.findUniqueOrThrow.mockImplementation(async () => render());
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
  it("gives a failed presenter scene one retry on its own model, then fails", () => {
    const pres = { ...outputs, models: ["seedance-2.5-ref", "kling-3-std"] };
    const failed = [{ state: "failed" as const, error: "e" }, { state: "completed" as const, url: "u" }];
    expect(nextStep(render({ requests: { CLIPS: ["a", "b"] }, outputs: pres }), failed, now)).toEqual({ action: "retryPresenter", scenes: [0] });
    expect(nextStep(render({ requests: { CLIPS: ["a", "b"] }, outputs: { ...pres, presenterRetried: [0] } }), failed, now)).toEqual({ action: "fail", error: "Scene 1: e" });
  });
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
    m.tx.creditEntry.findFirst.mockResolvedValue({ userId: "u1" });
    m.tx.contentItem.findUnique.mockResolvedValue({ title: "Dimona" });
    await advanceRender({ renderId: "r1" });
    expect(m.refund).toHaveBeenCalledWith("w1", "v1:1", m.tx);
    // The person who started it (the one on the charge) hears it couldn't be made.
    expect(m.notify).toHaveBeenCalledWith("u1", { itemId: "i1", title: "Dimona", ok: false });
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

  it.each(["PUBLISHED", "SCHEDULED"])("a render that finishes after the reel was %s leaves the item and its approval alone", async (status) => {
    const wav = Buffer.alloc(44 + 48_000);
    wav.write("RIFF", 0); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24_000, 24); wav.writeUInt32LE(48_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(wav)));
    m.tx.reelRender.findUnique.mockResolvedValue(render({ requests: { CLIPS: ["ra", "rb"] } }));
    m.status.mockResolvedValue({ state: "completed", url: "https://cdn/x.mp4" });
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", status, versions: [{ id: "v1", version: 2, body: plan }] });
    await advanceRender({ renderId: "r1" });
    // The render itself is done (its video is kept on it), but no new version and no status change.
    expect(m.tx.reelRender.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ step: "DONE" }) }));
    expect(m.tx.contentVersion.create).not.toHaveBeenCalled();
    expect(m.tx.contentItem.update).not.toHaveBeenCalled();
    expect(m.startAgentRun).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("join is single-flight: a tick while a join runs waits", () => {
    const now = Date.now();
    expect(nextStep(render({ step: "JOIN", claimedAt: new Date(now - 30_000), outputs: { ...outputs, clipUrls: ["u"] } }), [], now)).toEqual({ action: "wait" });
    // A join can run ~4 min (downloads + ffmpeg): a 3-minute-old claim is still a join in progress.
    expect(nextStep(render({ step: "JOIN", claimedAt: new Date(now - 180_000), outputs: { ...outputs, clipUrls: ["u"] } }), [], now)).toEqual({ action: "wait" });
    expect(nextStep(render({ step: "JOIN", claimedAt: new Date(now - 400_000), outputs: { ...outputs, clipUrls: ["u"] } }), [], now)).toEqual({ action: "join", urls: ["u"] });
  });

  it("a join that lost its claim writes nothing", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render({ step: "JOIN", claimedAt: null, outputs: { ...outputs, clipUrls: ["https://cdn/a.mp4", "https://cdn/b.mp4"] } }));
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 0 });
    await advanceRender({ renderId: "r1" });
    expect(m.tx.contentVersion.create).not.toHaveBeenCalled();
  });

  it("a late join after the render was marked failed doesn't publish a video", async () => {
    const wav = Buffer.alloc(44 + 48_000);
    wav.write("RIFF", 0); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24_000, 24); wav.writeUInt32LE(48_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(wav)));
    m.tx.reelRender.findUnique.mockResolvedValue(render({ requests: { CLIPS: ["ra", "rb"] } }));
    m.status.mockResolvedValue({ state: "completed", url: "https://cdn/x.mp4" });
    m.tx.reelRender.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", versions: [{ id: "v1", version: 2, body: plan }] });
    await advanceRender({ renderId: "r1" }).catch(() => null);
    expect(m.tx.contentVersion.create).not.toHaveBeenCalled();
    expect(m.startAgentRun).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("a refused submit fails the render at once and refunds", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render());
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    m.animate.mockRejectedValue(new Error("Higgsfield 403: not_enough_credits"));
    await advanceRender({ renderId: "r1" }).catch(() => null);
    expect(m.refund).toHaveBeenCalledWith("w1", "v1:1", m.tx);
  });

  it("can't read the clips' status: waits instead of failing (they're still running and billed)", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render({ requests: { CLIPS: ["ra", "rb"] } }));
    m.status.mockRejectedValue(new Error("fetch failed"));
    await advanceRender({ renderId: "r1" });
    expect(m.refund).not.toHaveBeenCalled();
    expect(m.enqueue).toHaveBeenCalled();
  });

  it("can't read the clips' status for over a day: gives up and refunds instead of polling forever", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render({ requests: { CLIPS: ["ra", "rb"] }, createdAt: new Date(Date.now() - 25 * 3600_000) }));
    m.status.mockRejectedValue(new Error("Higgsfield 404"));
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    await advanceRender({ renderId: "r1" });
    expect(m.refund).toHaveBeenCalledWith("w1", "v1:1", m.tx);
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it("a failing join releases its claim and retries, then fails and refunds on the third", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("link expired"); }));
    const joining = (joinErrors: number) => render({ step: "JOIN", claimedAt: null, outputs: { ...outputs, clipUrls: ["https://cdn/a.mp4", "https://cdn/b.mp4"], joinErrors } });
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    m.tx.reelRender.findUnique.mockResolvedValue(joining(0));
    await expect(advanceRender({ renderId: "r1" })).rejects.toThrow("link expired");
    expect(m.tx.reelRender.updateMany).toHaveBeenLastCalledWith({ where: { id: "r1", step: "JOIN" }, data: expect.objectContaining({ claimedAt: null, outputs: expect.objectContaining({ joinErrors: 1 }) }) });
    expect(m.refund).not.toHaveBeenCalled();
    m.tx.reelRender.findUnique.mockResolvedValue(joining(2));
    await advanceRender({ renderId: "r1" });
    expect(m.refund).toHaveBeenCalledWith("w1", "v1:1", m.tx);
    vi.unstubAllGlobals();
  });

  it("resubmits send the same photo link, so the idempotency key matches the same body", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue(render({ outputs: { ...outputs, photoUrls: ["https://s3/fixed-0", "https://s3/fixed-1"] } }));
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    m.animate.mockResolvedValue("rx");
    await advanceRender({ renderId: "r1" });
    expect(m.animate.mock.calls.map((c) => c[0].photoUrl)).toEqual(["https://s3/fixed-0", "https://s3/fixed-1"]);
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
    m.tx.contentVersion.findFirst.mockResolvedValue({ id: "v1" });
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

  it("a plan changed while paying isn't rendered, and the charge comes back", async () => {
    ready();
    m.tx.contentVersion.findFirst.mockResolvedValue({ id: "v2" });
    await expect(startRender({ ...scope, userId: "u1", itemId: "i1", version: 2 })).rejects.toThrow(/newer plan/);
    expect(m.tx.reelRender.create).not.toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalledWith("w1", "v1:1");
  });

  it("won't render a reel that's already scheduled or posted", async () => {
    ready();
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", studio: true, status: "SCHEDULED", versions: [{ id: "v1", version: 2, body: plan }] });
    await expect(startRender({ ...scope, userId: "u1", itemId: "i1", version: 2 })).rejects.toThrow(/scheduled or posted/);
    expect(m.spend).not.toHaveBeenCalled();
  });

  it("refuses a stand-in photo before charging", async () => {
    ready();
    const standIn = { ...plan, scenes: [{ ...plan.scenes[0], standIn: true }, plan.scenes[1]] };
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", studio: true, versions: [{ id: "v1", version: 2, body: standIn }] });
    await expect(startRender({ ...scope, userId: "u1", itemId: "i1", version: 2 })).rejects.toThrow(/doesn't show what it talks about/);
    expect(m.spend).not.toHaveBeenCalled();
  });

  it("refuses a plan with prompt problems before charging", async () => {
    ready();
    const bad = { ...plan, scenes: [{ ...plan.scenes[0], prompt: "no people please" }, plan.scenes[1]] };
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", studio: true, versions: [{ id: "v1", version: 2, body: bad }] });
    await expect(startRender({ ...scope, userId: "u1", itemId: "i1", version: 2 })).rejects.toThrow(/positively/);
    expect(m.spend).not.toHaveBeenCalled();
  });
});

describe("renderFailure (what the app may show)", () => {
  const failed = (error: string, over: object = {}) => render({ step: "FAILED", error, ...over });
  it("never passes the provider's message on, only a kind and where it stopped", () => {
    expect(renderFailure(failed("Higgsfield 403: not_enough_credits"))).toEqual({ kind: "unavailable", stoppedAt: "CLIPS" });
    expect(renderFailure(failed("Voiceover failed (401): bad key", { outputs: {} }))).toEqual({ kind: "unavailable", stoppedAt: "VOICE" });
    expect(renderFailure(failed("ElevenLabs 429: busy", { outputs: {} }))).toEqual({ kind: "unavailable", stoppedAt: "VOICE" });
    expect(renderFailure(failed("ElevenLabs 401: quota_exceeded", { outputs: {} }))).toEqual({ kind: "unavailable", stoppedAt: "VOICE" });
    expect(renderFailure(failed("Unknown voice eleven:x: pick another.", { outputs: {} }))).toEqual({ kind: "voiceDeleted", stoppedAt: "VOICE" });
    expect(renderFailure(failed('ElevenLabs 404: {"detail":{"status":"voice_not_found"}}', { outputs: {} }))).toEqual({ kind: "voiceDeleted", stoppedAt: "VOICE" });
    expect(renderFailure(failed("The video took more than a day. Credits refunded; try again.", { requests: { CLIPS: ["a"] } }))).toEqual({ kind: "slow", stoppedAt: "CLIPS" });
    expect(renderFailure(failed("Scene 2: content flagged", { requests: { CLIPS: ["a", "b"] } }))).toEqual({ kind: "scene", scene: 2, stoppedAt: "CLIPS" });
    expect(renderFailure(failed("Joining the reel failed: boom", { outputs: { ...outputs, clipUrls: ["u"] } }))).toEqual({ kind: "other", stoppedAt: "JOIN" });
    expect(renderFailure(render({ step: "CLIPS" }))).toBeNull();
  });
});

describe("seam check", () => {
  it("softens a join that doesn't read as one film to a dissolve, and keeps the planned one otherwise", async () => {
    const wav = Buffer.alloc(44 + 48_000);
    wav.write("RIFF", 0); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24_000, 24); wav.writeUInt32LE(48_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(wav)));
    const three = { ...plan, scenes: [{ ...plan.scenes[0], transition: "match" }, { ...plan.scenes[1], transition: "cut" }, { ...plan.scenes[1], transition: "cut" }] };
    m.prisma.contentVersion.findUnique.mockResolvedValue({ id: "v1", version: 2, body: three });
    const out3 = { ...outputs, voiceKeys: ["a", "b", "c"], voiceSeconds: [6, 5, 5], photoKeys: [photo, photo, photo], models: ["kling-3-std", "kling-3-std", "kling-3-std"], clipSeconds: [6, 5, 5] };
    m.tx.reelRender.findUnique.mockResolvedValue(render({ step: "JOIN", claimedAt: null, outputs: { ...out3, clipUrls: ["https://cdn/a.mp4", "https://cdn/b.mp4", "https://cdn/c.mp4"] } }));
    m.tx.reelRender.updateMany.mockResolvedValue({ count: 1 });
    m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", versions: [{ id: "v1", version: 2, body: three }] });
    m.seam.mockResolvedValueOnce({ fits: false, note: "different room" }).mockResolvedValueOnce({ fits: true, note: "same sideboard" });
    await advanceRender({ renderId: "r1" });
    const [clips, , , opts] = m.joinReel.mock.calls[0] as unknown as [{ transition?: string }[], string, string, { reencode: boolean }];
    expect(clips.map((c) => c.transition)).toEqual(["dissolve", "cut", undefined]);
    expect(opts.reencode).toBe(true); // a dissolve needs the re-encode path
    const done = m.tx.reelRender.updateMany.mock.calls.find((c) => (c[0] as { data: { step?: string } }).data.step === "DONE")![0] as { data: { outputs: { seams: unknown[] } } };
    expect(done.data.outputs.seams).toEqual([
      { after: 1, planned: "match", used: "dissolve", fits: false, note: "different room" },
      { after: 2, planned: "cut", used: "cut", fits: true, note: "same sideboard" },
    ]);
    vi.unstubAllGlobals();
  });
});
