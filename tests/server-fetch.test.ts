import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/navigation", () => nav);
const pathname = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "a=1; b=2" }),
  headers: async () => ({ get: (k: string) => (k === "x-pathname" ? pathname.value : null) }),
}));

import { api, serverFetch } from "@/lib/server-fetch";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  pathname.value = null;
  nav.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  nav.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("api", () => {
  it("encodes each interpolation", () => {
    expect(api`/api/v1/admin/people/${"../x"}`).toBe("/api/v1/admin/people/..%2Fx");
    expect(api`/a/${"x?y=1"}/b/${7}`).toBe("/a/x%3Fy%3D1/b/7");
  });
});

describe("serverFetch", () => {
  it("forwards the cookie, never caches, and returns the JSON", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: 1 })));
    await expect(serverFetch("/api/v1/x")).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3100/api/v1/x");
    expect(init.cache).toBe("no-store");
    expect(init.headers.cookie).toBe("a=1; b=2");
  });

  it("sends a 401 to sign in again", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(serverFetch("/api/v1/x")).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.redirect).toHaveBeenCalledWith(expect.stringContaining("expired=1"));
  });

  it("carries the current path and query into the sign-in redirect", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    pathname.value = "/agents?x=1";
    await expect(serverFetch("/api/v1/x")).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.redirect).toHaveBeenCalledWith("/login?expired=1&next=%2Fagents%3Fx%3D1");
  });

  it("drops a path that could leave the site", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    pathname.value = "//evil.example";
    await expect(serverFetch("/api/v1/x")).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.redirect).toHaveBeenCalledWith("/login?expired=1");
  });

  it("shows not-found for 404 and 403", async () => {
    for (const status of [404, 403]) {
      fetchMock.mockResolvedValue(new Response("{}", { status }));
      await expect(serverFetch("/api/v1/x")).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(nav.notFound).toHaveBeenCalledTimes(2);
  });

  it("throws on any other failure", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    await expect(serverFetch("/api/v1/x")).rejects.toThrow("server 500");
  });
});
