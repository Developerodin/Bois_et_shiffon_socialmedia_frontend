/**
 * AT-019 — Cross-brand access within same workspace → denied.
 * @see docs/ADVERSARIAL_ACCEPTANCE_TESTS.md
 */
import { BrandStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBrandAccess } from "@/server/auth/access";
import {
  AccessDeniedError,
  BrandArchivedError,
} from "@/server/auth/errors";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    workspaceMember: { findUnique: mocks.findUnique },
    brand: { findFirst: mocks.findFirst },
    brandMember: { count: mocks.count },
  },
}));

describe("AT-019 brand isolation", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.findFirst.mockReset();
    mocks.count.mockReset();
    mocks.findUnique.mockResolvedValue({ id: "mem", role: "EDITOR" });
    mocks.count.mockResolvedValue(0);
  });

  it("denies when brand is not in workspace", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      requireBrandAccess("ws-1", "brand-b-asset", "user-1"),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("denies archived brand for mutations", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "brand-a",
      workspaceId: "ws-1",
      status: BrandStatus.ARCHIVED,
      members: [],
    });

    await expect(
      requireBrandAccess("ws-1", "brand-a", "user-1"),
    ).rejects.toBeInstanceOf(BrandArchivedError);
  });

  it("allows active brand for workspace member", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "brand-a",
      workspaceId: "ws-1",
      status: BrandStatus.ACTIVE,
      members: [],
    });

    const brand = await requireBrandAccess("ws-1", "brand-a", "user-1");
    expect(brand.id).toBe("brand-a");
  });
});
