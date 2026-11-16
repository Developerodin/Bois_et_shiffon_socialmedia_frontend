import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const reelAsset = { findMany: fn(), create: fn(), findUnique: fn(), update: fn(), updateMany: fn(), findUniqueOrThrow: fn() };
  const tx = { reelAsset };
  return {
    prisma: { reelAsset, $transaction: vi.fn(async (f: (t: typeof tx) => unknown) => f(tx)) },
    spend: fn(),
    refund: fn(),
    photos: fn(),
    enqueue: fn(),
    animate: fn(),
    status: fn(),
    put: fn(),
  };
});
vi.mock("@/server/db/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), spendCredits: m.spend, refundCharge: m.refund }));
vi.mock("@/server/services/subscriptions", () => ({ requirePlan: vi.fn(async () => {}) }));
vi.mock("@/server/content/knowledge", () => ({ productPhotos: m.photos }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob: m.enqueue }));
vi.mock("@/server/reels/higgsfield", () => ({ higgsfield: { animate: m.animate, status: m.status }, fetchResult: vi.fn(async () => new Uint8Array([1])) }));
vi.mock("@/server/reels/join", () => ({ frameOf: vi.fn(async (_f: string, _w: string, out: string) => (await import("node:fs/promises")).writeFile(out, "jpg")) }));
vi.mock("@/server/storage/media", async (orig) => ({
  ...(await orig<object>()),
  putMedia: m.put,
  signedMediaUrl: vi.fn(async (k: string) => `https://s3/${k}`),
  mediaKnown: vi.fn(async (k: string) => k.includes("spotlight")),
}));

import { runAsset } from "@/server/reels/assets";
import { createTemplatePreview, templateOptions } from "@/server/reels/templates";
import { templateAsk } from "@/server/reels/service";

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const row = (over: object = {}) => ({ id: "a1", workspaceId: "w1", brandId: "b1", kind: "template-preview", status: "RUNNING", input: { templateId: "material", photoKey: "w1/b1/table.jpg", prompt: "first prompt", imageUrl: "https://s3/src" }, requestId: null, outputKey: null, chargeId: "c1", createdAt: new Date(), ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.photos.mockResolvedValue([{ key: "w1/b1/table.jpg", title: "Table", url: null }]);
  m.prisma.reelAsset.findMany.mockResolvedValue([]);
  m.spend.mockResolvedValue("c1");
  m.enqueue.mockResolvedValue({});
  m.prisma.reelAsset.create.mockImplementation(async ({ data }: { data: object }) => ({ ...row(), ...data }));
});

describe("paid template previews", () => {
  it("charges once per tap under the new row's id, so a retry is a new charge", async () => {
    await createTemplatePreview(scope, "material");
    await createTemplatePreview(scope, "material");
    const refIds = m.spend.mock.calls.map(([c]) => c.refId);
    expect(refIds[0]).not.toBe(refIds[1]);
    expect(m.spend.mock.calls[0][0]).toMatchObject({ amount: 10, reason: "template-preview" });
    expect(m.enqueue).toHaveBeenCalledTimes(2);
  });

  it("refuses with no photos before charging, and unknown templates", async () => {
    m.photos.mockResolvedValue([]);
    await expect(createTemplatePreview(scope, "material")).rejects.toThrow(/Add product photos/);
    await expect(createTemplatePreview(scope, "nope")).rejects.toThrow(/Unknown template/);
    expect(m.spend).not.toHaveBeenCalled();
  });

  it("refunds a second tap while one is running (the partial unique index)", async () => {
    m.prisma.reelAsset.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    await expect(createTemplatePreview(scope, "material")).rejects.toThrow(/already being made/);
    expect(m.refund).toHaveBeenCalledWith("w1", "c1");
  });

  it("gives up on a preview stuck for over an hour (refunded) so it can't block the template", async () => {
    m.prisma.reelAsset.findMany.mockImplementation(async ({ where }: { where: { status?: string } }) => (where.status === "RUNNING" ? [row({ id: "old" })] : []));
    m.prisma.reelAsset.updateMany.mockResolvedValue({ count: 1 });
    m.prisma.reelAsset.findUniqueOrThrow.mockResolvedValue(row({ id: "old", chargeId: "c-old" }));
    await createTemplatePreview(scope, "material");
    expect(m.prisma.reelAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "old", status: "RUNNING" } }));
    expect(m.refund).toHaveBeenCalledWith("w1", "c-old", expect.anything());
    expect(m.prisma.reelAsset.create.mock.calls[0][0].data.input).toMatchObject({ templateId: "material", prompt: expect.stringMatching(/Macro/) });
  });

  it("submits under the row's key, then stores the finished clip and its poster", async () => {
    m.prisma.reelAsset.findUnique.mockResolvedValue(row());
    m.animate.mockResolvedValue("r1");
    await runAsset({ assetId: "a1" });
    expect(m.animate).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "asset:a1", photoUrl: "https://s3/src", seconds: 5, prompt: "first prompt" }));
    expect(m.prisma.reelAsset.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { requestId: "r1" } });

    m.prisma.reelAsset.findUnique.mockResolvedValue(row({ requestId: "r1" }));
    m.status.mockResolvedValue({ state: "completed", url: "https://hf/x.mp4" });
    await runAsset({ assetId: "a1" });
    expect(m.put.mock.calls.map(([k]) => k)).toEqual(["w1/b1/preview-a1.mp4", "w1/b1/preview-a1.jpg"]);
    expect(m.prisma.reelAsset.updateMany).toHaveBeenCalledWith({ where: { id: "a1", status: "RUNNING" }, data: { status: "DONE", outputKey: "w1/b1/preview-a1.mp4" } });
  });

  it("fails and refunds when the clip fails or Higgsfield refuses it", async () => {
    m.prisma.reelAsset.updateMany.mockResolvedValue({ count: 1 });
    m.prisma.reelAsset.findUniqueOrThrow.mockResolvedValue(row());
    m.prisma.reelAsset.findUnique.mockResolvedValue(row({ requestId: "r1" }));
    m.status.mockResolvedValue({ state: "failed", error: "nsfw" });
    await runAsset({ assetId: "a1" });
    m.prisma.reelAsset.findUnique.mockResolvedValue(row());
    m.animate.mockRejectedValue(new Error("Higgsfield 403: not_enough_credits"));
    await runAsset({ assetId: "a1" });
    expect(m.refund).toHaveBeenCalledTimes(2);
  });
});

describe("template options", () => {
  it("shows the brand's own preview over the generic one, and the generic one when there is no own", async () => {
    m.prisma.reelAsset.findMany.mockResolvedValue([row({ status: "DONE", outputKey: "w1/b1/preview-a1.mp4" })]);
    const { templates, canPreview } = await templateOptions(scope);
    const by = Object.fromEntries(templates.map((t) => [t.id, t]));
    expect(by.material).toMatchObject({ own: true, preview: { videoKey: "w1/b1/preview-a1.mp4", posterKey: "w1/b1/preview-a1.jpg" } });
    expect(by.spotlight).toMatchObject({ own: false, preview: { videoKey: "system/templates/spotlight-v1.mp4" } });
    expect(by.collection.preview).toBeNull();
    expect(canPreview).toBe(true);
  });
});

describe("applying a template", () => {
  it("sends the template's ask and keeps the phone's title as the person's turn", () => {
    expect(templateAsk("material", "Détail matière")).toMatchObject({ template: "material", turn: "Détail matière", ask: expect.stringMatching(/material detail/) });
    expect(templateAsk("material", undefined).turn).toBe("Material detail");
    expect(templateAsk(undefined, "plus court")).toEqual({ ask: "plus court", turn: "plus court", template: undefined });
    expect(() => templateAsk("nope", undefined)).toThrow(/Unknown template/);
  });
});
