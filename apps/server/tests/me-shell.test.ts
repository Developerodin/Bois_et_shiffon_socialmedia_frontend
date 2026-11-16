import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  userId: vi.fn(),
  findUser: vi.fn(),
  shell: vi.fn(),
  perms: vi.fn(),
  role: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("@/server/auth/request-user", () => ({ requestUserId: m.userId }));
vi.mock("@/server/db/prisma", () => ({ prisma: { user: { findUnique: m.findUser } } }));
vi.mock("@/server/shell/load-shell-context", () => ({ loadShellContext: m.shell }));
vi.mock("@/server/auth/permissions", () => ({ effectivePermissions: m.perms }));
vi.mock("@/server/shell/load-role-label", () => ({ loadRoleLabel: m.role }));
vi.mock("@/server/auth/platform-admin", () => ({ isPlatformAdmin: m.admin }));

import { GET } from "@/app/api/v1/me/shell/route";

const ctx = {
  workspaces: [{ id: "w1", name: "One", slug: "one", role: "OWNER" }],
  brands: [{ id: "b1", slug: "b", displayName: "B", status: "ACTIVE", createdAt: new Date(), websiteUrl: "https://b.com" }],
  activeWorkspaceId: "w1",
  activeBrandId: "b1",
  hasActiveBrand: true,
};
const call = async () => (await GET(new Request("http://x/api/v1/me/shell"))).json();

beforeEach(() => {
  vi.clearAllMocks();
  m.userId.mockResolvedValue("u1");
  m.findUser.mockResolvedValue({ name: "U", email: "u@x.com", image: null });
  m.shell.mockResolvedValue(ctx);
  m.perms.mockImplementation(async (_w: string, _u: string, brand?: string) =>
    new Set(brand ? ["brand.read", "brand.create"] : ["brand.create"]),
  );
  m.role.mockResolvedValue("Owner");
  m.admin.mockResolvedValue(false);
});

describe("GET /api/v1/me/shell", () => {
  it("is 401 with no session", async () => {
    m.userId.mockResolvedValue(null);
    expect((await GET(new Request("http://x/api/v1/me/shell"))).status).toBe(401);
  });

  it("returns loadShellContext's active choice and only the fields the pages read", async () => {
    const body = await call();
    expect(m.shell).toHaveBeenCalledWith("u1");
    expect(body.activeWorkspaceId).toBe("w1");
    expect(body.activeBrandId).toBe("b1");
    expect(body.workspaces).toEqual([{ id: "w1", name: "One", slug: "one" }]);
    expect(body.brands[0]).not.toHaveProperty("createdAt");
    expect(body.workspacePermissions).toEqual(["brand.create"]);
    expect(body.brandPermissions).toContain("brand.read");
    expect(body.roleLabel).toBe("Owner");
  });

  it("reports the fallback workspace loadShellContext chose when the cookie one is not the user's", async () => {
    m.shell.mockResolvedValue({ ...ctx, workspaces: [{ id: "w2", name: "Two", slug: "two" }], activeWorkspaceId: "w2", activeBrandId: null });
    const body = await call();
    expect(body.activeWorkspaceId).toBe("w2");
    expect(m.perms).toHaveBeenCalledWith("w2", "u1");
  });

  it("has empty brandPermissions when there is no active brand", async () => {
    m.shell.mockResolvedValue({ ...ctx, brands: [], activeBrandId: null, hasActiveBrand: false });
    const body = await call();
    expect(body.brandPermissions).toEqual([]);
    expect(m.perms).not.toHaveBeenCalledWith("w1", "u1", expect.anything());
  });

  it("has no workspace data for a platform-only account", async () => {
    m.shell.mockResolvedValue({ workspaces: [], brands: [], activeWorkspaceId: null, activeBrandId: null, hasActiveBrand: false });
    m.admin.mockResolvedValue(true);
    expect(await call()).toMatchObject({ workspacePermissions: [], brandPermissions: [], roleLabel: null, isPlatformAdmin: true });
  });
});
