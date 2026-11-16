import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { needsAiDisclosure } from "@/server/reels/plan";
import { safeFetchBytes } from "@/server/research/crawl";
import { PublishingError } from "@/server/services/publishing";
import { imageType, mediaKey, putMedia, signedMediaUrl } from "@/server/storage/media";
import { REEL_SIZE, type SourceRef, type StoryFrame } from "@/server/stories/body";

type Resolved = { mediaKey: string; mediaKind: "photo" | "video"; aiMark: boolean; rights: NonNullable<StoryFrame["rights"]>; durationSec?: number };
type Scope = { workspaceId: string; brandId: string; userId: string };
type Item = { ref: SourceRef; title: string; kind: "photo" | "video"; previewUrl: string; durationSec?: number; width?: number; height?: number };

const PRODUCT_IMAGE_MAX = 15 * 1024 * 1024;
const LIST_MAX = 60;
const refused = () => new PublishingError("That photo or clip isn't available to this brand.", 400, "story.source");
const owned = (key: string, mediaKind: "photo" | "video" = "photo", aiMark = false, durationSec?: number): Resolved =>
  ({ mediaKey: key, mediaKind, aiMark, rights: { kind: "owned" }, ...(durationSec === undefined ? {} : { durationSec }) });

/**
 * Turn a picker reference into the stored file a frame will use. Every lookup is scoped to the brand, so another
 * brand's id (or a made-up one) is refused the same way as a missing one.
 */
export async function resolveSource(scope: Scope, ref: SourceRef, opts: { photosOnly?: boolean } = {}): Promise<Resolved> {
  const r = await resolveKind(scope, ref);
  if (opts.photosOnly && r.mediaKind !== "photo") throw refused();
  return r;
}

async function resolveKind(scope: Scope, ref: SourceRef): Promise<Resolved> {
  const { workspaceId, brandId } = scope;
  switch (ref.kind) {
    case "upload": {
      const u = await prisma.mediaUpload.findFirst({ where: { id: ref.id, workspaceId, brandId, status: "VERIFIED" } });
      if (!u) throw refused();
      return uploadResolved(u);
    }
    case "library": {
      const p = await prisma.brandProfile.findFirst({ where: { brandId, workspaceId }, select: { uploads: true } });
      const hit = Array.isArray(p?.uploads) && (p.uploads as { key?: string }[]).some((e) => e?.key === ref.id);
      if (!hit) throw refused();
      return owned(ref.id);
    }
    case "post": {
      const v = await prisma.contentVersion.findFirst({ where: { item: { workspaceId, brandId }, body: { path: ["photoKeys"], array_contains: ref.id } }, select: { id: true } });
      if (!v) throw refused();
      return owned(ref.id);
    }
    case "photoshoot": {
      const s = await prisma.photoShoot.findFirst({ where: { workspaceId, brandId, status: "DONE", outputKeys: { has: ref.id } }, select: { id: true } });
      if (!s) throw refused();
      return owned(ref.id);
    }
    case "reel": {
      const render = await prisma.reelRender.findFirst({ where: { workspaceId, brandId, step: "DONE", videoKey: ref.id }, select: { contentVersionId: true } });
      if (!render) throw refused();
      // The plan that was rendered, not the item's latest: a later edit can't change what the video shows.
      const version = await prisma.contentVersion.findFirst({ where: { id: render.contentVersionId, item: { workspaceId, brandId } }, select: { body: true } });
      if (!version) throw refused();
      return owned(ref.id, "video", needsAiDisclosure((version.body ?? {}) as { presenter?: string; voice?: string }));
    }
    case "product": {
      const product = await prisma.product.findFirst({ where: { id: ref.id, workspaceId, brandId }, select: { id: true, imageUrl: true } });
      if (!product) throw refused();
      return productPhoto(scope, product);
    }
  }
}

type UploadRow = { key: string; kind: string; durationSec: number | null; rightsConfirmedBy: string | null; rightsConfirmedAt: Date | null };

async function uploadResolved(u: UploadRow): Promise<Resolved> {
  const mediaKind = u.kind === "video" ? "video" : "photo";
  const base = owned(u.key, mediaKind, false, u.durationSec ?? undefined);
  if (!u.rightsConfirmedAt || !u.rightsConfirmedBy) return base;
  const user = await prisma.user.findUnique({ where: { id: u.rightsConfirmedBy }, select: { name: true, email: true } });
  return { ...base, rights: { kind: "confirmed", by: u.rightsConfirmedBy, name: user?.name ?? user?.email ?? "" } };
}

/**
 * A catalogue photo is fetched once and kept as a verified upload tied to the product, so later frames reuse it.
 * ponytail: two requests racing fetch twice; the unique (brand, product) row keeps one and the other's object is
 * left in the bucket for the upload sweep.
 */
async function productPhoto(scope: Scope, product: { id: string; imageUrl: string | null }): Promise<Resolved> {
  const { workspaceId, brandId, userId } = scope;
  const existing = () => prisma.mediaUpload.findFirst({ where: { workspaceId, brandId, productId: product.id, status: "VERIFIED" } });
  const have = await existing();
  if (have) return owned(have.key);
  if (!product.imageUrl) throw refused();
  const res = await safeFetchBytes(product.imageUrl, "image/jpeg,image/png", PRODUCT_IMAGE_MAX).catch(() => null);
  if (!res || res.status < 200 || res.status > 299 || res.truncated) throw refused();
  const type = imageType(res.bytes);
  if (!type) throw refused();
  const key = mediaKey({ workspaceId, brandId }, `${randomUUID()}.${type.ext}`);
  await putMedia(key, res.bytes, type.type);
  try {
    await prisma.mediaUpload.create({ data: { workspaceId, brandId, key, kind: "photo", status: "VERIFIED", bytes: res.bytes.byteLength, productId: product.id, createdBy: userId } });
  } catch (e) {
    const winner = await existing();
    if (!winner) throw e;
    return owned(winner.key);
  }
  return owned(key);
}

/** What the picker shows: the chosen products' photos, and the brand's library (uploads, photo library, shoots, reels). */
export async function listStorySources(scope: Scope, opts: { productIds: string[]; photosOnly?: boolean }): Promise<{ tab: "products" | "library"; items: Item[] }[]> {
  const { workspaceId, brandId } = scope;

  const products = opts.productIds.length
    ? await prisma.product.findMany({ where: { id: { in: opts.productIds }, workspaceId, brandId, imageUrl: { not: null } }, select: { id: true, title: true, imageUrl: true } })
    : [];
  const productItems: Item[] = products.map((p) => ({ ref: { kind: "product", id: p.id }, title: p.title, kind: "photo", previewUrl: p.imageUrl! }));

  const [uploads, profile, shoots, reels] = await Promise.all([
    prisma.mediaUpload.findMany({
      where: { workspaceId, brandId, status: "VERIFIED", productId: null, ...(opts.photosOnly ? { kind: "photo" } : {}) },
      orderBy: { createdAt: "desc" }, take: LIST_MAX, select: { id: true, key: true, kind: true, durationSec: true, width: true, height: true },
    }),
    prisma.brandProfile.findFirst({ where: { brandId, workspaceId }, select: { uploads: true } }),
    prisma.photoShoot.findMany({ where: { workspaceId, brandId, status: "DONE" }, orderBy: { createdAt: "desc" }, take: 10, select: { outputKeys: true } }),
    opts.photosOnly ? [] : prisma.reelRender.findMany({ where: { workspaceId, brandId, step: "DONE", videoKey: { not: null } }, orderBy: { createdAt: "desc" }, take: 10, select: { videoKey: true, contentVersionId: true } }),
  ]);
  const versions = reels.length
    ? await prisma.contentVersion.findMany({ where: { id: { in: reels.map((r) => r.contentVersionId) }, item: { workspaceId, brandId } }, select: { id: true, body: true } })
    : [];
  const reelTitle = (id: string) => (versions.find((v) => v.id === id)?.body as { title?: string } | undefined)?.title || "Reel";

  const library: Item[] = [];
  // A clip's upright size, so the phone crops the shape the renderer cuts (photos: the phone measures the decoded photo).
  for (const u of uploads) {
    const video = u.kind === "video";
    library.push({
      ref: { kind: "upload", id: u.id }, title: video ? "Clip" : "Upload", kind: video ? "video" : "photo", previewUrl: await signedMediaUrl(u.key),
      ...(u.durationSec == null ? {} : { durationSec: u.durationSec }),
      ...(video && u.width && u.height ? { width: u.width, height: u.height } : {}),
    });
  }
  const entries = Array.isArray(profile?.uploads) ? (profile.uploads as { key?: string; title?: string }[]) : [];
  for (const e of entries) if (e?.key) library.push({ ref: { kind: "library", id: e.key }, title: e.title || "Photo", kind: "photo", previewUrl: await signedMediaUrl(e.key) });
  for (const s of shoots) for (const key of s.outputKeys) library.push({ ref: { kind: "photoshoot", id: key }, title: "Photoshoot", kind: "photo", previewUrl: await signedMediaUrl(key) });
  for (const r of reels) library.push({ ref: { kind: "reel", id: r.videoKey! }, title: reelTitle(r.contentVersionId), kind: "video", previewUrl: await signedMediaUrl(r.videoKey!), ...REEL_SIZE });

  return [{ tab: "products", items: productItems }, { tab: "library", items: library }];
}
