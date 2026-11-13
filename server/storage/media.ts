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
