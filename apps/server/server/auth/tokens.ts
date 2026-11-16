import { createHash, randomBytes } from "node:crypto";

/** Opaque single-use tokens: the raw value goes in the link, only the hash is stored. */
export function newToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function appUrl(path: string) {
  const base = process.env.AUTH_URL;
  // Links in emails and OAuth redirects must never point at localhost in production.
  if (!base && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("AUTH_URL is not set. Set it to this app's public URL, e.g. https://app.example.com");
  }
  return new URL(path, base ?? "http://localhost:3100").toString();
}

export const MIN_PASSWORD_LENGTH = 12;
