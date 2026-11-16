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
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/crypto/credentials", () => ({ currentKeyVersion: () => 1, encryptCredentials: () => "sealed", decryptCredentials: () => ({ accessToken: "old", refreshToken: "r" }) }));
vi.mock("@/server/integrations/providers", () => ({ PROVIDERS: { INSTAGRAM: { refresh } }, providerConfig: () => ({ clientId: "id", secret: "s" }), ProviderError: class extends Error {} }));

import { accessToken, disconnect, ReconnectNeeded } from "@/server/services/connections";

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

describe("accessToken refresh", () => {
  const conn = { id: "c1", provider: "INSTAGRAM", status: "ACTIVE", displayName: "@shop", encryptedCredentials: "x", tokenExpiresAt: new Date(Date.now() + 86_400_000) } as Parameters<typeof accessToken>[0];

  it("writes the new tokens only onto a still-connected account", async () => {
    refresh.mockResolvedValue({ credentials: { accessToken: "new", refreshToken: "r2" }, tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000) });
    db.integrationConnection.updateMany.mockResolvedValue({ count: 1 });
    await expect(accessToken(conn)).resolves.toBe("new");
    expect(db.integrationConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1", status: "ACTIVE" } }));
  });

  it("disconnected during the refresh: nothing written back, and no token handed out", async () => {
    refresh.mockResolvedValue({ credentials: { accessToken: "new", refreshToken: "r2" }, tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000) });
    db.integrationConnection.updateMany.mockResolvedValue({ count: 0 });
    await expect(accessToken(conn)).rejects.toBeInstanceOf(ReconnectNeeded);
  });
});
