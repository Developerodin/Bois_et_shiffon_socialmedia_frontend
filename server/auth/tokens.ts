import { createHash, randomBytes } from "node:crypto";

/** Opaque single-use tokens: the raw value goes in the link, only the hash is stored. */
export function newToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export const appUrl = (path: string) =>
  new URL(path, process.env.AUTH_URL ?? "http://localhost:3100").toString();

export const MIN_PASSWORD_LENGTH = 12;
