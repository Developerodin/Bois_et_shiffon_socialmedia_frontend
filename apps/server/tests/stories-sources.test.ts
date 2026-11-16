import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  upload: vi.fn(), uploadCreate: vi.fn(), uploads: vi.fn(), profile: vi.fn(), version: vi.fn(), versions: vi.fn(), shoot: vi.fn(), shoots: vi.fn(),
  render: vi.fn(), renders: vi.fn(), product: vi.fn(), products: vi.fn(), user: vi.fn(), fetch: vi.fn(), put: vi.fn(), authorize: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    mediaUpload: { findFirst: m.upload, create: m.uploadCreate, findMany: m.uploads },
    brandProfile: { findFirst: m.profile },
    contentVersion: { findFirst: m.version, findMany: m.versions },
    photoShoot: { findFirst: m.shoot, findMany: m.shoots },
    reelRender: { findFirst: m.render, findMany: m.renders },
    product: { findFirst: m.product, findMany: m.products },
    user: { findUnique: m.user },
  },
}));
vi.mock("@/server/research/crawl", () => ({ safeFetchBytes: m.fetch }));
vi.mock("@/server/storage/media", async (orig) => ({
  ...(await orig<typeof import("@/server/storage/media")>()),
  putMedia: m.put,
  signedMediaUrl: async (k: string) => `https://signed/${k}`,
}));
vi.mock("@/server/api/brand-route", () => ({ authorizeBrandRoute: m.authorize }));

import { listStorySources, resolveSource } from "@/server/stories/sources";
import { GET } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/stories/sources/route";

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const other = { ...scope, brandId: "b2" };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
// A fake that only knows brand b1: any lookup scoped to another brand finds nothing.
const mine = (row: unknown) => async (a: { where: { brandId?: string; item?: { brandId: string } } }) => ((a.where.brandId ?? a.where.item?.brandId) === "b1" ? row : null);

beforeEach(() => {
  vi.resetAllMocks();
  m.upload.mockImplementation(mine({ key: "w1/b1/a.jpg", kind: "photo", durationSec: null, rightsConfirmedBy: null, rightsConfirmedAt: null }));
  m.profile.mockImplementation(mine({ uploads: [{ key: "w1/b1/lib.jpg", title: "Lib" }] }));
  m.version.mockImplementation(mine({ id: "v1", body: { presenter: "p1", photoKeys: [] } }));
  m.shoot.mockImplementation(mine({ id: "s1" }));
  m.render.mockImplementation(mine({ contentVersionId: "v1" }));
  m.product.mockImplementation(mine({ id: "p1", imageUrl: "https://shop.test/p.jpg" }));
  m.put.mockResolvedValue(undefined);
  m.uploads.mockResolvedValue([]); m.shoots.mockResolvedValue([]); m.renders.mockResolvedValue([]); m.versions.mockResolvedValue([]); m.products.mockResolvedValue([]);
});

const kinds = [
  ["upload", "u-id", "w1/b1/a.jpg"],
  ["library", "w1/b1/lib.jpg", "w1/b1/lib.jpg"],
  ["post", "w1/b1/post.jpg", "w1/b1/post.jpg"],
  ["photoshoot", "w1/b1/shot.jpg", "w1/b1/shot.jpg"],
  ["reel", "w1/b1/reel.mp4", "w1/b1/reel.mp4"],
] as const;

describe("resolveSource", () => {
  it.each(kinds)("resolves a %s of the brand", async (kind, id, key) => {
    const r = await resolveSource(scope, { kind, id });
    expect(r.mediaKey).toBe(key);
    expect(r.mediaKind).toBe(kind === "reel" ? "video" : "photo");
    expect(r.rights).toEqual({ kind: "owned" });
  });

  it.each([...kinds.map(([k, id]) => [k, id] as const), ["product", "p1"] as const])("refuses a %s of another brand", async (kind, id) => {
    await expect(resolveSource(other, { kind, id })).rejects.toMatchObject({ code: "story.source", status: 400 });
    expect(m.fetch).not.toHaveBeenCalled();
  });

  it("flags a reel whose rendered version had a presenter even when the latest plan has none", async () => {
    m.version.mockImplementation(async (a: { where: { id?: string } }) => (a.where.id === "v1" ? { body: { presenter: "anna" } } : { body: { presenter: "none" } }));
    expect((await resolveSource(scope, { kind: "reel", id: "k" })).aiMark).toBe(true);
    expect(m.version.mock.calls[0][0].where.id).toBe("v1");
  });

  it("does not flag a reel without a presenter or cloned voice", async () => {
    m.version.mockImplementation(mine({ body: { presenter: "none", voice: "v" } }));
    expect((await resolveSource(scope, { kind: "reel", id: "k" })).aiMark).toBe(false);
  });

  it("refuses a pending upload", async () => {
    m.upload.mockResolvedValue(null); // the lookup asks for VERIFIED only
    await expect(resolveSource(scope, { kind: "upload", id: "x" })).rejects.toMatchObject({ code: "story.source" });
    expect(m.upload.mock.calls[0][0].where.status).toBe("VERIFIED");
  });

  it("names who confirmed the rights of an upload", async () => {
    m.upload.mockResolvedValue({ key: "k", kind: "video", durationSec: 12, rightsConfirmedBy: "u9", rightsConfirmedAt: new Date() });
    m.user.mockResolvedValue({ name: "Ann", email: "a@x.test" });
    expect(await resolveSource(scope, { kind: "upload", id: "x" })).toMatchObject({ mediaKind: "video", durationSec: 12, rights: { kind: "confirmed", by: "u9", name: "Ann" } });
  });

  it("refuses clips when only photos are allowed", async () => {
    await expect(resolveSource(scope, { kind: "reel", id: "k" }, { photosOnly: true })).rejects.toMatchObject({ code: "story.source" });
    m.upload.mockResolvedValue({ key: "k", kind: "video", durationSec: 5, rightsConfirmedBy: null, rightsConfirmedAt: null });
    await expect(resolveSource(scope, { kind: "upload", id: "x" }, { photosOnly: true })).rejects.toMatchObject({ code: "story.source" });
  });
});

describe("product photos", () => {
  const fetched = (over = {}) => ({ url: new URL("https://shop.test/p.jpg"), status: 200, bytes: JPEG, contentType: "image/jpeg", truncated: false, ...over });

  it("fetches once, stores it verified with the product, and reuses it", async () => {
    let stored: { key: string } | null = null;
    m.upload.mockImplementation(async () => stored);
    m.uploadCreate.mockImplementation(async (a: { data: { key: string } }) => { stored = a.data; });
    m.fetch.mockResolvedValue(fetched());
    const first = await resolveSource(scope, { kind: "product", id: "p1" });
    const second = await resolveSource(scope, { kind: "product", id: "p1" });
    expect(m.fetch).toHaveBeenCalledTimes(1);
    expect(m.fetch.mock.calls[0].slice(1)).toEqual(["image/jpeg,image/png", 15 * 1024 * 1024]);
    expect(m.uploadCreate.mock.calls[0][0].data).toMatchObject({ status: "VERIFIED", productId: "p1", brandId: "b1", workspaceId: "w1", kind: "photo" });
    expect(first.mediaKey).toBe(second.mediaKey);
    expect(first.rights).toEqual({ kind: "owned" });
  });

  it.each([
    ["SVG bytes", fetched({ bytes: new TextEncoder().encode("<svg></svg>") })],
    ["a 404", fetched({ status: 404 })],
    ["a truncated body", fetched({ truncated: true })],
  ])("stores nothing when the URL answers %s", async (_n, res) => {
    m.upload.mockResolvedValue(null);
    m.fetch.mockResolvedValue(res);
    await expect(resolveSource(scope, { kind: "product", id: "p1" })).rejects.toMatchObject({ code: "story.source" });
    expect(m.put).not.toHaveBeenCalled();
    expect(m.uploadCreate).not.toHaveBeenCalled();
  });

  it("refuses when the fetch itself fails", async () => {
    m.upload.mockResolvedValue(null);
    m.fetch.mockRejectedValue(new Error("Private or local addresses are not allowed"));
    await expect(resolveSource(scope, { kind: "product", id: "p1" })).rejects.toMatchObject({ code: "story.source" });
  });
});

describe("listStorySources", () => {
  it("lists product photos and the library, with no clips for photosOnly", async () => {
    m.products.mockResolvedValue([{ id: "p1", title: "Mug", imageUrl: "https://shop.test/p.jpg" }]);
    const photo = { id: "up1", key: "k1", kind: "photo", durationSec: null, width: 4000, height: 3000 };
    m.uploads.mockResolvedValueOnce([photo, { id: "up2", key: "k2", kind: "video", durationSec: 30, width: 1080, height: 1920 }]).mockResolvedValue([photo]);
    m.shoots.mockResolvedValue([{ outputKeys: ["s1.jpg"] }]);
    m.renders.mockResolvedValue([{ videoKey: "r.mp4", contentVersionId: "v1" }]);
    m.versions.mockResolvedValue([{ id: "v1", body: { title: "Spring" } }]);
    const all = await listStorySources(scope, { productIds: ["p1"] });
    expect(all.map((t) => t.tab)).toEqual(["products", "library"]);
    expect(all[0].items).toEqual([{ ref: { kind: "product", id: "p1" }, title: "Mug", kind: "photo", previewUrl: "https://shop.test/p.jpg" }]);
    expect(all[1].items.map((i) => i.ref.kind)).toEqual(["upload", "upload", "library", "photoshoot", "reel"]);
    expect(all[1].items[0]).not.toHaveProperty("width");
    expect(all[1].items[1]).toMatchObject({ kind: "video", durationSec: 30, width: 1080, height: 1920 });
    expect(all[1].items.at(-1)).toMatchObject({ title: "Spring", kind: "video", previewUrl: "https://signed/r.mp4", width: 1080, height: 1920 });

    const photos = await listStorySources(scope, { productIds: [], photosOnly: true });
    expect(photos[1].items.some((i) => i.kind === "video")).toBe(false);
    expect(m.renders).toHaveBeenCalledTimes(1);
  });
});

describe("GET /stories/sources", () => {
  const ctx = { params: Promise.resolve({ workspaceId: "w1", brandId: "b1" }) };
  it("returns 403 without content.create", async () => {
    const { AccessDeniedError } = await import("@/server/auth/errors");
    m.authorize.mockRejectedValue(new AccessDeniedError());
    const res = await GET(new Request("http://x/?productIds=p1"), ctx);
    expect(res.status).toBe(403);
    expect(m.authorize.mock.calls[0][2]).toBe("content.create");
  });

  it("returns the tabs", async () => {
    m.authorize.mockResolvedValue(scope);
    const res = await GET(new Request("http://x/?productIds=p1,p2"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).tabs.map((t: { tab: string }) => t.tab)).toEqual(["products", "library"]);
  });
});
