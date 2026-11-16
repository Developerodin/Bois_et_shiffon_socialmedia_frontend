import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { TenantScope } from "@/server/tenant/scope";

/**
 * Neon Object Storage (S3-compatible). Credentials, endpoint and region come
 * from the AWS_* env vars pulled by `neon deploy`. Bucket is private (neon.ts):
 * store the key in Postgres, hand out presigned URLs on read (DEC-013).
 */
export const MEDIA_BUCKET = "media";

// ponytail: one module-level client; Neon requires path-style addressing
const s3 = new S3Client({ forcePathStyle: true });
// Presigning only: with the default checksum behaviour the SDK adds x-amz-checksum parameters the phone can't satisfy.
const presigner = new S3Client({ forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED" });

const SEGMENT = /^[A-Za-z0-9_-]+$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Every object lives under workspace/brand so one brand can never address another's files. */
export function mediaKey(
  scope: Required<TenantScope>,
  fileName: string,
): string {
  if (!SEGMENT.test(scope.workspaceId) || !SEGMENT.test(scope.brandId)) {
    throw new Error("Invalid tenant scope for media key");
  }
  if (!FILE_NAME.test(fileName) || fileName.includes("..")) {
    throw new Error("Invalid media file name");
  }
  return `${scope.workspaceId}/${scope.brandId}/${fileName}`;
}

export async function putMedia(
  key: string,
  body: Uint8Array | string,
  contentType: string,
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Short-lived read URL, e.g. for Meta to fetch media at publish time. */
export function signedMediaUrl(key: string, expiresInSeconds = 3600) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

/**
 * A URL the phone can PUT one file to. The length and type are signed, so storage refuses any other size or type
 * (a signed header the client doesn't send, or sends differently, fails the signature).
 */
export function presignedPut(key: string, contentType: string, bytes: number, expiresInSeconds: number) {
  return getSignedUrl(
    presigner,
    new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: key, ContentType: contentType, ContentLength: bytes }),
    { expiresIn: expiresInSeconds, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

export class MediaTooLarge extends Error {}

/**
 * The object as bytes, never more than maxBytes: refused up front when storage reports a bigger length, and the
 * stream stops as soon as the running count passes it (so a lying length can't make us buffer a huge file).
 */
export async function getMediaBytes(key: string, maxBytes: number) {
  const r = await s3.send(new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }));
  const body = r.Body as (AsyncIterable<Uint8Array> & { destroy?: () => void }) | undefined;
  if (!body) throw new Error("Empty storage response");
  if ((r.ContentLength ?? 0) > maxBytes) {
    body.destroy?.();
    throw new MediaTooLarge();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.length;
    if (total > maxBytes) {
      body.destroy?.();
      throw new MediaTooLarge();
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export async function deleteMedia(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }));
}

/**
 * For files that only ever appear (generic previews, voice samples): a found key is remembered for the process's
 * life, so a screen polling every 10 s doesn't ask storage each time. A failed check counts as not there yet.
 */
const known = new Set<string>();
export async function mediaKnown(key: string) {
  if (known.has(key)) return true;
  if (!(await mediaExists(key).catch(() => false))) return false;
  known.add(key);
  return true;
}

/** Whether an object is stored (false on 404; other errors throw). */
export async function mediaExists(key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: MEDIA_BUCKET, Key: key }));
    return true;
  } catch (e) {
    if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

/** Detect the type from the file's first bytes, not its name or the browser's claim. */
export function imageType(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  return null;
}
