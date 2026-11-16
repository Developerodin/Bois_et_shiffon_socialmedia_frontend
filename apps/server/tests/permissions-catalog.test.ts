import { describe, expect, it } from "vitest";
import { isPermissionKey, PERMISSION_KEYS, permissionScope, SYSTEM_ROLES } from "@/server/auth/permissions.catalog";
import { backoffMs } from "@/server/jobs/queue";

describe("permission catalog + system roles", () => {
  const role = (slug: string) => new Set(SYSTEM_ROLES.find((r) => r.slug === slug)!.permissions);

  it("keys are unique and every system role uses known keys", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    for (const r of SYSTEM_ROLES) for (const p of r.permissions) expect(isPermissionKey(p)).toBe(true);
  });

  it("owner has everything; admin everything but ownership", () => {
    expect(role("owner").size).toBe(PERMISSION_KEYS.length);
    expect(role("admin").has("workspace.manage")).toBe(false);
    expect(role("admin").has("members.manage")).toBe(true);
  });

  it("brief duties stay separated", () => {
    expect(role("manager").has("agents.run")).toBe(true);
    expect(role("manager").has("content.approve")).toBe(false);
    expect(role("approver").has("content.approve")).toBe(true);
    expect(role("creator").has("context.confirm")).toBe(false);
    expect(role("viewer").has("content.create")).toBe(false);
  });

  it("Commercial owner holds commercial.manage and READ only; Approver and Manager don't (brief B7)", () => {
    expect([...role("commercial-owner")].sort()).toEqual(["agents.read", "analytics.read", "brand.read", "commercial.manage"]);
    expect(role("approver").has("commercial.manage")).toBe(false);
    expect(role("manager").has("commercial.manage")).toBe(false);
    expect(role("project-admin").has("commercial.manage")).toBe(true);
  });

  it("project roles hold only project permissions; Member reaches no project by itself", () => {
    for (const r of SYSTEM_ROLES.filter((r) => r.scope === "PROJECT")) {
      for (const p of r.permissions) expect(permissionScope(p)).toBe("PROJECT");
      expect(r.permissions).toContain("brand.read");
    }
    expect(role("member").size).toBe(0);
    expect(role("project-admin").has("project.members.manage")).toBe(true);
  });
});

describe("job backoff", () => {
  it("grows exponentially and caps at one hour", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(30)).toBe(60 * 60_000);
  });
});
