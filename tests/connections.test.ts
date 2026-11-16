import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    $transaction: vi.fn(async (f: (tx: unknown) => unknown): Promise<unknown> => f(d)),
    integrationConnection: { updateMany: vi.fn() },
    publicationAttempt: { findMany: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    contentItem: { updateMany: vi.fn(async () => ({ count: 1 })) },
    auditEvent: { create: vi.fn(async () => ({})) },
  };
  return d;
});
vi.mock("@/server/db/prisma", () => ({ prisma: db }));

import { disconnect } from "@/server/services/connections";

const input = { workspaceId: "w1", brandId: "b1", connectionId: "c1", userId: "u1" };
const frame = (i: number, state: string) => ({ i, state, mediaId: state === "published" ? `m${i}` : null });

beforeEach(() => {
  vi.clearAllMocks();
  db.integrationConnection.updateMany.mockResolvedValue({ count: 1 });
});

describe("disconnect", () => {
  it("cancels a plain scheduled post and puts its item back to APPROVED", async () => {
    db.publicationAttempt.findMany.mockResolvedValue([{ id: "a1", contentItemId: "i1", target: {} }]);
    await disconnect(input);
    expect(db.publicationAttempt.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a1"] }, status: "SCHEDULED" }, data: expect.objectContaining({ status: "CANCELLED" }) });
    expect(db.contentItem.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["i1"] }, status: "SCHEDULED" }, data: { status: "APPROVED" } });
  });

  it("puts a story's Post the rest back to PARTIAL, item still SCHEDULED, so frames already out aren't posted again", async () => {
    const target = { story: true, frames: 3, progress: [frame(0, "published"), frame(1, "published")] };
    db.publicationAttempt.findMany.mockResolvedValue([{ id: "a2", contentItemId: "i2", target }]);
    await disconnect(input);
    expect(db.publicationAttempt.updateMany).toHaveBeenCalledTimes(1);
    expect(db.publicationAttempt.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a2"] }, status: "SCHEDULED" }, data: expect.objectContaining({ status: "PARTIAL" }) });
    expect(db.contentItem.updateMany).not.toHaveBeenCalled();
  });
});
