import { describe, expect, it, vi } from "vitest";
import { nameLookup } from "@/server/services/platform-admin";

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    user: { findMany: async () => [{ id: "u1", email: "a@x.com" }] },
    brand: { findMany: async () => [{ id: "b1", displayName: "Shop" }] },
    workspace: { findMany: async () => [{ id: "w1", name: "Acme" }] },
  },
}));

describe("nameLookup", () => {
  it("names people by email, plus projects and workspaces", async () => {
    const name = await nameLookup([{ userId: "u1", workspaceId: "w1", brandId: "b1" }]);
    expect(name({ userId: "u1", workspaceId: "w1", brandId: "b1" })).toEqual({ who: "a@x.com", workspace: "Acme", brand: "Shop" });
  });

  it("says what's been deleted, and what's missing", async () => {
    const name = await nameLookup([]);
    expect(name({ userId: "u9", workspaceId: "w9", brandId: "b9" })).toEqual({ who: "(deleted user)", workspace: "(deleted workspace)", brand: "(deleted project)" });
    expect(name({ userId: null, workspaceId: null, brandId: null })).toEqual({ who: null, workspace: null, brand: null });
  });

  it("calls the eval workspace Test runs", async () => {
    expect((await nameLookup([]))({ workspaceId: "eval" }).workspace).toBe("Test runs");
  });
});
