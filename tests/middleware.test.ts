import { describe, expect, it, vi } from "vitest";
vi.mock("next-auth", () => ({ default: () => ({ auth: vi.fn() }) }));
import { hasSessionCookie } from "@/middleware";

describe("hasSessionCookie", () => {
  it.each(["authjs.session-token", "__Secure-authjs.session-token", "authjs.session-token.0", "__Secure-authjs.session-token.0"])("accepts %s", (name) => {
    expect(hasSessionCookie([{ name }])).toBe(true);
  });
  it("rejects other cookies", () => {
    expect(hasSessionCookie([{ name: "bp_active_workspace_id" }])).toBe(false);
    expect(hasSessionCookie([])).toBe(false);
  });
});
