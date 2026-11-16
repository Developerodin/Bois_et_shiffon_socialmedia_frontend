import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = { $executeRaw: vi.fn(async () => 0), voice: { count: fn(), create: fn(), update: fn(), updateMany: fn(), delete: fn(), findFirst: fn(), findMany: fn(), findUnique: fn(), findUniqueOrThrow: fn() }, auditEvent: { create: fn() } };
  return { tx, prisma: { ...tx, $transaction: vi.fn(async (f: unknown) => (typeof f === "function" ? f(tx) : Promise.all(f as unknown[]))) }, spend: fn(), refund: fn(), enqueue: fn(), perms: fn() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), spendCredits: m.spend, refundCharge: m.refund }));
vi.mock("@/server/services/subscriptions", () => ({ requirePlan: vi.fn(async () => {}) }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob: m.enqueue }));
vi.mock("@/server/auth/permissions", () => ({ effectivePermissions: m.perms }));
vi.mock("@/server/reels/recordings", () => ({ isM4a: () => true, toWav: vi.fn(async () => new Uint8Array(8)) }));
vi.mock("@/server/reels/wav", () => ({ wavSeconds: () => 75 }));
vi.mock("@/server/storage/media", () => ({ putMedia: vi.fn(), deleteMedia: vi.fn() }));
vi.mock("@/server/reels/voice", () => ({ speak: vi.fn(async () => new Uint8Array(8)), SAMPLE_LINE: "x" }));

import { permissionScope, SYSTEM_ROLES } from "@/server/auth/permissions.catalog";
import { archiveMemberClones, CONSENT_VERSION, createClone, deleteClone } from "@/server/reels/clones";
import { needsAiDisclosure, toVersionBody } from "@/server/reels/plan";
import { postText } from "@/server/services/publishing";

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const input = { name: "Ma voix", bytes: new Uint8Array([1, 2, 3]), consent: true, appVersion: "1.4.0" };
const elevenLabs = (add: Response) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      if (url.endsWith("/user")) return Response.json({ subscription: { can_use_instant_voice_cloning: true } });
      if (url.endsWith("/voices/add")) return add.clone();
      return Response.json(init?.method === "DELETE" ? {} : { samples: [{ sample_id: "s1" }] });
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ELEVENLABS_API_KEY = "test";
  m.tx.voice.count.mockResolvedValue(0);
  m.tx.voice.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "v1", ...data }));
  m.tx.voice.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "v1", workspaceId: "w1", ...data }));
  m.tx.voice.updateMany.mockResolvedValue({ count: 1 });
  m.tx.voice.findMany.mockResolvedValue([]);
  m.tx.voice.findUniqueOrThrow.mockResolvedValue({ id: "v1", workspaceId: "w1" });
  m.tx.voice.delete.mockResolvedValue({});
  m.spend.mockResolvedValue("charge1");
  m.enqueue.mockResolvedValue({});
});

describe("who may clone", () => {
  it("is a workspace-only permission, held by Owner and Admin, never by a project role", () => {
    expect(permissionScope("voices.manage")).toBe("WORKSPACE");
    const roles = Object.fromEntries(SYSTEM_ROLES.map((r) => [r.slug, r.permissions as string[]]));
    expect(roles.owner).toContain("voices.manage");
    expect(roles.admin).toContain("voices.manage");
    for (const r of SYSTEM_ROLES.filter((x) => x.scope === "PROJECT")) expect(r.permissions).not.toContain("voices.manage");
  });
});

describe("making a clone", () => {
  it("refuses without consent, and when our ElevenLabs plan can't clone, before charging", async () => {
    await expect(createClone(scope, { ...input, consent: false })).rejects.toThrow(/Tick the box/);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ subscription: { can_use_instant_voice_cloning: false } })));
    await expect(createClone(scope, input)).rejects.toThrow("Voice cloning isn't available yet.");
    expect(m.spend).not.toHaveBeenCalled();
  });

  it("allows two per workspace, counted under a lock", async () => {
    elevenLabs(Response.json({ voice_id: "el1" }));
    m.tx.voice.count.mockResolvedValue(2);
    await expect(createClone(scope, input)).rejects.toThrow(/2 cloned voices/);
    expect(m.tx.$executeRaw).toHaveBeenCalled();
    expect(m.spend).not.toHaveBeenCalled();
  });

  it("charges first, then clones, and keeps the consent record", async () => {
    elevenLabs(Response.json({ voice_id: "el1" }));
    const order: string[] = [];
    m.spend.mockImplementation(async () => (order.push("charge"), "charge1"));
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const real = fetchMock.getMockImplementation() as (url: string, init?: object) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: object) => (url.endsWith("/voices/add") && order.push("clone"), real(url, init)));
    await createClone(scope, input);
    expect(order).toEqual(["charge", "clone"]);
    expect(m.spend.mock.calls[0][0]).toMatchObject({ amount: 10, reason: "voice-clone", refId: "v1" });
    const consent = m.tx.voice.create.mock.calls[0][0].data.consent;
    expect(consent).toMatchObject({ userId: "u1", textVersion: CONSENT_VERSION, appVersion: "1.4.0", audioSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(m.tx.voice.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "v1", archivedAt: null }, data: { providerVoiceId: "el1", consent: { elevenSampleId: "s1" } } });
  });

  it("gives the place and the credits back when ElevenLabs fails", async () => {
    elevenLabs(new Response("bad", { status: 400 }));
    await expect(createClone(scope, input)).rejects.toThrow(/couldn't be made/);
    expect(m.refund).toHaveBeenCalledWith("w1", "charge1");
    expect(m.tx.voice.delete).toHaveBeenCalledWith({ where: { id: "v1" } });
  });
});

describe("clones that go wrong", () => {
  it("gives back a place held over 5 minutes by a request that died, with its credits", async () => {
    elevenLabs(Response.json({ voice_id: "el1" }));
    m.tx.voice.findMany.mockResolvedValueOnce([{ id: "stale" }]);
    await createClone(scope, input);
    // Archived and its delete queued (not just forgotten): the request may have died after ElevenLabs made the voice.
    expect(m.tx.voice.delete).not.toHaveBeenCalledWith({ where: { id: "stale" } });
    expect(m.tx.voice.update).toHaveBeenCalledWith({ where: { id: "stale" }, data: { archivedAt: expect.any(Date) } });
    expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: "voices.delete", payload: { voiceId: "stale" } }), m.tx);
    expect(m.refund).toHaveBeenCalledWith("w1", "stale", m.tx);
  });

  it("the delete job finds a voice that was never saved here by the id in its ElevenLabs name", async () => {
    const { runVoiceDelete } = await import("@/server/reels/clones");
    m.prisma.voice.findUnique.mockResolvedValue({ id: "stale", archivedAt: new Date(), providerVoiceId: null, sampleKey: null });
    const fetch = vi.fn(async (url: string, init?: { method?: string }) =>
      init?.method === "DELETE" ? Response.json({}) : Response.json({ voices: [{ voice_id: "el9", name: "Ma voix (stale)" }, { voice_id: "el2", name: "Other (v2)" }] }));
    vi.stubGlobal("fetch", fetch);
    await runVoiceDelete({ voiceId: "stale" });
    const deleted = fetch.mock.calls.filter(([, init]) => init?.method === "DELETE").map(([url]) => url);
    expect(deleted).toEqual([expect.stringMatching(/\/voices\/el9$/)]);
  });

  it("deletes the voice at ElevenLabs when it can't be kept (its owner left meanwhile)", async () => {
    elevenLabs(Response.json({ voice_id: "el1" }));
    m.tx.voice.updateMany.mockResolvedValue({ count: 0 });
    await expect(createClone(scope, input)).rejects.toThrow(/owner left/);
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([url, init]) => String(url).endsWith("/voices/el1") && (init as { method?: string })?.method === "DELETE")).toBe(true);
    expect(m.refund).toHaveBeenCalledWith("w1", "charge1");
  });

  it("the delete job removes it at ElevenLabs (already gone is fine) and its sample", async () => {
    const { runVoiceDelete } = await import("@/server/reels/clones");
    m.prisma.voice.findUnique.mockResolvedValue({ id: "v1", archivedAt: new Date(), providerVoiceId: "el1", sampleKey: "w1/voices/v1/sample.wav" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await runVoiceDelete({ voiceId: "v1" });
    expect(m.tx.voice.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { providerVoiceId: null, sampleKey: null } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(runVoiceDelete({ voiceId: "v1" })).rejects.toThrow(/ElevenLabs 500/);
  });

  it("a delete that used up its tries is queued again later, so the voice isn't left at ElevenLabs", async () => {
    const { onVoiceDeleteFailure } = await import("@/server/reels/clones");
    m.prisma.voice.findUnique.mockResolvedValue({ id: "v1", workspaceId: "w1", archivedAt: new Date(), providerVoiceId: "el1", sampleKey: null });
    await onVoiceDeleteFailure({ voiceId: "v1" }, new Error("ElevenLabs 503"), false);
    expect(m.enqueue).not.toHaveBeenCalled(); // the queue still retries this one itself
    await onVoiceDeleteFailure({ voiceId: "v1" }, new Error("ElevenLabs 503"), true);
    expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: "voices.delete", payload: { voiceId: "v1" }, runAt: expect.any(Date), idempotencyKey: expect.stringMatching(/^voice:v1:delete:\d+$/) }));
    expect(m.tx.auditEvent.create.mock.calls[0][0].data).toMatchObject({ action: "voice.clone.delete_failed", entityId: "v1" });
  });
});

describe("removing a clone", () => {
  it("archives and queues its deletion in the same transaction, with an audit event", async () => {
    m.tx.voice.findMany.mockResolvedValue([{ id: "v1", workspaceId: "w1" }]);
    await archiveMemberClones(m.tx as never, "w1", "u2", "u1");
    expect(m.tx.voice.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { archivedAt: expect.any(Date) } });
    expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: "voices.delete", payload: { voiceId: "v1" } }), m.tx);
    expect(m.tx.auditEvent.create.mock.calls[0][0].data).toMatchObject({ action: "voice.clone.owner_removed", entityId: "v1" });
  });

  it("lets only the owner withdraw consent; others need voices.manage to delete", async () => {
    m.prisma.voice.findFirst.mockResolvedValue({ id: "v1", workspaceId: "w1", ownerUserId: "u2", archivedAt: null });
    m.perms.mockResolvedValue(new Set(["voices.manage"]));
    await expect(deleteClone(scope, "v1", true)).rejects.toThrow(/Only the voice's owner/);
    await deleteClone(scope, "v1");
    expect(m.tx.auditEvent.create.mock.calls.at(-1)?.[0].data.action).toBe("voice.clone.deleted");
    m.perms.mockResolvedValue(new Set());
    await expect(deleteClone(scope, "v1")).rejects.toThrow(/Only the voice's owner/);
  });
});

describe("AI disclosure", () => {
  it("flags reels with a presenter or a cloned voice, and the posted caption says so", () => {
    expect(needsAiDisclosure({ presenter: "none", voice: "coral" })).toBe(false);
    expect(needsAiDisclosure({ presenter: "p1", voice: "coral" })).toBe(true);
    expect(needsAiDisclosure({ presenter: "none", voice: "clone:v1" })).toBe(true);
    const body = toVersionBody({ title: "T", presenter: "none", template: "", voice: "clone:v1", caption: "Une table.", hashtags: ["#bois"], scenes: [{ photoKey: "k", shot: "s", direction: "d", onScreenText: "o", voiceText: "v" }, { photoKey: "k", shot: "s", direction: "d", onScreenText: "o", voiceText: "v" }] });
    expect(body.aiDisclosure).toBe(true);
    expect(postText(body)).toBe("Une table.\n\nMade with AI.\n\n#bois");
    expect(postText({ ...body, aiDisclosure: false })).toBe("Une table.\n\n#bois");
    // In the reel's language; and versions saved before the flag existed are judged from their plan.
    expect(postText({ caption: "Une table.", presenter: "p1", voice: "coral", language: "fr" })).toBe("Une table.\n\nCréé avec l'IA.");
  });
});
