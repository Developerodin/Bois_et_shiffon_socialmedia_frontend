import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/activity/page-views/route";
import { cleanPagePath, recordPageView } from "@/server/services/activity";

const m = vi.hoisted(() => ({
  memberOne: vi.fn(),
  memberMany: vi.fn(),
  brand: vi.fn(),
  create: vi.fn(),
  userId: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    workspaceMember: { findUnique: m.memberOne, findMany: m.memberMany },
    brand: { findFirst: m.brand },
    pageView: { create: m.create },
  },
}));
vi.mock("@/server/auth/request-user", () => ({ requestUserId: m.userId }));
vi.mock("@/server/auth/rate-limit", () => ({ hitRateLimit: m.limit }));

const written = () => m.create.mock.calls[0][0].data;

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.memberOne.mockResolvedValue({ id: "m1" });
  m.memberMany.mockResolvedValue([{ workspaceId: "w1" }]);
  m.brand.mockResolvedValue({ id: "b1" });
  m.create.mockResolvedValue({});
  m.userId.mockResolvedValue("u1");
  m.limit.mockResolvedValue({ allowed: true, count: 1 });
});

describe("cleanPagePath", () => {
  it("strips the query and fragment", () => expect(cleanPagePath("/chat?q=secret#x")).toBe("/chat"));
  it.each(["/admin", "/admin/logs", "/api/v1/me", "/invite/tok"])("doesn't record %s", (p) => expect(cleanPagePath(p)).toBeNull());
  it("matches whole segments only", () => expect(cleanPagePath("/administrators")).toBe("/administrators"));
  it.each(["chat", "//evil.com", 42, null, "/" + "a".repeat(300)])("rejects %s", (p) => expect(cleanPagePath(p)).toBeNull());
  it("keeps a 300-character path", () => expect(cleanPagePath("/" + "a".repeat(299))).toHaveLength(300));
});

describe("recordPageView", () => {
  it("keeps the workspace and project of a member", async () => {
    await recordPageView({ userId: "u1", platform: "web", path: "/", workspaceId: "w1", brandId: "b1" });
    expect(written()).toMatchObject({ userId: "u1", platform: "web", path: "/", workspaceId: "w1", brandId: "b1" });
  });

  it("drops a workspace the user isn't in", async () => {
    m.memberOne.mockResolvedValue(null);
    await recordPageView({ userId: "u1", platform: "web", path: "/", workspaceId: "w2", brandId: "b1" });
    expect(written()).toMatchObject({ workspaceId: null, brandId: null });
  });

  it("drops a project outside the workspace", async () => {
    m.brand.mockResolvedValue(null);
    await recordPageView({ userId: "u1", platform: "web", path: "/", workspaceId: "w1", brandId: "b9" });
    expect(written()).toMatchObject({ workspaceId: "w1", brandId: null });
  });

  it("files a mobile visit under the person's only workspace", async () => {
    await recordPageView({ userId: "u1", platform: "mobile", path: "/" });
    expect(written()).toMatchObject({ workspaceId: "w1", brandId: null });
  });

  it("doesn't guess between several workspaces", async () => {
    m.memberMany.mockResolvedValue([{ workspaceId: "w1" }, { workspaceId: "w2" }]);
    await recordPageView({ userId: "u1", platform: "mobile", path: "/" });
    expect(written()).toMatchObject({ workspaceId: null });
  });
});

describe("POST /api/v1/activity/page-views", () => {
  const send = (body: unknown) =>
    POST(new Request("http://x/api/v1/activity/page-views", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("records a visit", async () => {
    const res = await send({ path: "/chat?q=x", platform: "web", workspaceId: "w1" });
    expect(res.status).toBe(204);
    expect(written()).toMatchObject({ userId: "u1", path: "/chat", workspaceId: "w1" });
    expect(m.limit).toHaveBeenCalledWith("pv:u1", 120, 60_000);
  });

  it("records nothing without a user", async () => {
    m.userId.mockResolvedValue(null);
    expect((await send({ path: "/", platform: "web" })).status).toBe(204);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("drops visits over the rate limit", async () => {
    m.limit.mockResolvedValue({ allowed: false, count: 121 });
    expect((await send({ path: "/", platform: "web" })).status).toBe(204);
    expect(m.create).not.toHaveBeenCalled();
  });

  it.each([["not json"], [{ path: "/", platform: "tv" }], [{ path: "/admin", platform: "web" }]])("ignores a bad body %#", async (body) => {
    expect((await send(body)).status).toBe(204);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("answers 204 even when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.create.mockRejectedValue(new Error("db down"));
    expect((await send({ path: "/", platform: "web" })).status).toBe(204);
  });
});
