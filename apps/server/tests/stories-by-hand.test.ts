import { beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";

type Row = Record<string, any>;
const db = vi.hoisted(() => ({ items: [] as Row[], versions: [] as Row[], decisions: [] as Row[], attempts: [] as Row[], conns: [] as Row[], audits: [] as Row[], n: 0, hits: 0 }));
const offer = vi.hoisted(() => ({ issue: null as null | { refuses: boolean; message: string } }));

vi.mock("@/server/db/prisma", () => {
  const match = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => v === undefined || (v && typeof v === "object" && !(v instanceof Date) && "lte" in v ? row[k] != null && row[k] <= v.lte : row[k] === v));
  const copy = <T,>(x: T): T => (x == null ? x : structuredClone(x));
  const withLatest = (i: Row) => {
    const latest = db.versions.filter((v) => v.contentItemId === i.id).sort((a, b) => b.version - a.version)[0];
    return copy({ ...i, versions: latest ? [{ ...latest, checks: [{ overall: "PASS", results: [] }] }] : [] });
  };
  const prisma: Row = {
    $executeRaw: async () => 0,
    contentItem: {
      findFirst: async ({ where }: Row) => { const i = db.items.find((r) => match(r, where)); return i ? withLatest(i) : null; },
      findMany: async ({ where }: Row) => db.items.filter((r) => match(r, where)).map(withLatest),
      update: async ({ where, data }: Row) => copy(Object.assign(db.items.find((i) => i.id === where.id)!, copy(data))),
    },
    approvalDecision: { findFirst: async ({ where }: Row) => copy(db.decisions.filter((d) => match(d, where)).at(-1) ?? null), findMany: async ({ where }: Row) => copy(db.decisions.filter((d) => match(d, where))) },
    auditEvent: { create: async ({ data }: Row) => { db.audits.push(copy(data)); return {}; } },
    publicationAttempt: { findFirst: async ({ where }: Row) => copy(db.attempts.find((a) => match(a, where)) ?? null), findMany: async ({ where }: Row) => copy(db.attempts.filter((a) => match(a, where))) },
    integrationConnection: { findFirst: async ({ where }: Row) => copy(db.conns.find((c) => match(c, where)) ?? null), findMany: async ({ where }: Row) => copy(db.conns.filter((c) => match(c, where))) },
    user: { findMany: async () => [] },
  };
  prisma.$transaction = async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: Row) => unknown)(prisma) : Promise.all(arg as unknown[]));
  return { prisma };
});
vi.mock("@/server/catalog/linked", () => ({ linkedProducts: vi.fn(async () => []) }));
vi.mock("@/server/catalog/campaigns", () => ({ campaignsById: vi.fn(async () => ({ campaigns: new Map(), timeZone: "UTC" })) }));
vi.mock("@/server/storage/media", async (orig) => ({ ...(await orig<object>()), signedMediaUrl: vi.fn(async (k: string) => `https://signed.example/${k}`) }));
vi.mock("@/server/api/brand-route", () => ({ authorizeBrandRoute: vi.fn(async () => ({ workspaceId: "w1", brandId: "b1", userId: "u1" })) }));
vi.mock("@/server/auth/rate-limit", () => ({ hitRateLimit: vi.fn(async () => ({ allowed: ++db.hits <= 20, count: db.hits })) }));
vi.mock("@/server/agents/engine", () => ({ startAgentRun: vi.fn(async () => ({})) }));
vi.mock("@/server/jobs/runner", () => ({ kickRunner: vi.fn() }));
vi.mock("@/server/services/automations", () => ({ autoPublish: vi.fn() }));
vi.mock("@/server/services/connections", () => ({ accessToken: vi.fn(async () => "tok") }));
vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(new TextEncoder().encode(`bytes of ${url}`))));
vi.mock("@/server/stories/service", async (orig) => ({ ...(await orig<object>()), storyView: vi.fn(async () => ({ rendering: false })) }));
vi.mock("@/server/services/publishing", async (orig) => {
  const real = await orig<typeof import("@/server/services/publishing")>();
  return { ...real, productGate: vi.fn(async () => (offer.issue ? [offer.issue] : [])) };
});

import { authorizeBrandRoute } from "@/server/api/brand-route";
import { problemResponse } from "@/server/api/http-error";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { packageHash } from "@/server/services/publishing";
import { registerManualPost } from "@/server/services/manual-post";
import { checkStoryLink, dueByHand, setByHand, STORY_LINK, storyPackage } from "@/server/stories/by-hand";
import { GET as packageRoute } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/stories/[contentId]/package/route";
import { GET as contentGet, POST as contentPost } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/[contentId]/route";
import { GET as dueRoute } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/stories/due/route";

const scope = { workspaceId: "w1", brandId: "b1" };
const user = { ...scope, userId: "u1" };
const body = (n: number, rendered = true) => ({
  frames: Array.from({ length: n }, (_, i) => ({ label: "", headline: `H${i}`, body: "", mediaKind: "photo", ...(rendered ? { renderedKey: `w1/b1/stories/f${i}.jpg` } : {}) })),
  cta: "Shop now", link: "https://shop.example/p", hook: "H0", productIds: [], brandMark: false,
});
function seed(over: Row = {}, id = "s1", b: object = body(3)) {
  db.items.push({ id, ...scope, channel: "INSTAGRAM_STORY", status: "APPROVED", studio: false, title: "Story", productIds: [], byHand: true, scheduledFor: new Date("2026-01-01"), postUrl: null, ...over });
  db.versions.push({ id: `v-${id}`, contentItemId: id, version: 1, body: b });
  db.decisions.push({ id: `d-${id}`, contentItemId: id, verdict: "APPROVED", contentVersionId: `v-${id}`, packageHash: packageHash({ id, channel: over.channel ?? "INSTAGRAM_STORY" }, { id: `v-${id}`, body: b }), productOverride: null });
}
const item = (id = "s1") => db.items.find((i) => i.id === id)!;
const ctx = () => ({ params: Promise.resolve({ ...scope, contentId: "s1" }) });
const req = (qs = "") => new Request(`http://x/api${qs}`);

beforeEach(() => {
  Object.assign(db, { items: [], versions: [], decisions: [], attempts: [], conns: [], audits: [], n: 0, hits: 0 });
  offer.issue = null;
  vi.mocked(authorizeBrandRoute).mockClear();
});

describe("STORY_LINK", () => {
  const good = "https://www.instagram.com/stories/boisetchiffons/3361234567890123456/";
  it("accepts a story link, with or without a query", async () => {
    expect(STORY_LINK.test(good)).toBe(true);
    await expect(checkStoryLink(scope, good)).resolves.toBe(good);
    await expect(checkStoryLink(scope, `${good}?igsh=x`)).resolves.toBe(good);
  });
  it.each(["http://www.instagram.com/stories/a/3361234567890123456/", "https://www.instagram.com/p/abc123/"])("refuses %s", async (u) => {
    await expect(checkStoryLink(scope, u)).rejects.toMatchObject({ status: 400 });
  });
  it("refuses a 301-character URL", async () => {
    await expect(checkStoryLink(scope, `${good}?${"a".repeat(301 - good.length - 1)}`)).rejects.toMatchObject({ status: 400 });
  });
  it("accepts the handle of any active Instagram connection of the brand", async () => {
    db.conns.push({ brandId: "b1", provider: "INSTAGRAM", status: "ACTIVE", displayName: "@first" }, { brandId: "b1", provider: "INSTAGRAM", status: "ACTIVE", displayName: "@boisetchiffons" });
    await expect(checkStoryLink(scope, good)).resolves.toBe(good);
  });
  it("refuses another account's handle when connected, and matches its own case-insensitively", async () => {
    db.conns.push({ brandId: "b1", provider: "INSTAGRAM", status: "ACTIVE", displayName: "@BoiseTchiffons" });
    await expect(checkStoryLink(scope, good)).resolves.toBe(good);
    await expect(checkStoryLink(scope, good.replace("boisetchiffons", "someoneelse"))).rejects.toMatchObject({ status: 400, code: "story.linkAccount" });
  });
});

describe("setByHand and dueByHand", () => {
  it("lists a due approved story, and drops it after a new version or after byHand clears", async () => {
    seed();
    const due = await dueByHand(scope, new Date("2026-06-01"));
    expect(due).toEqual([{ id: "s1", title: "Story", scheduledFor: new Date("2026-01-01"), firstFrameUrl: "https://signed.example/w1/b1/stories/f0.jpg" }]);
    expect(await dueByHand(scope, new Date("2025-06-01"))).toEqual([]);
    db.versions.push({ id: "v2", contentItemId: "s1", version: 2, body: body(3) });
    expect(await dueByHand(scope, new Date("2026-06-01"))).toEqual([]);
    db.versions.pop();
    await setByHand(user, "s1", null);
    expect(item()).toMatchObject({ byHand: false, scheduledFor: new Date("2026-01-01") });
    expect(await dueByHand(scope, new Date("2026-06-01"))).toEqual([]);
  });
  it("sets byHand and the time on an approved story", async () => {
    seed({ byHand: false, scheduledFor: null });
    const at = new Date("2026-07-01T10:00:00Z");
    await setByHand(user, "s1", at);
    expect(item()).toMatchObject({ byHand: true, scheduledFor: at });
  });
  it("refuses while a schedule is booked", async () => {
    seed({ byHand: false, status: "SCHEDULED" });
    db.attempts.push({ id: "a1", contentItemId: "s1", status: "SCHEDULED" });
    await expect(setByHand(user, "s1", new Date())).rejects.toMatchObject({ code: "story.cancelScheduledFirst" });
  });
  it("does not see another brand's story", async () => {
    seed({ brandId: "other" });
    await expect(setByHand(user, "s1", new Date())).rejects.toMatchObject({ status: 404 });
  });
  it("the due route needs publish.execute on every request", async () => {
    vi.mocked(authorizeBrandRoute).mockResolvedValueOnce(problemResponse({ type: "x", title: "Forbidden", status: 403 }) as never);
    const res = await dueRoute(req(), ctx());
    expect(res.status).toBe(403);
    expect(authorizeBrandRoute).toHaveBeenCalledWith(expect.anything(), expect.anything(), "publish.execute");
    seed();
    const ok = await dueRoute(req(), ctx());
    expect(ok.status).toBe(200);
    expect((await ok.json()).items).toHaveLength(1);
  });
});

describe("storyPackage", () => {
  it("returns the frames and link", async () => {
    seed();
    const p = await storyPackage(user, "s1");
    expect(p.frames).toEqual([1, 2, 3].map((n) => ({ n, url: `https://signed.example/w1/b1/stories/f${n - 1}.jpg`, kind: "photo" })));
    expect(p.link).toBe("https://shop.example/p");
  });
  it("refuses an ended offer with the gate's message", async () => {
    seed();
    offer.issue = { refuses: true, message: "The offer has ended" };
    await expect(storyPackage(user, "s1")).rejects.toMatchObject({ status: 409, code: "story.gate", message: "The offer has ended" });
  });
  it("is 404 for another brand's story", async () => {
    seed({ brandId: "other" });
    await expect(storyPackage(user, "s1")).rejects.toMatchObject({ status: 404 });
  });
  it("refuses a frame without its finished picture", async () => {
    seed({}, "s1", body(3, false));
    await expect(storyPackage(user, "s1")).rejects.toMatchObject({ status: 409, code: "story.framesNotReady" });
  });
  it("refuses a story whose approval no longer holds", async () => {
    seed();
    db.decisions.length = 0;
    await expect(storyPackage(user, "s1")).rejects.toMatchObject({ status: 409 });
  });
});

describe("package route", () => {
  it("answers JSON with no-store and audits the download", async () => {
    seed();
    const res = await packageRoute(req(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(hitRateLimit).toHaveBeenCalledWith("story-package:u1", 20, 3600_000);
    expect((await res.json()).frames).toHaveLength(3);
    expect(db.audits.map((a) => a.action)).toEqual(["content.package.download"]);
  });
  it("streams a zip of frame files and steps.txt with the link", async () => {
    seed();
    const res = await packageRoute(req("?format=zip"), ctx());
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="story-s1.zip"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["frame-1.jpg", "frame-2.jpg", "frame-3.jpg", "steps.txt"]);
    expect(new TextDecoder().decode(files["frame-2.jpg"])).toBe("bytes of https://signed.example/w1/b1/stories/f1.jpg");
    expect(new TextDecoder().decode(files["steps.txt"])).toContain("Link: https://shop.example/p");
    expect(new TextDecoder().decode(files["steps.txt"])).toContain("1. Unzip the download");
  });
  it("answers 429 for the 21st package in an hour", async () => {
    seed();
    for (let i = 0; i < 20; i++) expect((await packageRoute(req(), ctx())).status).toBe(200);
    expect((await packageRoute(req(), ctx())).status).toBe(429);
  });
});

describe("registerManualPost", () => {
  it("publishes an approved story with no URL and clears byHand", async () => {
    seed();
    await registerManualPost(user, "s1", undefined, "story");
    expect(item()).toMatchObject({ status: "PUBLISHED", byHand: false });
    expect(db.audits.at(-1)).toMatchObject({ action: "content.publish.manual" });
  });
  it("keeps a valid story link without its query, and audits it", async () => {
    seed();
    await registerManualPost(user, "s1", "https://www.instagram.com/stories/shop/12345/?igsh=x", "story");
    expect(item()).toMatchObject({ status: "PUBLISHED", byHand: false, postUrl: "https://www.instagram.com/stories/shop/12345/" });
    expect(db.audits.at(-1)).toMatchObject({ metadata: { kind: "story", url: "https://www.instagram.com/stories/shop/12345/" } });
  });
  it("refuses a bad story link and leaves the story approved", async () => {
    seed();
    await expect(registerManualPost(user, "s1", "https://www.instagram.com/p/abc/", "story")).rejects.toMatchObject({ status: 400, code: "story.linkInvalid" });
    expect(item().status).toBe("APPROVED");
  });
  it("refuses a story whose approval no longer holds", async () => {
    seed();
    db.decisions.length = 0;
    await expect(registerManualPost(user, "s1", undefined, "story")).rejects.toMatchObject({ status: 409 });
  });
  it("still needs a reel's URL", async () => {
    seed({ channel: "INSTAGRAM_REEL", studio: true });
    await expect(registerManualPost(user, "s1", undefined, "reel")).rejects.toMatchObject({ status: 400 });
    await expect(registerManualPost(user, "s1", "https://www.instagram.com/reel/abc/", "reel")).resolves.toBeUndefined();
    expect(item()).toMatchObject({ status: "PUBLISHED", postUrl: "https://www.instagram.com/reel/abc/" });
  });
});

const post = (b: object) => contentPost(new Request("http://x/api", { method: "POST", body: JSON.stringify(b) }), ctx());

describe("content route: by hand", () => {
  it("byHand sets the flag with publish.execute", async () => {
    seed({ byHand: false, scheduledFor: null });
    const res = await post({ action: "byHand", at: "2026-07-01T10:00:00Z" });
    expect(res.status).toBe(200);
    expect(authorizeBrandRoute).toHaveBeenCalledWith(expect.anything(), expect.anything(), "publish.execute");
    expect(item()).toMatchObject({ byHand: true, scheduledFor: new Date("2026-07-01T10:00:00Z") });
    const state = await res.json();
    expect(state).toMatchObject({ byHand: true, scheduledFor: "2026-07-01T10:00:00.000Z" });
  });
  it("byHand without permission is refused", async () => {
    seed({ byHand: false });
    vi.mocked(authorizeBrandRoute).mockResolvedValueOnce(problemResponse({ type: "x", title: "Forbidden", status: 403 }) as never);
    expect((await post({ action: "byHand", at: null })).status).toBe(403);
    expect(item().byHand).toBe(false);
  });
  it("GET returns byHand and scheduledFor", async () => {
    seed();
    const res = await contentGet(req(), ctx());
    expect(await res.json()).toMatchObject({ byHand: true, scheduledFor: "2026-01-01T00:00:00.000Z" });
  });
  it("postedByHand stores a good link, and uses publish.execute", async () => {
    seed();
    const res = await post({ action: "postedByHand", url: "https://www.instagram.com/stories/shop/12345/" });
    expect(res.status).toBe(200);
    expect(authorizeBrandRoute).toHaveBeenCalledWith(expect.anything(), expect.anything(), "publish.execute");
    expect(item()).toMatchObject({ status: "PUBLISHED", byHand: false, postUrl: "https://www.instagram.com/stories/shop/12345/" });
  });
  it("postedByHand: bad link 400 story.linkInvalid, other account 400 story.linkAccount", async () => {
    seed();
    const bad = await post({ action: "postedByHand", url: "https://www.instagram.com/p/abc/" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("story.linkInvalid");
    db.conns.push({ brandId: "b1", provider: "INSTAGRAM", status: "ACTIVE", displayName: "@shop" });
    const other = await post({ action: "postedByHand", url: "https://www.instagram.com/stories/elsewhere/12345/" });
    expect(other.status).toBe(400);
    expect((await other.json()).code).toBe("story.linkAccount");
    expect(item().status).toBe("APPROVED");
  });
});
