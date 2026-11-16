import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/auth/rate-limit";

const req = (h: Record<string, string>) => new Request("http://x", { headers: h });

describe("clientIp", () => {
  it("takes the entry our load balancer appended", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("single entry", () => expect(clientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9"));
  it("falls back to x-real-ip then unknown", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(req({}))).toBe("unknown");
  });
});
