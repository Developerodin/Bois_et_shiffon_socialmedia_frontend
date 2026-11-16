import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.hoisted(() => {
  process.env.AWS_ACCESS_KEY_ID = "test";
  process.env.AWS_SECRET_ACCESS_KEY = "test";
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_ENDPOINT_URL = "https://storage.example.com";
});

const m = vi.hoisted(() => ({
  create: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), del: vi.fn(), raw: vi.fn(),
  hit: vi.fn(), get: vi.fn(), put: vi.fn(), delMedia: vi.fn(), probe: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: { mediaUpload: { create: m.create, updateMany: m.updateMany, update: m.update, findFirst: m.findFirst, findMany: m.findMany, delete: m.del }, $queryRaw: m.raw },
}));
vi.mock("@/server/auth/rate-limit", () => ({ hitRateLimit: m.hit }));
vi.mock("@/server/storage/media", async (orig) => ({
  ...(await orig<object>()), getMediaBytes: m.get, putMedia: m.put, deleteMedia: m.delMedia, signedMediaUrl: async (k: string) => `https://signed/${k}`,
}));
vi.mock("@/server/stories/probe", async (orig) => ({ ...(await orig<object>()), probeVideo: m.probe }));

import { createUploadSlot, purgeStaleUploads, verifyUpload } from "@/server/stories/uploads";
import { S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { MediaTooLarge, presignedPut } from "@/server/storage/media";

const realGet = (await vi.importActual<typeof import("@/server/storage/media")>("@/server/storage/media")).getMediaBytes;

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const slot = (o: object = {}) => createUploadSlot(scope, { kind: "photo", contentType: "image/jpeg", bytes: 1000, rightsConfirmed: true, ...o } as never);
const MB = 1024 * 1024;

beforeEach(() => {
  vi.resetAllMocks();
  m.delMedia.mockResolvedValue(undefined);
  m.put.mockResolvedValue(undefined);
  m.update.mockResolvedValue({});
  m.del.mockResolvedValue({});
  m.hit.mockResolvedValue({ allowed: true, count: 1 });
  m.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "up1", ...data }));
});

describe("upload slot", () => {
  it("returns a presigned PUT under the brand's uploads folder", async () => {
    const r = await slot();
    expect(r.uploadId).toBe("up1");
    expect(r.headers).toMatchObject({ "Content-Type": "image/jpeg" });
    const key = m.create.mock.calls[0][0].data.key as string;
    expect(key).toMatch(/^w1\/b1\/uploads\/[0-9a-f-]+\.jpg$/);
    expect(m.create.mock.calls[0][0].data).toMatchObject({ workspaceId: "w1", brandId: "b1", kind: "photo", status: "PENDING", bytes: 1000, createdBy: "u1", rightsConfirmedBy: "u1" });
    expect(m.hit).toHaveBeenCalledWith("story-upload:b1", 20, 3_600_000);
  });
  it("refuses without confirmed rights", async () => {
    await expect(slot({ rightsConfirmed: false })).rejects.toMatchObject({ status: 400, code: "story.rights" });
    expect(m.create).not.toHaveBeenCalled();
  });
  it("refuses a 101 MB video with 413 and an SVG with 400", async () => {
    await expect(slot({ kind: "video", contentType: "video/mp4", bytes: 101 * MB })).rejects.toMatchObject({ status: 413, code: "story.tooLarge" });
    await expect(slot({ contentType: "image/svg+xml" })).rejects.toMatchObject({ status: 400, code: "story.type" });
    await expect(slot({ bytes: 16 * MB })).rejects.toMatchObject({ status: 413 });
    await expect(slot({ bytes: 0 })).rejects.toMatchObject({ status: 400 });
  });
  it("refuses the 21st slot in an hour", async () => {
    m.hit.mockResolvedValue({ allowed: false, count: 21 });
    await expect(slot()).rejects.toMatchObject({ status: 429, code: "story.uploadLimit" });
    expect(m.create).not.toHaveBeenCalled();
  });
});

describe("presignedPut", () => {
  it("signs content-length and content-type, with no checksum parameter", async () => {
    const url = new URL(await presignedPut("w1/b1/uploads/x.jpg", "image/jpeg", 1000, 600));
    const signed = url.searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signed).toContain("content-length");
    expect(signed).toContain("content-type");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect([...url.searchParams.keys()].some((k) => k.toLowerCase().includes("checksum"))).toBe(false);
  });
});

describe("getMediaBytes", () => {
  const reply = (chunks: Buffer[], len?: number) =>
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({ Body: Readable.from(chunks), ContentLength: len ?? chunks.reduce((n, c) => n + c.length, 0) } as never);
  it("returns the bytes within the limit", async () => {
    reply([Buffer.from([1, 2]), Buffer.from([3])]);
    expect([...(await realGet("k", 3))]).toEqual([1, 2, 3]);
  });
  it("refuses a reported length over the limit before reading", async () => {
    reply([Buffer.from([1])], 99);
    await expect(realGet("k", 3)).rejects.toBeInstanceOf(MediaTooLarge);
  });
  it("stops a stream that runs past the limit despite a small reported length", async () => {
    reply([Buffer.alloc(2), Buffer.alloc(2)], 2);
    await expect(realGet("k", 3)).rejects.toBeInstanceOf(MediaTooLarge);
  });
});

describe("verifying an upload", () => {
  const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#888" } }).jpeg().toBuffer();
  const row = (o: object = {}) => ({ id: "up1", workspaceId: "w1", brandId: "b1", key: "w1/b1/uploads/a.jpg", kind: "photo", bytes: 0, ...o });

  it("reads the file once and stores exactly those bytes as the usable copy", async () => {
    const good = new Uint8Array(await jpeg());
    const swapped = new Uint8Array([1, 2, 3, 4]);
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findFirst.mockResolvedValue(row({ bytes: good.length }));
    m.get.mockResolvedValueOnce(good).mockResolvedValue(swapped);
    const r = await verifyUpload(scope, "up1");
    expect(r).toMatchObject({ status: "VERIFIED" });
    expect(r).not.toHaveProperty("width"); // a photo's size is measured on the phone, after EXIF orientation
    expect(m.get).toHaveBeenCalledTimes(1);
    expect(m.put).toHaveBeenCalledTimes(1);
    expect(m.put.mock.calls[0][0]).toMatch(/^w1\/b1\/[0-9a-f-]+\.jpg$/);
    expect(m.put.mock.calls[0][1]).toBe(good);
    expect(m.put.mock.calls[0][2]).toBe("image/jpeg");
    expect(m.delMedia).toHaveBeenCalledWith("w1/b1/uploads/a.jpg");
    expect(m.update.mock.calls[0][0].data).toMatchObject({ status: "VERIFIED", width: 64, height: 48 });
    expect(m.updateMany.mock.calls[0][0]).toEqual({ where: { id: "up1", workspaceId: "w1", brandId: "b1", status: "PENDING" }, data: { status: "REJECTED", reason: "checking" } });
  });

  it("rejects an object bigger than announced, and stores a PNG disguised as .jpg under .png", async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findFirst.mockResolvedValue(row({ bytes: 10 }));
    m.get.mockRejectedValueOnce(new MediaTooLarge());
    expect(await verifyUpload(scope, "up1")).toMatchObject({ status: "REJECTED", code: "story.uploadSize" });
    expect(m.get).toHaveBeenCalledWith("w1/b1/uploads/a.jpg", 10);
    const png = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer());
    m.findFirst.mockResolvedValue(row({ bytes: png.length }));
    m.get.mockResolvedValueOnce(png);
    expect(await verifyUpload(scope, "up1")).toMatchObject({ status: "VERIFIED" });
    expect(m.put.mock.calls[0][0]).toMatch(/\.png$/);
    expect(m.put.mock.calls[0][2]).toBe("image/png");
  });

  it("removes the usable copy if the row update fails after it was written", async () => {
    const good = new Uint8Array(await jpeg());
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findFirst.mockResolvedValue(row({ bytes: good.length }));
    m.get.mockResolvedValue(good);
    m.update.mockRejectedValueOnce(new Error("db down")).mockResolvedValue({});
    expect(await verifyUpload(scope, "up1")).toMatchObject({ status: "REJECTED" });
    expect(m.delMedia).toHaveBeenCalledWith(m.put.mock.calls[0][0]);
  });

  it("answers 409 when the row was already claimed, 404 when it isn't this brand's", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    m.findFirst.mockResolvedValueOnce({ id: "up1" });
    await expect(verifyUpload(scope, "up1")).rejects.toMatchObject({ status: 409, code: "story.uploadState" });
    m.findFirst.mockResolvedValueOnce(null);
    await expect(verifyUpload(scope, "other")).rejects.toMatchObject({ status: 404 });
    expect(m.get).not.toHaveBeenCalled();
  });

  it("lets only one of two concurrent checks through", async () => {
    let claimed = false;
    m.updateMany.mockImplementation(async () => (claimed ? { count: 0 } : ((claimed = true), { count: 1 })));
    m.findFirst.mockResolvedValue(row({ bytes: 3 }));
    m.get.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const results = await Promise.allSettled([verifyUpload(scope, "up1"), verifyUpload(scope, "up1")]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ status: 409, code: "story.uploadState" });
  });

  it("rejects a size mismatch and a non-image, deleting the upload", async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findFirst.mockResolvedValue(row({ bytes: 10 }));
    m.get.mockResolvedValue(new Uint8Array(5));
    expect(await verifyUpload(scope, "up1")).toMatchObject({ status: "REJECTED", code: "story.uploadSize" });
    m.findFirst.mockResolvedValue(row({ bytes: 5 }));
    expect(await verifyUpload(scope, "up1")).toMatchObject({ status: "REJECTED", code: "story.type" });
    expect(m.put).not.toHaveBeenCalled();
    expect(m.delMedia).toHaveBeenCalledTimes(2);
    expect(m.update.mock.calls.at(-1)?.[0].data).toMatchObject({ status: "REJECTED" });
  });

  it("probes a clip and rejects one that breaks a limit", async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findFirst.mockResolvedValue(row({ kind: "video", key: "w1/b1/uploads/a.mp4", bytes: 4 }));
    m.get.mockResolvedValue(new Uint8Array(4));
    m.probe.mockResolvedValue({ durationSec: 200, width: 1080, height: 1920, fps: 30, videoStreams: 1, audioStreams: 1 });
    expect(await verifyUpload(scope, "up1")).toMatchObject({ status: "REJECTED" });
    m.probe.mockResolvedValue({ durationSec: 12, width: 1080, height: 1920, fps: 30, videoStreams: 1, audioStreams: 0 });
    expect(await verifyUpload(scope, "up1")).toMatchObject({ status: "VERIFIED", durationSec: 12, width: 1080, height: 1920 });
    expect(m.put.mock.calls[0][0]).toMatch(/\.mp4$/);
    expect(m.update.mock.calls.at(-1)?.[0].data).toMatchObject({ hasAudio: false, durationSec: 12 });
  });
});

describe("purging stale uploads", () => {
  const now = Date.parse("2026-11-20T00:00:00Z");
  it("deletes old unfinished and unused verified uploads, keeps a verified file a version mentions", async () => {
    m.findMany
      .mockResolvedValueOnce([{ id: "r1", key: "k/uploads/r1.jpg" }]) // PENDING/REJECTED
      .mockResolvedValueOnce([]) // its next page
      .mockResolvedValueOnce([
        { id: "v1", brandId: "b1", key: "w1/b1/used_1.jpg" },
        { id: "v2", brandId: "b1", key: "w1/b1/unused.jpg" },
      ])
      .mockResolvedValueOnce([]);
    m.raw.mockResolvedValueOnce([{ x: 1 }]).mockResolvedValueOnce([]);
    expect(await purgeStaleUploads(now)).toBe(2);
    expect(m.delMedia.mock.calls.map((c) => c[0]).sort()).toEqual(["k/uploads/r1.jpg", "w1/b1/unused.jpg"]);
    expect(m.del.mock.calls.map((c) => c[0].where.id).sort()).toEqual(["r1", "v2"]);
    expect((m.findMany.mock.calls[0][0].where.createdAt.lt as Date).getTime()).toBe(now - 7 * 86_400_000);
    expect(m.findMany.mock.calls[2][0].where).toMatchObject({ status: "VERIFIED", productId: null });
    // the key goes in as a parameter, with LIKE wildcards escaped
    expect(m.raw.mock.calls[0].slice(1)).toContain("%w1/b1/used\\_1.jpg%");
  });
});
