import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import middleware, { config, hasSessionCookie } from "@/middleware";

describe("hasSessionCookie", () => {
  it.each(["authjs.session-token", "__Secure-authjs.session-token", "authjs.session-token.0", "__Secure-authjs.session-token.0"])("accepts %s", (name) => {
    expect(hasSessionCookie([{ name }])).toBe(true);
  });
  it("rejects other cookies", () => {
    expect(hasSessionCookie([{ name: "bp_active_workspace_id" }])).toBe(false);
    expect(hasSessionCookie([])).toBe(false);
  });
});

describe("middleware", () => {
  const req = (path: string, cookie?: string) => new NextRequest(`http://localhost:3100${path}`, { headers: cookie ? { cookie } : {} });

  it("sends a page without a session cookie to sign in, keeping where it was going", () => {
    const res = middleware(req("/agents?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3100/login?next=%2Fagents%3Fx%3D1");
  });

  it("lets the sign-in pages through without a cookie", () => {
    for (const path of ["/login", "/invite/abc", "/forgot-password", "/reset-password?token=t"]) {
      expect(middleware(req(path)).headers.get("location"), path).toBeNull();
    }
  });

  it("passes a page with a session cookie on, with x-pathname for the 401 redirect", () => {
    const res = middleware(req("/agents?x=1", "authjs.session-token=abc"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/agents?x=1");
  });
});

describe("matcher", () => {
  const runs = (path: string) => unstable_doesMiddlewareMatch({ config, url: path });
  it("skips the Server's /api and the health check, and only that exact path", () => {
    expect(runs("/api/v1/me")).toBe(false);
    expect(runs("/healthz")).toBe(false);
    expect(runs("/healthzz")).toBe(true);
    expect(runs("/healthz/x")).toBe(true);
    expect(runs("/agents")).toBe(true);
  });
});
