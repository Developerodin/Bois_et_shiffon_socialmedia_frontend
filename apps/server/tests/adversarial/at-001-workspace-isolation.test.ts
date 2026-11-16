/**
 * AT-001 — User accesses another workspace's resource → denied.
 * @see docs/ADVERSARIAL_ACCEPTANCE_TESTS.md
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessDeniedError } from "@/server/auth/errors";
import { requireWorkspaceMember } from "@/server/auth/access";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    workspaceMember: { findUnique },
  },
}));

describe("AT-001 workspace isolation", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("denies when user is not a member of the workspace", async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      requireWorkspaceMember("workspace-b", "user-a"),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("allows when membership exists", async () => {
    findUnique.mockResolvedValue({
      id: "m1",
      workspaceId: "workspace-a",
      userId: "user-a",
      role: "OWNER",
    });

    const member = await requireWorkspaceMember("workspace-a", "user-a");
    expect(member.workspaceId).toBe("workspace-a");
  });
});
