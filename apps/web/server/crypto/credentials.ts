import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for connector tokens (DEC-002/018):
 * `v1:<keyVersion>:<iv_b64>:<tag_b64>:<ciphertext_b64>`.
 * Key for version N: CREDENTIALS_ENCRYPTION_KEY_<N>, else CREDENTIALS_ENCRYPTION_KEY
 * (32 bytes, base64). Rotation = add the new versioned key, bump CREDENTIALS_KEY_VERSION.
 */
export const currentKeyVersion = () => Number(process.env.CREDENTIALS_KEY_VERSION ?? 1);

function key(version: number) {
  const raw = process.env[`CREDENTIALS_ENCRYPTION_KEY_${version}`] ?? process.env.CREDENTIALS_ENCRYPTION_KEY;
  const buf = Buffer.from(raw ?? "", "base64");
  if (buf.length !== 32) throw new Error(`Credential key v${version} missing or not 32 bytes (base64)`);
  return buf;
}

export function encryptCredentials(data: unknown, version = currentKeyVersion()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(version), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return `v1:${version}:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function decryptCredentials<T>(envelope: string): T {
  const [format, version, iv, tag, ct] = envelope.split(":");
  if (format !== "v1" || !ct) throw new Error("Unknown credential envelope");
  const decipher = createDecipheriv("aes-256-gcm", key(Number(version)), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}
