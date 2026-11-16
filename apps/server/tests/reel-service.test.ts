import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    contentItem: { findFirst: fn(), update: fn() },
    auditEvent: { create: fn() },
    reelRender: { findUnique: fn() },
  };
  return { tx, prisma: { ...tx, $transaction: vi.fn(async (f: (t: typeof tx) => unknown) => f(tx)) }, decide: fn(), enqueueTick: fn(), kick: fn() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/server/services/publishing", async (orig) => ({ ...(await orig<object>()), decide: m.decide }));
vi.mock("@/server/storage/media", async (orig) => ({ ...(await orig<object>()), signedMediaUrl: vi.fn(async (k: string) => `https://s3/${k}`) }));
vi.mock("@/server/reels/render", () => ({ enqueueTick: m.enqueueTick, renderView: vi.fn() }));
vi.mock("@/server/jobs/runner", () => ({ kickRunner: m.kick }));
vi.mock("@/server/auth/rate-limit", async (orig) => ({ ...(await orig<object>()), hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1 })) }));

import { POST as webhook } from "@/app/api/v1/webhooks/higgsfield/[renderId]/route";
import { registerPostLink, sendReel } from "@/server/reels/service";

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const reel = (status: string, body: object = { videoKey: "w1/b1/r.mp4" }) => m.tx.contentItem.findFirst.mockResolvedValue({ id: "i1", status, studio: true, versions: [{ id: "v1", version: 3, body }] });

beforeEach(() => vi.clearAllMocks());

describe("registerPostLink", () => {
  it("rejects a link that isn't an Instagram post", async () => {
    reel("APPROVED");
    await expect(registerPostLink(scope, "i1", "https://evil.example/reel/abc")).rejects.toThrow(/Instagram post/);
  });

  it("rejects a reel that was never approved", async () => {
    reel("AWAITING_APPROVAL");
    await expect(registerPostLink(scope, "i1", "https://www.instagram.com/reel/abc/")).rejects.toThrow(/Download the reel first/);
  });

  it("rejects a reel that is scheduled to post by itself", async () => {
    reel("SCHEDULED");
    await expect(registerPostLink(scope, "i1", "https://www.instagram.com/reel/abc/")).rejects.toThrow(/scheduled/);
  });

  it("records an approved reel's post link as published", async () => {
    reel("APPROVED");
    await registerPostLink(scope, "i1", "https://www.instagram.com/reel/abc/");
    expect(m.tx.contentItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "PUBLISHED", postUrl: "https://www.instagram.com/reel/abc/" } });
  });
});

describe("sendReel", () => {
  it("approves on the first download and not again on the second", async () => {
    reel("AWAITING_APPROVAL");
    await expect(sendReel(scope, "i1", 3)).resolves.toEqual({ videoUrl: "https://s3/w1/b1/r.mp4" });
    expect(m.decide).toHaveBeenCalledTimes(1);
    reel("APPROVED");
    await sendReel(scope, "i1", 3);
    expect(m.decide).toHaveBeenCalledTimes(1);
  });

  it("waits for the checks before anything can be sent", async () => {
    reel("DRAFT_REVIEW");
    await expect(sendReel(scope, "i1", 3)).rejects.toThrow(/checks are still running/);
  });
});

describe("higgsfield webhook", () => {
  const call = (id: string, s: string) => webhook(new Request(`https://app/api/v1/webhooks/higgsfield/${id}?s=${s}`, { method: "POST", body: "{}" }), { params: Promise.resolve({ renderId: id }) });

  it("ignores a wrong secret and says nothing", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue({ id: "r1abcdefghij", step: "CLIPS", webhookSecret: "a".repeat(64) });
    const res = await call("r1abcdefghij", "b".repeat(64));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(m.enqueueTick).not.toHaveBeenCalled();
  });

  it("doesn't nudge a render that is joining (the join is already running)", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue({ id: "r1abcdefghij", step: "JOIN", webhookSecret: "a".repeat(64) });
    await call("r1abcdefghij", "a".repeat(64));
    expect(m.enqueueTick).not.toHaveBeenCalled();
  });

  it("nudges the render on the right secret", async () => {
    m.tx.reelRender.findUnique.mockResolvedValue({ id: "r1abcdefghij", step: "CLIPS", webhookSecret: "a".repeat(64) });
    await call("r1abcdefghij", "a".repeat(64));
    expect(m.enqueueTick).toHaveBeenCalledTimes(1);
  });
});
