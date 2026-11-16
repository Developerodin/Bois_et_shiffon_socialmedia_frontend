import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptCredentials, encryptCredentials } from "@/server/crypto/credentials";

describe("credential envelope (DEC-018)", () => {
  beforeAll(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.CREDENTIALS_ENCRYPTION_KEY_2 = randomBytes(32).toString("base64");
  });

  it("round-trips and never contains the plaintext", () => {
    const env = encryptCredentials({ accessToken: "secret-token" }, 1);
    expect(env.startsWith("v1:1:")).toBe(true);
    expect(env).not.toContain("secret-token");
    expect(decryptCredentials(env)).toEqual({ accessToken: "secret-token" });
  });

  it("rejects tampering", () => {
    const parts = encryptCredentials({ a: 1 }, 1).split(":");
    parts[4] = Buffer.from("tampered").toString("base64");
    expect(() => decryptCredentials(parts.join(":"))).toThrow();
  });

  it("decrypts old rows after rotating to a new key version", () => {
    const old = encryptCredentials({ v: "old" }, 1);
    const fresh = encryptCredentials({ v: "new" }, 2);
    expect(fresh.startsWith("v1:2:")).toBe(true);
    expect(decryptCredentials(old)).toEqual({ v: "old" });
    expect(decryptCredentials(fresh)).toEqual({ v: "new" });
  });
});
