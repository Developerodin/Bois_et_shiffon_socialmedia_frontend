import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { pushDevice: { findMany: m.findMany, deleteMany: m.deleteMany } } }));

import { notifyReelFinished, PushDeviceInput } from "@/server/notifications/push";

const fr = { ready: { title: "Votre reel est prêt", body: "« {title} » est prêt à regarder." }, failed: { title: "Reel non créé", body: "« {title} » n'a pas pu être créé." } };
const en = { ready: { title: "Your reel is ready", body: "{title} is ready to watch." }, failed: { title: "Reel not made", body: "{title} couldn't be made." } };

beforeEach(() => vi.clearAllMocks());

describe("reel push notifications", () => {
  it("sends each phone the text in its own language, and drops phones that no longer exist", async () => {
    m.findMany.mockResolvedValue([
      { token: "ExponentPushToken[aaaaaaaaaaaa]", messages: fr },
      { token: "ExponentPushToken[bbbbbbbbbbbb]", messages: en },
    ]);
    const fetchMock = vi.fn(async () => Response.json({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await notifyReelFinished("u1", { itemId: "i1", title: "Dimona", ok: true });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body) as { to: string; title: string; body: string; data: object }[];
    expect(sent.map((s) => s.body)).toEqual(["« Dimona » est prêt à regarder.", "Dimona is ready to watch."]);
    expect(sent[0].data).toEqual({ reelId: "i1", ok: true });
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["ExponentPushToken[bbbbbbbbbbbb]"] } } });
    vi.unstubAllGlobals();
  });

  it("never throws, and sends nothing to someone with no phones", async () => {
    m.findMany.mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await notifyReelFinished("u1", { itemId: "i1", title: "Dimona", ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    m.findMany.mockRejectedValue(new Error("db down"));
    await expect(notifyReelFinished("u1", { itemId: "i1", title: "Dimona", ok: false })).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("only accepts Expo push tokens", () => {
    expect(PushDeviceInput.safeParse({ token: "ExponentPushToken[aaaaaaaaaaaa]", platform: "android", messages: en }).success).toBe(true);
    expect(PushDeviceInput.safeParse({ token: "https://evil.example/hook", platform: "android", messages: en }).success).toBe(false);
  });
});
