import {
  DeleteObjectCommand,
  GetObjectCommand,
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
