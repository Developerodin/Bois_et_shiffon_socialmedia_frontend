import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import middleware, { config, contentSecurityPolicy, hasSessionCookie } from "@/middleware";

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

describe("framing and CSP headers", () => {
  const req = (path: string, cookie?: string) => new NextRequest(`http://localhost:3100${path}`, { headers: cookie ? { cookie } : {} });
  const page = () => middleware(req("/agents", "authjs.session-token=abc"));
  beforeEach(() => vi.stubEnv("STORAGE_ORIGIN", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("refuses framing and starts a report-only policy with a nonce on a page", () => {
    const res = page();
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    const policy = res.headers.get("content-security-policy-report-only");
    expect(policy).toContain("'nonce-");
    expect(policy).toContain("default-src 'self'");
  });

  it("hands Next the same policy on the request, report-only only, and uses a new nonce each time", () => {
    const res = page();
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBe(res.headers.get("content-security-policy-report-only"));
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBeNull();
    expect(page().headers.get("content-security-policy-report-only")).not.toBe(res.headers.get("content-security-policy-report-only"));
  });

  it("refuses framing on the sign-in redirect too", () => {
    const res = middleware(req("/agents"));
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
  });

  it("allows the storage origin for media and uploads, and leaves it out when unset", () => {
    vi.stubEnv("STORAGE_ORIGIN", "https://media.example");
    const policy = page().headers.get("content-security-policy-report-only")!;
    expect(policy).toContain("media-src 'self' blob: https://media.example;");
    expect(policy).toContain("connect-src 'self' https://media.example;");
    vi.stubEnv("STORAGE_ORIGIN", "");
    expect(contentSecurityPolicy("n")).not.toContain("undefined");
    expect(page().headers.get("content-security-policy-report-only")).not.toContain("undefined");
  });
});

describe("STORAGE_ORIGIN hygiene", () => {
  const req = new NextRequest("http://localhost:3100/agents", { headers: { cookie: "authjs.session-token=abc" } });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["https://a; script-src *", "https://a b", "https://a,https://b c", "javascript:alert(1)", "not a url"])("leaves out a malformed value %j", (value) => {
    vi.stubEnv("STORAGE_ORIGIN", value);
    const policy = middleware(req).headers.get("content-security-policy-report-only")!;
    expect(policy).toContain("connect-src 'self';");
    expect(policy.match(/script-src/g)).toHaveLength(1);
  });

  it("does not throw on a value with a newline and never puts one in the header", () => {
    vi.stubEnv("STORAGE_ORIGIN", "https://a" + String.fromCharCode(10) + "script-src *");
    const policy = middleware(req).headers.get("content-security-policy-report-only")!;
    expect(policy).not.toMatch(/[\r\n]/);
    expect(policy.match(/script-src/g)).toHaveLength(1);
  });

  it("reduces a value with a path to its origin", () => {
    vi.stubEnv("STORAGE_ORIGIN", "https://media.example/bucket/x");
    expect(middleware(req).headers.get("content-security-policy-report-only")).toContain("connect-src 'self' https://media.example;");
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
