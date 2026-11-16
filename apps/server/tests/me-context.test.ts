import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessDeniedError } from "@/server/auth/errors";

const m = vi.hoisted(() => ({
  userId: vi.fn(),
  member: vi.fn(),
  brand: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/server/auth/request-user", () => ({ requestUserId: m.userId }));
vi.mock("@/server/auth/access", () => ({ requireWorkspaceMember: m.member, requireBrandAccess: m.brand }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: m.set, delete: m.del }) }));

import { POST } from "@/app/api/v1/me/context/route";

process.env.AUTH_URL = "http://localhost:3100";

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3100/api/v1/me/context", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3100", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.userId.mockResolvedValue("u1");
  m.member.mockResolvedValue({});
  m.brand.mockResolvedValue(undefined);
});

describe("POST /api/v1/me/context", () => {
  it("rejects a non-JSON body with 415", async () => {
    const res = await POST(req("workspaceId=w1", { "content-type": "text/plain" }));
    expect(res.status).toBe(415);
    expect(m.set).not.toHaveBeenCalled();
  });

  it("rejects another origin with 403", async () => {
    const res = await POST(req({ workspaceId: "w1" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(m.set).not.toHaveBeenCalled();
  });

  it("is 404 and sets no cookie for a workspace the user is not in", async () => {
    m.member.mockRejectedValue(new AccessDeniedError());
    const res = await POST(req({ workspaceId: "w9" }));
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(m.set).not.toHaveBeenCalled();
  });

  it("sets both cookies for a workspace and brand, archived brands allowed", async () => {
    const res = await POST(req({ workspaceId: "w1", brandId: "b1" }));
    expect(res.status).toBe(200);
    expect(m.brand).toHaveBeenCalledWith("w1", "b1", "u1", { allowArchived: true });
    const opts = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180, secure: false };
    expect(m.set).toHaveBeenCalledWith("bp_active_workspace_id", "w1", opts);
    expect(m.set).toHaveBeenCalledWith("bp_active_brand_id", "b1", opts);
  });

  it("clears the brand cookie when only a workspace is given", async () => {
    const res = await POST(req({ workspaceId: "w1" }));
    expect(res.status).toBe(200);
    expect(m.set).toHaveBeenCalledTimes(1);
    expect(m.del).toHaveBeenCalledWith("bp_active_brand_id");
  });

  it("is 401 with no session", async () => {
    m.userId.mockResolvedValue(null);
    expect((await POST(req({ workspaceId: "w1" }))).status).toBe(401);
  });
});
