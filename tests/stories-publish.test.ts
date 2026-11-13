import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
// A small in-memory database: enough of Prisma's where (equality, `in`) to run the publishing services for real.
const db = vi.hoisted(() => ({ items: [] as Row[], versions: [] as Row[], decisions: [] as Row[], attempts: [] as Row[], conns: [] as Row[], audits: [] as Row[], jobs: [] as Row[], n: 0, onRowLock: null as null | (() => void) }));
const m = vi.hoisted(() => ({ markReconnect: vi.fn() }));

vi.mock("@/server/db/prisma", () => {
  const match = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => v === undefined || (v && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : row[k] === v));
  const copy = <T,>(x: T): T => (x == null ? x : structuredClone(x));
  const prisma: Row = {
    $executeRaw: async () => 0,
    // SELECT … FOR UPDATE: whatever a concurrent writer committed before the lock was granted happens in onRowLock.
    $queryRaw: async () => { db.onRowLock?.(); return []; },
    contentItem: {
      findFirst: async ({ where }: Row) => {
        const i = db.items.find((r) => match(r, where));
        if (!i) return null;
        const latest = db.versions.filter((v) => v.contentItemId === i.id).sort((a, b) => b.version - a.version)[0];
        return copy({ ...i, versions: latest ? [{ ...latest, checks: [{ overall: "PASS", results: [] }] }] : [] });
      },
      update: async ({ where, data }: Row) => copy(Object.assign(db.items.find((i) => i.id === where.id)!, copy(data))),
    },
    approvalDecision: {
      findFirst: async ({ where }: Row) => copy(db.decisions.filter((d) => match(d, where)).at(-1) ?? null),
      findMany: async ({ where }: Row) => copy(db.decisions.filter((d) => match(d, where))),
      create: async ({ data }: Row) => { const d = { id: `d${++db.n}`, ...copy(data) }; db.decisions.push(d); return copy(d); },
    },
    auditEvent: { create: async ({ data }: Row) => { db.audits.push(copy(data)); return {}; } },
    publicationAttempt: {
      findFirst: async ({ where }: Row) => copy(db.attempts.find((a) => match(a, where)) ?? null),
      findUniqueOrThrow: async ({ where }: Row) => copy(db.attempts.find((a) => a.id === where.id)!),
      findMany: async ({ where }: Row) => copy(db.attempts.filter((a) => match(a, where))),
      create: async ({ data }: Row) => {
        const a = { id: `a${++db.n}`, status: "SCHEDULED", externalId: null, externalUrl: null, error: null, publishedAt: null, updatedAt: new Date(), ...copy(data) };
        db.attempts.push(a);
        return copy(a);
      },
      update: async ({ where, data }: Row) => copy(Object.assign(db.attempts.find((a) => a.id === where.id)!, copy(data))),
      updateMany: async ({ where, data }: Row) => {
        const rows = db.attempts.filter((a) => match(a, where));
        rows.forEach((r) => Object.assign(r, copy(data)));
        return { count: rows.length };
      },
    },
    integrationConnection: { findFirst: async ({ where }: Row) => copy(db.conns.find((c) => match(c, where)) ?? null), findMany: async () => [] },
    brandProfile: { findFirst: async () => null },
    user: { findMany: async () => [] },
  };
  prisma.$transaction = async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: Row) => unknown)(prisma) : Promise.all(arg as unknown[]));
  return { prisma };
});
vi.mock("@/server/catalog/linked", () => ({ linkedProducts: vi.fn(async () => []) }));
vi.mock("@/server/catalog/campaigns", () => ({ campaignsById: vi.fn(async () => ({ campaigns: new Map(), timeZone: "UTC" })) }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: vi.fn(), hasOtherApprover: vi.fn(async () => true) }));
vi.mock("@/server/services/connections", () => ({ accessToken: vi.fn(async () => "tok"), markReconnect: m.markReconnect, ReconnectNeeded: class extends Error {} }));
vi.mock("@/server/jobs/queue", () => ({ enqueueJob: vi.fn(async (job: Row) => { db.jobs.push(job); }) }));
vi.mock("@/server/storage/media", async (orig) => ({ ...(await orig<object>()), signedMediaUrl: vi.fn(async (k: string) => `https://signed.example/${k}`) }));
vi.mock("@/server/jobs/runner", () => ({ kickRunner: vi.fn() }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: vi.fn(async () => ({})) }));
vi.mock("@/server/services/automations", () => ({ autoPublish: vi.fn() }));
vi.mock("@/server/api/brand-route", () => ({ authorizeBrandRoute: vi.fn(async () => ({ workspaceId: "w1", brandId: "b1", userId: "u1" })) }));

// The Graph API, mocked at fetch: frame i's file is f<i>, its container c<i>, its media m<i>.
const graph = vi.hoisted(() => ({
  quota: { quota_total: 100, quota_usage: 0 },
  refusePublish: new Set<number>(), unknownPublish: new Set<number>(), containerError: new Set<number>(), refuseCreate: "" as string,
  created: [] as number[], published: [] as number[], onLimit: null as null | (() => Promise<unknown>),
}));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  const u = new URL(url);
  const params = init?.body ? Object.fromEntries(new URLSearchParams(init.body as URLSearchParams)) : {};
  if (u.pathname.endsWith("/content_publishing_limit")) await graph.onLimit?.();
  if (u.pathname.endsWith("/content_publishing_limit")) return json({ data: [{ config: { quota_total: graph.quota.quota_total, quota_duration: 86400 }, quota_usage: graph.quota.quota_usage }] });
  if (u.pathname.endsWith("/media") && init?.method === "POST") {
    if (graph.refuseCreate) return json({ error: { message: graph.refuseCreate } }, 400);
    const f = Number(/f(\d)\.(jpg|mp4)$/.exec(params.image_url ?? params.video_url)![1]);
    expect(params.media_type).toBe("STORIES");
    graph.created.push(f);
    return json({ id: `c${f}` });
  }
  if (u.pathname.endsWith("/media_publish")) {
    const f = Number(params.creation_id.slice(1));
    if (graph.refusePublish.has(f)) return json({ error: { message: "Media not ready" } }, 400);
    if (graph.unknownPublish.has(f)) return json({ error: { message: "Service unavailable" } }, 503);
    graph.published.push(f);
    return json({ id: `m${f}` });
  }
  if (u.searchParams.get("fields") === "status_code") return json({ status_code: graph.containerError.has(Number(u.pathname.slice(-1))) ? "ERROR" : "FINISHED" });
  if (u.searchParams.get("fields") === "permalink") return json({ permalink: `https://www.instagram.com/stories/shop/${u.pathname.split("/").pop()}/` });
  throw new Error(`unexpected call ${url}`);
}));

import { decide, executePublication, markDone, onPublishJobLost, packageHash, postRest, schedulePublication, settleFrame, settlePublication } from "@/server/services/publishing";
import { attemptOutcome, expiredFrames, type FrameProgress, nextFramesToPublish, publishingLimitRoom, settleStoryFrame } from "@/server/stories/publish";
import { POST } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/[contentId]/route";
import { authorizeBrandRoute } from "@/server/api/brand-route";
import { kickRunner } from "@/server/jobs/runner";

const scope = { workspaceId: "w1", brandId: "b1" };
const body = (n: number) => ({
  frames: Array.from({ length: n }, (_, i) => ({ label: "", headline: `H${i}`, body: "", renderedKey: `w1/b1/stories/f${i}.jpg`, mediaKind: "photo" })),
  cta: "Shop now", link: "https://shop.example/p", hook: "H0", productIds: [], brandMark: false,
});
function seed(frames = 4, itemOver: Row = {}) {
  const b = body(frames);
  db.items.push({ id: "s1", ...scope, channel: "INSTAGRAM_STORY", status: "APPROVED", studio: false, title: "Story", productIds: [], byHand: true, scheduledFor: null, campaignId: null, ...itemOver });
  db.versions.push({ id: "v1", contentItemId: "s1", version: 1, createdBy: "writer", body: b });
  db.decisions.push({ id: "d1", contentItemId: "s1", verdict: "APPROVED", contentVersionId: "v1", packageHash: packageHash({ id: "s1", channel: "INSTAGRAM_STORY" }, { id: "v1", body: b }), productOverride: null });
}
const schedule = () => schedulePublication({ ...scope, userId: "u1", itemId: "s1", version: 1, connectionId: "c1" });
const run = (a: { id: string }) => executePublication({ attemptId: a.id });
const ref = <T extends object = object>(attemptId: string, over?: T) => ({ ...scope, userId: "u1", itemId: "s1", attemptId, ...(over as T) });
const att = (id: string) => db.attempts.find((a) => a.id === id)!;
const item = () => db.items.find((i) => i.id === "s1")!;
const published = (a: Row) => (a.target.progress as FrameProgress).filter((f) => f.state === "published").map((f) => f.i);
/** Every frame went out exactly once on Instagram. */
const noFramePostedTwice = () => expect(new Set(graph.published).size).toBe(graph.published.length);

async function partlyPosted() {
  graph.refusePublish.add(2);
  const a = await schedule();
  await run(a);
  graph.refusePublish.clear();
  return a;
}

beforeEach(() => {
  Object.assign(db, { items: [], versions: [], decisions: [], attempts: [], audits: [], jobs: [], n: 0, onRowLock: null });
  db.conns = [{ id: "c1", brandId: "b1", provider: "INSTAGRAM", status: "ACTIVE", encryptedCredentials: "x", externalAccountId: "ig1", displayName: "Shop" }];
  Object.assign(graph, { quota: { quota_total: 100, quota_usage: 0 }, refusePublish: new Set(), unknownPublish: new Set(), containerError: new Set(), refuseCreate: "", created: [], published: [], onLimit: null });
  m.markReconnect.mockClear();
});

describe("frame progress (pure)", () => {
  const p = (...rows: [number, FrameProgress[number]["state"], string?][]): FrameProgress => rows.map(([i, state, at]) => ({ i, state, ...(at ? { at } : {}) }));
  it.each([
    [4, p(), [0, 1, 2, 3]],
    [4, p([0, "published"], [1, "published"]), [2, 3]],
    [4, p([0, "published"], [1, "published"], [2, "not-posted"]), [2, 3]],
    [3, p([0, "published"], [1, "published"], [2, "published"]), []],
  ])("nextFramesToPublish(%i, %j) = %j", (total, progress, want) => {
    expect(nextFramesToPublish(total, progress)).toEqual(want);
  });
  it("nextFramesToPublish refuses while a frame's outcome is unknown", () => {
    expect(() => nextFramesToPublish(4, p([0, "published"], [1, "publishing"]))).toThrow();
  });
  it.each([
    [4, p(), "FAILED"],
    [4, p([0, "not-posted"]), "FAILED"],
    [4, p([0, "published"], [1, "not-posted"]), "PARTIAL"],
    [4, p([0, "published"], [1, "published"], [2, "publishing"]), "PARTIAL"],
    [3, p([0, "published"], [1, "published"], [2, "published"]), "PUBLISHED"],
  ])("attemptOutcome(%i, %j) = %s", (total, progress, want) => {
    expect(attemptOutcome(total, progress)).toBe(want);
  });
  it.each([
    [true, { i: 2, state: "published", at: "2026-11-13T10:00:00.000Z" }],
    [false, { i: 2, state: "not-posted" }],
  ])("settleStoryFrame(appeared %s)", (appeared, want) => {
    const out = settleStoryFrame(p([0, "published"], [1, "published"], [2, "publishing"]), 2, appeared, new Date("2026-11-13T10:00:00Z"));
    expect(out[2]).toEqual(want);
    expect(out.slice(0, 2)).toEqual(p([0, "published"], [1, "published"]));
  });
  it("settleStoryFrame refuses a frame that isn't in flight", () => {
    expect(() => settleStoryFrame(p([0, "published"]), 0, true)).toThrow();
  });
  const now = new Date("2026-11-14T12:00:00Z");
  it.each([
    [p(), 0],
    [p([0, "published", "2026-11-13T13:00:00Z"]), 0], // 23 h
    [p([0, "published", "2026-11-13T11:00:00Z"], [1, "published", "2026-11-13T11:30:00Z"], [2, "published", "2026-11-14T11:00:00Z"]), 2],
    [p([0, "not-posted", "2026-11-12T11:00:00Z"]), 0],
  ])("expiredFrames(%j) = %i", (progress, want) => {
    expect(expiredFrames(progress, now)).toBe(want);
  });
  it("publishingLimitRoom", () => {
    expect(publishingLimitRoom({ config: { quota_total: 100 }, quota_usage: 98 })).toBe(2);
    expect(publishingLimitRoom({ config: { quota_total: 25 }, quota_usage: 30 })).toBe(0);
  });
});

describe("scheduling a story", () => {
  it("schedules every frame, ends Post by hand and queues the job", async () => {
    seed();
    const a = await schedule();
    expect(att(a.id).target).toEqual({ story: true, frames: 4, progress: [] });
    expect(item()).toMatchObject({ status: "SCHEDULED", byHand: false });
    expect(db.jobs).toHaveLength(1);
  });

  it("refuses a frame without its rendered file, and nothing is scheduled", async () => {
    seed();
    db.versions[0].body.frames[1].renderedKey = undefined;
    db.decisions[0].packageHash = packageHash({ id: "s1", channel: "INSTAGRAM_STORY" }, db.versions[0] as { id: string; body: unknown });
    await expect(schedule()).rejects.toMatchObject({ status: 409, code: "story.framesNotReady" });
    expect(db.attempts).toHaveLength(0);
  });

  it("LIVE pin: a partly posted story can't be scheduled again, even if the item is forced back to APPROVED", async () => {
    seed();
    await partlyPosted();
    item().status = "APPROVED";
    await expect(schedule()).rejects.toMatchObject({ status: 409, code: "story.partlyPosted" });
    expect(db.attempts).toHaveLength(1);
  });
});

describe("publishing a story", () => {
  it("posts every frame once, in order, and stores frame 1's id and link", async () => {
    seed();
    const a = await run(await schedule()).then(() => att("a1"));
    expect(graph.published).toEqual([0, 1, 2, 3]);
    expect(a).toMatchObject({ status: "PUBLISHED", externalId: "m0", externalUrl: "https://www.instagram.com/stories/shop/m0/" });
    expect(published(a)).toEqual([0, 1, 2, 3]);
    expect(item().status).toBe("PUBLISHED");
  });

  it("a refusal on frame 3 of 4: PARTIAL, item SCHEDULED, frames 1–2 recorded", async () => {
    seed();
    const a = att((await partlyPosted()).id);
    expect(a.status).toBe("PARTIAL");
    expect(item().status).toBe("SCHEDULED");
    expect(a.target.progress).toEqual([
      { i: 0, state: "published", mediaId: "m0", at: expect.any(String) },
      { i: 1, state: "published", mediaId: "m1", at: expect.any(String) },
      { i: 2, state: "not-posted" },
    ]);
    expect(graph.published).toEqual([0, 1]);
  });

  it("daily limit room for 2 of 4: FAILED with the reason, nothing sent to the publisher", async () => {
    seed();
    graph.quota.quota_usage = 98;
    const a = await schedule();
    await run(a);
    expect(att(a.id)).toMatchObject({ status: "FAILED", error: expect.stringMatching(/^Instagram's daily limit leaves room for 2 of 4 frames\. Try after .+\.$/) });
    expect(att(a.id).target.errorCode).toBe("story.dailyLimit");
    expect(graph.created).toEqual([]);
    expect(item().status).toBe("APPROVED");
  });

  it("a container that fails: FAILED, no frame published", async () => {
    seed();
    graph.containerError.add(3);
    const a = await schedule();
    await run(a);
    expect(att(a.id).status).toBe("FAILED");
    expect(graph.published).toEqual([]);
    expect(item().status).toBe("APPROVED");
  });

  it("a personal account's refusal says stories need a Business account", async () => {
    seed();
    graph.refuseCreate = "The user is not an Instagram Business account";
    const a = await schedule();
    await run(a);
    expect(att(a.id)).toMatchObject({ status: "FAILED", error: expect.stringContaining("only lets business accounts post stories") });
    expect(att(a.id).target.errorCode).toBe("story.businessOnly");
  });

  it("an unknown answer on frame 3: PENDING_VERIFY naming the frame, then settled, then the rest goes out once", async () => {
    seed();
    graph.unknownPublish.add(2);
    const a = await schedule();
    await run(a);
    expect(att(a.id)).toMatchObject({ status: "PENDING_VERIFY", error: "Frames 1–2 were posted; we couldn't confirm frame 3. Check the account." });
    expect(item().status).toBe("SCHEDULED");
    graph.unknownPublish.clear();

    await settleFrame(ref(a.id, { frame: 2, appeared: false }));
    expect(att(a.id).status).toBe("PARTIAL");
    const next = await postRest(ref(a.id));
    await run(next);
    expect(att(next.id).status).toBe("PUBLISHED");
    expect(item().status).toBe("PUBLISHED");
    expect(graph.published).toEqual([0, 1, 2, 3]);
    noFramePostedTwice();
  });

  it("settling the unconfirmed frame as posted completes a story whose last frame it was", async () => {
    seed(3);
    graph.unknownPublish.add(2);
    const a = await schedule();
    await run(a);
    await settleFrame(ref(a.id, { frame: 2, appeared: true }));
    expect(att(a.id)).toMatchObject({ status: "PUBLISHED", externalId: "m0" });
    expect(item().status).toBe("PUBLISHED");
    await expect(settleFrame(ref(a.id, { frame: 2, appeared: true }))).rejects.toMatchObject({ status: 409, code: "story.alreadyHandled" });
  });

  it("the whole-item posted / not-posted settle refuses stories", async () => {
    seed();
    graph.unknownPublish.add(1);
    const a = await schedule();
    await run(a);
    for (const action of ["posted", "not-posted"] as const) {
      await expect(settlePublication({ ...scope, userId: "u1", itemId: "s1", attemptId: a.id, action })).rejects.toMatchObject({ code: "story.settleFrame" });
    }
    expect(att(a.id).status).toBe("PENDING_VERIFY");
  });
});

describe("a lost story job", () => {
  it("decides from the row read under the lock: a frame stored as publishing just before it is in doubt", async () => {
    seed();
    db.attempts.push({ id: "a9", ...scope, contentItemId: "s1", contentVersionId: "v1", connectionId: "c1", createdByUserId: "u1", status: "PUBLISHING", target: { story: true, frames: 4, progress: [{ i: 0, state: "published", mediaId: "m0" }] } });
    db.onRowLock = () => { att("a9").target.progress.push({ i: 1, state: "publishing" }); };
    await onPublishJobLost({ attemptId: "a9" });
    expect(att("a9")).toMatchObject({ status: "PENDING_VERIFY", error: "Frame 1 was posted; we couldn't confirm frame 2. Check the account." });
  });

  it("decides from the row read under the lock: a frame published since the first read leaves nothing stuck", async () => {
    seed();
    db.attempts.push({ id: "a9", ...scope, contentItemId: "s1", contentVersionId: "v1", connectionId: "c1", createdByUserId: "u1", status: "PUBLISHING", target: { story: true, frames: 4, progress: [{ i: 0, state: "published", mediaId: "m0" }, { i: 1, state: "publishing" }] } });
    db.onRowLock = () => { att("a9").target.progress[1] = { i: 1, state: "published", mediaId: "m1" }; };
    await onPublishJobLost({ attemptId: "a9" });
    expect(att("a9")).toMatchObject({ status: "PARTIAL", error: "Publishing stopped midway. 2 of 4 frames are posted." });
    expect(item().status).toBe("SCHEDULED");
  });

  it("with every frame out: PUBLISHED with frame 1's id, item PUBLISHED", async () => {
    seed();
    db.attempts.push({ id: "a9", ...scope, contentItemId: "s1", contentVersionId: "v1", connectionId: "c1", createdByUserId: "u1", status: "PUBLISHING", target: { story: true, frames: 2, progress: [{ i: 0, state: "published", mediaId: "m0" }, { i: 1, state: "published", mediaId: "m1" }] } });
    await onPublishJobLost({ attemptId: "a9" });
    expect(att("a9")).toMatchObject({ status: "PUBLISHED", externalId: "m0", externalUrl: null, error: null });
    expect(item().status).toBe("PUBLISHED");
  });

  const publishing = (progress: FrameProgress) => {
    seed();
    db.attempts.push({ id: "a9", ...scope, contentItemId: "s1", contentVersionId: "v1", connectionId: "c1", createdByUserId: "u1", status: "PUBLISHING", target: { story: true, frames: 4, progress } });
  };
  it("with a frame in flight: PENDING_VERIFY naming it", async () => {
    publishing([{ i: 0, state: "published", mediaId: "m0" }, { i: 1, state: "publishing" }]);
    await onPublishJobLost({ attemptId: "a9" });
    expect(att("a9")).toMatchObject({ status: "PENDING_VERIFY", error: "Frame 1 was posted; we couldn't confirm frame 2. Check the account." });
  });
  it("with nothing in flight: what was recorded is what's out", async () => {
    publishing([{ i: 0, state: "published", mediaId: "m0" }]);
    await onPublishJobLost({ attemptId: "a9" });
    expect(att("a9").status).toBe("PARTIAL");
    expect(item().status).toBe("SCHEDULED");
  });
  it("a worker still running after the handler settled it can't post a frame or overwrite the outcome", async () => {
    seed();
    const a = await schedule();
    // The handler fires while the run is between phase 1 and phase 2 (here: while it reads the daily limit).
    graph.onLimit = () => onPublishJobLost({ attemptId: a.id });
    await run(a);
    expect(graph.published).toEqual([]);
    expect(att(a.id)).toMatchObject({ status: "FAILED", error: "Publishing stopped midway. Nothing was posted." });
  });
});

describe("post the rest and mark as done", () => {
  it("double tap: one new attempt, the other is told it was handled", async () => {
    seed();
    const a = await partlyPosted();
    const results = await Promise.allSettled([postRest(ref(a.id)), postRest(ref(a.id))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409, code: "story.alreadyHandled" } });
    expect(db.attempts).toHaveLength(2);
    expect(att(a.id).status).toBe("CANCELLED");
  });

  it("a follow-up stopped by the daily limit ends PARTIAL; a third try posts only the missing frames", async () => {
    seed();
    const a = await partlyPosted();
    graph.created = [];
    graph.quota.quota_usage = 99;
    const second = await postRest(ref(a.id));
    expect(att(second.id).target.progress.map((f: Row) => f.i)).toEqual([0, 1]);
    await run(second);
    expect(att(second.id)).toMatchObject({ status: "PARTIAL", error: expect.stringContaining("room for 1 of 2 frames") });
    expect(att(second.id).target.errorCode).toBe("story.dailyLimit");
    expect(item().status).toBe("SCHEDULED");
    expect(graph.created).toEqual([]);

    graph.quota.quota_usage = 0;
    const third = await postRest(ref(second.id));
    await run(third);
    expect(graph.created.sort()).toEqual([2, 3]);
    // Frame 1's id and link, though this attempt only posted frames 3–4.
    expect(att(third.id)).toMatchObject({ status: "PUBLISHED", externalId: "m0", externalUrl: "https://www.instagram.com/stories/shop/m0/" });
    expect(item().status).toBe("PUBLISHED");
    noFramePostedTwice();
  });

  it("frames older than 24 h need a confirmation; without it nothing changes", async () => {
    seed();
    const a = await partlyPosted();
    att(a.id).target.progress.forEach((f: Row) => { if (f.at) f.at = new Date(Date.now() - 25 * 3_600_000).toISOString(); });
    const before = JSON.stringify(db.attempts);
    await expect(postRest(ref(a.id))).rejects.toMatchObject({ status: 409, code: "story.expiredConfirm", message: "Frames 1–2 have expired. Posting the rest makes a story of 2 frames." });
    expect(JSON.stringify(db.attempts)).toBe(before);
    expect(db.jobs).toHaveLength(1);
    await postRest(ref(a.id, { confirm: true }));
    expect(db.attempts).toHaveLength(2);
  });

  it("cancelling a scheduled follow-up goes back to the partly posted story", async () => {
    seed();
    const a = await partlyPosted();
    const next = await postRest(ref(a.id));
    await settlePublication({ ...scope, userId: "u1", itemId: "s1", attemptId: next.id, action: "cancel" });
    expect(att(next.id).status).toBe("PARTIAL");
    expect(item().status).toBe("SCHEDULED");
    await run(next); // its job finds nothing to do
    expect(graph.published).toEqual([0, 1]);
  });

  it("mark as done: attempt CANCELLED, item PUBLISHED, audited with the counts", async () => {
    seed();
    const a = await partlyPosted();
    await markDone(ref(a.id));
    expect(att(a.id).status).toBe("CANCELLED");
    expect(item().status).toBe("PUBLISHED");
    expect(db.audits.at(-1)).toMatchObject({ action: "content.publish.partial-done", metadata: { posted: 2, total: 4 } });
    await expect(markDone(ref(a.id))).rejects.toMatchObject({ code: "story.alreadyHandled" });
  });

  it("another item's or another brand's attempt is 404 for post the rest, mark as done and settle", async () => {
    seed();
    const a = await partlyPosted();
    db.items.push({ id: "s2", ...scope, channel: "INSTAGRAM_STORY", status: "SCHEDULED" });
    const calls = (over: Row) => [postRest(ref(a.id, over)), markDone(ref(a.id, over)), settleFrame(ref(a.id, { frame: 2, appeared: true, ...over }))];
    for (const p of [...calls({ itemId: "s2" }), ...calls({ brandId: "b2" })]) await expect(p).rejects.toMatchObject({ status: 404 });
    expect(att(a.id).status).toBe("PARTIAL");
  });

  it("the route's postRest needs publish.execute, is scoped, kicks the runner, and returns the expired count as data", async () => {
    seed();
    const a = await partlyPosted();
    const req = (b: object) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });
    const params = { params: Promise.resolve({ workspaceId: "w1", brandId: "b1", contentId: "s1" }) };
    vi.mocked(kickRunner).mockClear();
    db.attempts.push({ id: "other", ...scope, contentItemId: "s2", status: "PARTIAL", target: { story: true, frames: 4, progress: [] } });
    const foreign = await POST(req({ action: "postRest", attemptId: "other" }), params);
    expect(foreign.status).toBe(404);
    expect(vi.mocked(authorizeBrandRoute)).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), "publish.execute");
    expect(kickRunner).not.toHaveBeenCalled();

    att(a.id).target.progress.forEach((f: Row) => { if (f.at) f.at = new Date(Date.now() - 25 * 3_600_000).toISOString(); });
    const expired = await POST(req({ action: "postRest", attemptId: a.id }), params);
    expect(expired.status).toBe(409);
    expect(await expired.json()).toMatchObject({ code: "story.expiredConfirm", expiredFrames: 2, remainingFrames: 2 });
    expect(kickRunner).not.toHaveBeenCalled();

    const ok = await POST(req({ action: "postRest", attemptId: a.id, confirm: true }), params);
    expect(ok.status).toBe(200);
    expect(kickRunner).toHaveBeenCalledTimes(1);
    expect(db.attempts.filter((x) => x.contentItemId === "s1")).toHaveLength(2);
  });

  it("the route runs them with their codes", async () => {
    seed();
    const a = await partlyPosted();
    const req = (b: object) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });
    const params = { params: Promise.resolve({ workspaceId: "w1", brandId: "b1", contentId: "s1" }) };
    const res = await POST(req({ action: "markDone", attemptId: "nope" }), params);
    expect(res.status).toBe(404);
    const settle = await POST(req({ action: "settleFrame", attemptId: a.id, frame: 2, appeared: true }), params);
    expect(settle.status).toBe(409);
    expect((await settle.json()).code).toBe("story.alreadyHandled");
  });
});

describe("leaving APPROVED", () => {
  it("a send-back of an approved by-hand story ends Post by hand", async () => {
    seed(4, { byHand: true, scheduledFor: new Date("2026-11-20T10:00:00Z") });
    await decide({ ...scope, userId: "boss", itemId: "s1", version: 1, verdict: "CHANGES_REQUESTED", note: "Frame 2 is blurry" });
    expect(item()).toMatchObject({ status: "DRAFT_REVIEW", byHand: false });
  });
});
