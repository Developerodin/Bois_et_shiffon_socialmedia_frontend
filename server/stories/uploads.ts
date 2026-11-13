import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/server/db/prisma";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { PublishingError } from "@/server/services/publishing";
import { deleteMedia, getMediaBytes, imageType, MediaTooLarge, mediaKey, presignedPut, putMedia, signedMediaUrl } from "@/server/storage/media";
import { probeVideo, videoProblem } from "@/server/stories/probe";

type Scope = { workspaceId: string; brandId: string; userId: string };
type Kind = "photo" | "video";

const MB = 1024 * 1024;
const MAX_BYTES: Record<Kind, number> = { photo: 15 * MB, video: 100 * MB };
const TYPES: Record<string, { kind: Kind; ext: string }> = {
  "image/jpeg": { kind: "photo", ext: "jpg" },
  "image/png": { kind: "photo", ext: "png" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
};
const PUT_SECONDS = 600;
const SLOTS_PER_HOUR = 20;
const STALE_DAYS = 7;

/**
 * A single-use place for the phone to PUT one file. The size and type are signed into the URL; nothing is trusted
 * until verifyUpload has read the bytes.
 */
export async function createUploadSlot(
  scope: Scope,
  input: { kind: Kind; contentType: string; bytes: number; rightsConfirmed: true },
): Promise<{ uploadId: string; url: string; headers: Record<string, string> }> {
  const { workspaceId, brandId, userId } = scope;
  if (input.rightsConfirmed !== true) throw new PublishingError("Confirm you have the rights to use this file.", 400, "story.rights");
  const type = TYPES[input.contentType];
  if (!type || type.kind !== input.kind) throw new PublishingError("Photos can be JPG or PNG, clips MP4 or MOV.", 400, "story.type");
  if (!Number.isInteger(input.bytes) || input.bytes <= 0) throw new PublishingError("The file is empty.", 400, "story.type");
  if (input.bytes > MAX_BYTES[input.kind]) throw new PublishingError(`That file is too large (up to ${MAX_BYTES[input.kind] / MB} MB).`, 413, "story.tooLarge");
  if (!(await hitRateLimit(`story-upload:${brandId}`, SLOTS_PER_HOUR, 3_600_000)).allowed) {
    throw new PublishingError("Too many uploads this hour. Try again later.", 429, "story.uploadLimit");
  }
  const file = `${randomUUID()}.${type.ext}`;
  // mediaKey validates the tenant segments and the name; the uploads/ folder keeps unchecked files apart.
  const key = mediaKey(scope, file).replace(/[^/]+$/, `uploads/${file}`);
  const url = await presignedPut(key, input.contentType, input.bytes, PUT_SECONDS);
  const row = await prisma.mediaUpload.create({
    data: { workspaceId, brandId, key, kind: input.kind, status: "PENDING", bytes: input.bytes, rightsConfirmedBy: userId, rightsConfirmedAt: new Date(), createdBy: userId },
  });
  return { uploadId: row.id, url, headers: { "Content-Type": input.contentType } };
}

type Rejected = { status: "REJECTED"; reason: string; code: string };
/** A clip's upright size (probe.ts turns quarter-rotated streams) comes back so the phone crops the shape the renderer cuts. */
type Verified = { status: "VERIFIED"; durationSec?: number; width?: number; height?: number; previewUrl: string };
type Checked = { contentType: string; ext: string; width?: number; height?: number; durationSec?: number; hasAudio?: boolean };
class Reject extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/**
 * Check what the phone actually uploaded. Order matters: claim the row (so a second "done" can't run), read the
 * object ONCE, check those bytes, and store those same bytes under the usable key, so swapping the object after
 * the read changes nothing. The upload key is deleted either way.
 */
export async function verifyUpload(scope: Scope, uploadId: string): Promise<Verified | Rejected> {
  const { workspaceId, brandId } = scope;
  const claimed = await prisma.mediaUpload.updateMany({
    where: { id: uploadId, workspaceId, brandId, status: "PENDING" },
    data: { status: "REJECTED", reason: "checking" },
  });
  if (claimed.count !== 1) {
    const exists = await prisma.mediaUpload.findFirst({ where: { id: uploadId, workspaceId, brandId }, select: { id: true } });
    if (!exists) throw new PublishingError("Upload not found.", 404, "story.upload");
    throw new PublishingError("That upload was already used.", 409, "story.uploadState");
  }
  const row = await prisma.mediaUpload.findFirst({ where: { id: uploadId, workspaceId, brandId } });
  if (!row) throw new PublishingError("Upload not found.", 404, "story.upload");
  let finalKey: string | undefined;
  try {
    const bytes = await getMediaBytes(row.key, row.bytes).catch((e) => {
      if (e instanceof MediaTooLarge) throw new Reject("The file is bigger than announced.", "story.uploadSize");
      throw e;
    });
    if (bytes.length !== row.bytes) throw new Reject("The file isn't the size that was announced.", "story.uploadSize");
    const meta = row.kind === "video" ? await checkVideo(bytes, row.key.split(".").pop()!) : await checkPhoto(bytes);
    finalKey = mediaKey(scope, `${randomUUID()}.${meta.ext}`);
    await putMedia(finalKey, bytes, meta.contentType);
    await deleteMedia(row.key).catch(() => {});
    await prisma.mediaUpload.update({
      where: { id: row.id },
      data: { status: "VERIFIED", key: finalKey, reason: null, width: meta.width ?? null, height: meta.height ?? null, durationSec: meta.durationSec ?? null, hasAudio: meta.hasAudio ?? null },
    });
    // Photos leave it out: sharp's metadata is before EXIF orientation, and the phone measures the decoded photo itself.
    const size = row.kind === "video" && meta.width && meta.height ? { width: meta.width, height: meta.height } : {};
    return { status: "VERIFIED", ...(meta.durationSec === undefined ? {} : { durationSec: meta.durationSec }), ...size, previewUrl: await signedMediaUrl(finalKey) };
  } catch (e) {
    const reject = e instanceof Reject ? e : new Reject("That file couldn't be checked.", "story.uploadCheck");
    await deleteMedia(row.key).catch(() => {});
    if (finalKey) await deleteMedia(finalKey).catch(() => {}); // written but the row update failed: no orphan
    await prisma.mediaUpload.update({ where: { id: row.id }, data: { status: "REJECTED", reason: reject.message } });
    return { status: "REJECTED", reason: reject.message, code: reject.code };
  }
}

async function checkPhoto(bytes: Uint8Array): Promise<Checked> {
  const type = imageType(bytes);
  if (!type) throw new Reject("Photos must be JPG or PNG.", "story.type");
  const m = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .metadata()
    .catch(() => {
      throw new Reject("That photo couldn't be read.", "story.type");
    });
  return { contentType: type.type, ext: type.ext, width: m.width, height: m.height };
}

async function checkVideo(bytes: Uint8Array, ext: string): Promise<Checked> {
  const dir = await mkdtemp(path.join(tmpdir(), "story-up-"));
  try {
    const file = path.join(dir, `clip.${ext}`);
    await writeFile(file, bytes);
    const meta = await probeVideo(file).catch(() => {
      throw new Reject("That clip couldn't be read.", "story.videoUnreadable");
    });
    const problem = videoProblem(meta);
    if (problem) throw new Reject(problem.message, problem.code);
    return {
      ext,
      contentType: ext === "mov" ? "video/quicktime" : "video/mp4",
      width: meta.width,
      height: meta.height,
      durationSec: meta.durationSec,
      hasAudio: meta.audioStreams > 0,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Daily: unfinished or rejected uploads, and verified files nothing uses (no product, no story version naming them),
 * after 7 days. Files go first; a failed delete leaves an orphaned file, never a dangling row.
 * ponytail: the "used" check scans the brand's version bodies per candidate; fine at today's volume.
 */
export async function purgeStaleUploads(now = Date.now()) {
  const before = new Date(now - STALE_DAYS * 86_400_000);
  let removed = 0;
  const drop = async (r: { id: string; key: string }) => {
    await deleteMedia(r.key).catch(() => {});
    await prisma.mediaUpload.delete({ where: { id: r.id } });
    removed++;
  };
  for (let after: string | undefined; ; ) {
    const rows = await prisma.mediaUpload.findMany({
      where: { status: { in: ["PENDING", "REJECTED"] }, createdAt: { lt: before }, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" },
      take: 500,
    });
    if (!rows.length) break;
    after = rows[rows.length - 1].id;
    for (const r of rows) await drop(r);
  }
  for (let after: string | undefined; ; ) {
    const rows = await prisma.mediaUpload.findMany({
      where: { status: "VERIFIED", productId: null, createdAt: { lt: before }, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" },
      take: 500,
    });
    if (!rows.length) break;
    after = rows[rows.length - 1].id;
    for (const r of rows) {
      const like = `%${likeEscape(r.key)}%`;
      const used = await prisma.$queryRaw<unknown[]>`
        SELECT 1 FROM "ContentVersion" v JOIN "ContentItem" i ON i.id = v."contentItemId"
        WHERE i."brandId" = ${r.brandId} AND v.body::text LIKE ${like} ESCAPE '\\' LIMIT 1`;
      if (used.length) continue;
      await drop(r);
    }
  }
  return removed;
}
