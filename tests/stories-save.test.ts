import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
const db = vi.hoisted(() => ({ checked: null as Row | null, item: null as Row | null, versions: [] as Row[], attempts: [] as Row[], profile: null as Row | null, uploads: [] as Row[], limits: new Map<string, number>() }));
const m = vi.hoisted(() => ({ resolve: vi.fn(), photo: vi.fn(), clip: vi.fn(), enqueue: vi.fn(), refund: vi.fn(), start: vi.fn(), get: vi.fn(), jobFind: vi.fn(), authorize: vi.fn(), kick: vi.fn() }));

vi.mock("@/server/db/prisma", () => {
  const mine = () => db.versions.filter((v) => v.contentItemId === db.item?.id).sort((a, b) => b.version - a.version);
  const prisma: Row = {
    contentItem: {
      findFirst: vi.fn(async ({ where }: Row) => {
        const i = db.item;
        if (!i || where.id !== i.id || where.workspaceId !== i.workspaceId || where.brandId !== i.brandId) return null;
        return { ...i, versions: mine().slice(0, 1).map((v) => ({ ...v, checks: [] })) };
      }),
      update: vi.fn(async ({ data }: Row) => Object.assign(db.item!, data)),
      create: vi.fn(async ({ data }: Row) => ({ id: "copy1", ...data })),
      delete: vi.fn(async () => ({})),
    },
    contentVersion: {
      create: vi.fn(async ({ data }: Row) => {
        const v = { id: `v${data.version}`, createdAt: new Date(), ...data };
        db.versions.push(v);
        return v;
      }),
      findFirst: vi.fn(async () => mine()[0] ?? null),
    },
    auditEvent: { create: vi.fn(async () => ({})) },
    qualityCheck: { findFirst: vi.fn(async () => db.checked) },
    job: { findFirst: m.jobFind },
    publicationAttempt: { findMany: vi.fn(async () => db.attempts) },
    brandProfile: { findFirst: vi.fn(async () => db.profile) },
    mediaUpload: {
      findMany: vi.fn(async ({ where }: Row) => db.uploads.filter((u) => u.workspaceId === where.workspaceId && u.brandId === where.brandId && where.key.in.includes(u.key))),
    },
    $executeRaw: vi.fn(async () => 0),
  };
  prisma.$transaction = async (fn: (tx: Row) => unknown) => fn(prisma);
  return { prisma };
});
vi.mock("@/server/auth/rate-limit", () => ({
  hitRateLimit: vi.fn(async (key: string, limit: number) => {
    const n = (db.limits.get(key) ?? 0) + 1;
    db.limits.set(key, n);
    return { allowed: n <= limit, count: n };
  }),
}));
vi.mock("@/server/stories/sources", () => ({ resolveSource: m.resolve }));
vi.mock("@/server/stories/render", async (orig) => ({ ...(await orig<object>()), renderPhotoFrame: m.photo, renderClipFrame: m.clip }));
vi.mock("@/server/jobs/queue", async (orig) => ({ ...(await orig<object>()), enqueueJob: m.enqueue }));
vi.mock("@/server/services/credits", async (orig) => ({ ...(await orig<object>()), refundCharge: m.refund }));
vi.mock("@/server/agents/engine", async (orig) => ({ ...(await orig<object>()), startAgentRun: m.start }));
vi.mock("@/server/storage/media", async (orig) => ({ ...(await orig<object>()), getMediaBytes: m.get, signedMediaUrl: async (k: string) => `https://signed/${k}` }));

vi.mock("@/server/api/brand-route", () => ({ authorizeBrandRoute: m.authorize }));
vi.mock("@/server/jobs/runner", () => ({ kickRunner: m.kick }));
vi.mock("@/server/services/publishing", async (orig) => ({
  ...(await orig<object>()), postAiAllowed: async () => true, releaseState: async () => ({ latestVersion: db.versions.length, requirements: { frames: [3, 5] } }),
}));

import { prisma } from "@/server/db/prisma";
import { POST } from "@/app/api/v1/workspaces/[workspaceId]/brands/[brandId]/content/[contentId]/route";
import { saveDraft } from "@/server/services/publishing";
import { createStoryVersion, deleteStory, duplicateStory, onStoryRenderFailure, runStoryRender, saveStoryVersion, STORY_RENDER_JOB, storyRenderState, storyTab, storyView } from "@/server/stories/service";
import type { StoryInput } from "@/server/stories/body";

const scope = { workspaceId: "w1", brandId: "b1", userId: "u1" };
const person = { kind: "person", userId: "u1" } as const;
const agent = { kind: "agent", runId: "r1", model: "gpt", chargeId: "c1" } as const;
const frame = (id: string, o: object = {}) => ({ source: { kind: "upload" as const, id }, label: "New", headline: `Headline ${id}`, body: "Body", ...o });
const input = (frames = [frame("p1"), frame("p2"), frame("p3")]): StoryInput => ({ frames, cta: "Shop now", link: "https://shop.test/x", brandMark: false });
const p = prisma as unknown as Row;

beforeEach(() => {
  vi.clearAllMocks();
  db.item = { id: "i1", workspaceId: "w1", brandId: "b1", channel: "INSTAGRAM_STORY", status: "DRAFT_REVIEW", byHand: false, productIds: ["prod1"], opportunityId: "o1", title: "Story" };
  db.checked = null;
  db.versions = [];
  db.attempts = [];
  db.uploads = [];
  db.profile = { locales: ["fr"], assets: null };
  db.limits = new Map();
  m.resolve.mockImplementation(async (_s: unknown, ref: { id: string }) => ({
    mediaKey: `w1/b1/uploads/${ref.id}.${ref.id.startsWith("c") ? "mp4" : "jpg"}`, mediaKind: ref.id.startsWith("c") ? "video" : "photo", aiMark: false, rights: { kind: "owned" },
    ...(ref.id.startsWith("c") ? { durationSec: 20 } : {}),
  }));
  m.photo.mockImplementation(async (f: { mediaKey: string }) => ({ key: `w1/b1/stories/${f.mediaKey.split("/").pop()}.jpg`, file: { width: 1080, height: 1920, bytes: 10 } }));
  m.clip.mockImplementation(async (f: { mediaKey: string }) => ({ key: `w1/b1/stories/${f.mediaKey.split("/").pop()}.mp4`, file: { width: 1080, height: 1920, bytes: 10, durationSec: 15 } }));
  m.enqueue.mockImplementation(async (j: unknown) => j);
  m.start.mockResolvedValue({ id: "run" });
  m.refund.mockResolvedValue(true);
  m.jobFind.mockReset().mockResolvedValue(null);
});

describe("saveStoryVersion, photos only", () => {
  it("renders now and saves a version in review, clearing by-hand; client server fields never reach the version", async () => {
    db.item!.byHand = true; // left over from an earlier approval: a draft's save clears it
    const sneaky = input([frame("p1", { renderedKey: "w9/b9/stories/evil.jpg", mediaKey: "w9/b9/evil.jpg", file: { width: 1, height: 1, bytes: 1 } }), frame("p2"), frame("p3")]);
    const r = await saveStoryVersion(scope, "i1", 0, sneaky, person);
    expect(r).toEqual({ status: "saved", version: 1 });
    const body = db.versions[0].body;
    expect(body.frames[0].renderedKey).toBe("w1/b1/stories/p1.jpg.jpg");
    expect(body.frames[0].mediaKey).toBe("w1/b1/uploads/p1.jpg");
    expect(JSON.stringify(body)).not.toContain("w9/");
    // The renderer only ever sees the resolved key.
    expect(m.photo.mock.calls[0][0].mediaKey).toBe("w1/b1/uploads/p1.jpg");
    expect(body).toMatchObject({ hook: "Headline p1", productIds: ["prod1"], cta: "Shop now", link: "https://shop.test/x", brandMark: false });
    expect(db.item).toMatchObject({ status: "DRAFT_REVIEW", byHand: false });
    expect(db.versions[0].createdBy).toBe("u1");
    expect(m.enqueue).not.toHaveBeenCalled();
    expect(m.photo.mock.calls[2][1]).toMatchObject({ language: "fr", isLast: true, cta: "Shop now", n: 3, scope: { workspaceId: "w1", brandId: "b1" } });
  });

  it("refuses a stale base with 409 story.stale and saves nothing", async () => {
    db.versions.push({ id: "v1", contentItemId: "i1", version: 1, body: { productIds: [] }, createdAt: new Date() });
    await expect(saveStoryVersion(scope, "i1", 0, input(), person)).rejects.toMatchObject({ status: 409, code: "story.stale" });
    expect(db.versions).toHaveLength(1);
  });

  it.each(["SCHEDULED", "PUBLISHED"])("refuses a %s story with 409 story.notEditable", async (status) => {
    db.item!.status = status;
    await expect(saveStoryVersion(scope, "i1", 0, input(), person)).rejects.toMatchObject({ status: 409, code: "story.notEditable" });
    expect(db.versions).toHaveLength(0);
  });

  it("answers 404 for another brand's item", async () => {
    await expect(saveStoryVersion({ ...scope, brandId: "b2" }, "i1", 0, input(), person)).rejects.toMatchObject({ status: 404 });
    expect(m.resolve).not.toHaveBeenCalled();
  });

  it("names the frame and field that doesn't fit", async () => {
    const long = input([frame("p1"), frame("p2", { body: "WWWW ".repeat(24).trim()}), frame("p3")]);
    await expect(saveStoryVersion(scope, "i1", 0, long, person)).rejects.toMatchObject({ status: 400, code: "story.textFit", message: expect.stringMatching(/Frame 2.*body/) });
  });

  it("refuses a clip window that starts within half a second of the clip's end", async () => {
    await expect(saveStoryVersion(scope, "i1", 0, input([frame("p1"), frame("c1", { clip: { start: 19.6, sound: true } }), frame("p3")]), person)).rejects.toMatchObject({ status: 400, code: "story.clipWindow" });
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it("refuses the 31st render by one person in an hour with 429", async () => {
    for (let v = 0; v < 30; v++) await saveStoryVersion(scope, "i1", v, input(), person);
    await expect(saveStoryVersion(scope, "i1", 30, input(), person)).rejects.toMatchObject({ status: 429, code: "story.renderLimit" });
    expect(db.versions).toHaveLength(30);
  });

  it("counts agent saves toward the brand cap (and not a person's)", async () => {
    db.limits.set("story-render:brand:b1", 100);
    await expect(saveStoryVersion(scope, "i1", 0, input(), agent, { photosOnly: true })).rejects.toMatchObject({ status: 429, code: "story.renderLimit" });
    expect([...db.limits.keys()].some((k) => k.startsWith("story-render:user:"))).toBe(false);
    expect(m.resolve).not.toHaveBeenCalled();
  });

  it("passes photosOnly to the source lookup and records the agent on the version", async () => {
    await saveStoryVersion(scope, "i1", 0, input(), agent, { photosOnly: true });
    expect(m.resolve.mock.calls[0][2]).toEqual({ photosOnly: true });
    expect(db.versions[0]).toMatchObject({ createdBy: "agent", agentRunId: "r1", model: "gpt" });
  });

  it("passes the brand's own logo with an identity that changes with its bytes", async () => {
    db.profile = { locales: ["en"], assets: { logo: { key: "w1/b1/brand-logo.png" } } };
    m.get.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    await saveStoryVersion(scope, "i1", 0, { ...input(), brandMark: true }, person);
    const first = m.photo.mock.calls[0][1];
    m.get.mockResolvedValueOnce(new Uint8Array([4, 5, 6]));
    await saveStoryVersion(scope, "i1", 1, { ...input(), brandMark: true }, person);
    const second = m.photo.mock.calls[3][1];
    expect(first.logoKey).toBe("w1/b1/brand-logo.png");
    expect(first.logoTag).toBeTruthy();
    expect(second.logoTag).not.toBe(first.logoTag);
  });

  it("never passes another brand's logo", async () => {
    db.profile = { locales: ["en"], assets: { logo: { key: "w9/b9/brand-logo.png" } } };
    await saveStoryVersion(scope, "i1", 0, { ...input(), brandMark: true }, person);
    expect(m.photo.mock.calls[0][1].logoKey).toBeUndefined();
    expect(m.get).not.toHaveBeenCalled();
  });

  it("refuses a frame without a source, unless the agent asks to keep empty frames (kept unrendered)", async () => {
    const empty: StoryInput = { ...input(), frames: [frame("p1"), { label: "", headline: "Empty", body: "" }, frame("p3")] };
    await expect(saveStoryVersion(scope, "i1", 0, empty, person)).rejects.toMatchObject({ status: 400, code: "story.source" });
    const r = await saveStoryVersion(scope, "i1", 0, empty, agent, { photosOnly: true, keepEmpty: true });
    expect(r).toEqual({ status: "saved", version: 1 });
    expect(m.photo).toHaveBeenCalledTimes(2);
    const f = db.versions[0].body.frames[1];
    expect(f).toEqual({ label: "", headline: "Empty", body: "" });
  });
});

describe("saveStoryVersion with a clip, and the render job", () => {
  const withClip = () => input([frame("p1"), frame("c1", { clip: { start: 2, sound: false } }), frame("p3")]);

  it("queues the render with two attempts and saves no version yet", async () => {
    const r = await saveStoryVersion(scope, "i1", 0, withClip(), person);
    expect(r).toEqual({ status: "rendering" });
    expect(db.versions).toHaveLength(0);
    const job = m.enqueue.mock.calls[0][0];
    expect(job).toMatchObject({ type: STORY_RENDER_JOB, workspaceId: "w1", brandId: "b1", maxAttempts: 2 });
    expect(job.payload).toMatchObject({ itemId: "i1", baseVersion: 0, next: 0, cta: "Shop now", link: "https://shop.test/x", brandMark: false, actor: person });
    expect(job.payload.frames[1]).toMatchObject({ mediaKey: "w1/b1/uploads/c1.mp4", mediaKind: "video", clip: { start: 2, sound: false } });
  });

  async function runAll() {
    await saveStoryVersion(scope, "i1", 0, withClip(), person);
    let job = m.enqueue.mock.calls.at(-1)![0];
    for (;;) {
      const before = m.enqueue.mock.calls.length;
      await runStoryRender(job.payload);
      if (m.enqueue.mock.calls.length === before) return;
      job = m.enqueue.mock.calls.at(-1)![0];
    }
  }

  it("renders one clip per run, then the photos, then saves the version and starts Quality", async () => {
    await runAll();
    expect(m.clip).toHaveBeenCalledTimes(1);
    expect(m.photo).toHaveBeenCalledTimes(2);
    expect(m.enqueue.mock.calls[1][0].payload.next).toBe(2);
    expect(db.versions).toHaveLength(1);
    expect(db.versions[0].body.frames[1]).toMatchObject({ renderedKey: "w1/b1/stories/c1.mp4.mp4", file: { durationSec: 15 } });
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "quality", trigger: "event", input: { itemId: "i1", version: 1 } }));
  });

  it("gives the editor the clip's own source and its upright size, so it can trim and crop it", async () => {
    db.uploads = [
      { workspaceId: "w9", brandId: "b9", key: "w1/b1/uploads/c1.mp4", width: 1, height: 1 },
      { workspaceId: "w1", brandId: "b1", key: "w1/b1/uploads/c1.mp4", width: 1080, height: 1920 },
    ];
    await runAll();
    const view = await storyView(scope, "i1");
    expect(view.frames[1]).toMatchObject({ kind: "video", sourceUrl: "https://signed/w1/b1/uploads/c1.mp4", sourceSize: { width: 1080, height: 1920 } });
    expect(view.frames[0].sourceSize).toBeNull();
  });

  it("refuses with story.notEditable when the story is approved while the job runs", async () => {
    await saveStoryVersion(scope, "i1", 0, withClip(), person);
    const first = m.enqueue.mock.calls[0][0];
    await runStoryRender(first.payload);
    db.item!.status = "APPROVED";
    await expect(runStoryRender(m.enqueue.mock.calls[1][0].payload)).rejects.toMatchObject({ status: 409, code: "story.notEditable" });
    expect(db.versions).toHaveLength(0);
  });

  it("refuses with story.notEditable when the story is published while the job runs", async () => {
    await saveStoryVersion(scope, "i1", 0, withClip(), person);
    db.item!.status = "PUBLISHED";
    await expect(runStoryRender(m.enqueue.mock.calls[0][0].payload)).rejects.toMatchObject({ status: 409, code: "story.notEditable" });
    expect(m.clip).not.toHaveBeenCalled();
    expect(db.versions).toHaveLength(0);
  });

  it("still edits a story that was already approved when it was saved", async () => {
    db.item!.status = "APPROVED";
    await runAll();
    expect(db.versions).toHaveLength(1);
    expect(db.item).toMatchObject({ status: "DRAFT_REVIEW", byHand: false });
  });

  it("refuses to edit an approved story set to be posted by hand (its frames may be downloaded already)", async () => {
    Object.assign(db.item!, { status: "APPROVED", byHand: true });
    await expect(saveStoryVersion(scope, "i1", 0, input([frame("p1"), frame("p2"), frame("p3")]), person)).rejects.toMatchObject({ status: 409, code: "story.byHandOn" });
    expect(db.versions).toHaveLength(0);
    expect(m.photo).not.toHaveBeenCalled();
  });

  it("refuses with story.stale when someone saved while the job ran", async () => {
    await saveStoryVersion(scope, "i1", 0, withClip(), person);
    await runStoryRender(m.enqueue.mock.calls[0][0].payload);
    db.versions.push({ id: "v1", contentItemId: "i1", version: 1, body: { productIds: [] }, createdAt: new Date() });
    await expect(runStoryRender(m.enqueue.mock.calls[1][0].payload)).rejects.toMatchObject({ status: 409, code: "story.stale" });
    expect(db.versions).toHaveLength(1);
  });

  it("refunds an agent's charge once when the render finally fails, and not before", async () => {
    const payload = { workspaceId: "w1", brandId: "b1", itemId: "i1", actor: agent };
    await onStoryRenderFailure(payload, new Error("x"), false);
    expect(m.refund).not.toHaveBeenCalled();
    await onStoryRenderFailure(payload, new Error("x"), true);
    expect(m.refund).toHaveBeenCalledTimes(1);
    expect(m.refund).toHaveBeenCalledWith("w1", "c1");
    await onStoryRenderFailure({ ...payload, actor: person }, new Error("x"), true);
    expect(m.refund).toHaveBeenCalledTimes(1);
  });
});

describe("storyRenderState", () => {
  // A tiny job table honouring the filters storyRenderState uses (status, payload path equals / gte).
  let jobs: Row[] = [];
  const pathOk = (payload: Row, c: Row) => {
    const v = (c.path as string[]).reduce((o: Row | undefined, k) => o?.[k], payload) as unknown as number;
    return "equals" in c ? v === c.equals : v >= c.gte;
  };
  beforeEach(() => {
    jobs = [];
    m.jobFind.mockImplementation(async ({ where }: Row) => {
      const statuses: string[] = typeof where.status === "string" ? [where.status] : where.status.in;
      const conds: Row[] = [...(where.payload ? [where.payload] : []), ...(where.AND ?? []).map((a: Row) => a.payload)];
      const hits = jobs.filter((j) => j.type === where.type && j.brandId === where.brandId && statuses.includes(j.status) && conds.every((c) => pathOk(j.payload, c)));
      return hits.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    });
  });
  const job = (o: Row) => jobs.push({ type: STORY_RENDER_JOB, workspaceId: "w1", brandId: "b1", updatedAt: Date.now() + jobs.length, ...o, payload: { itemId: "i1", baseVersion: 0, actor: { kind: "person", userId: "u1" }, ...o.payload } });

  it("is rendering while a job for the item is pending or running", async () => {
    job({ status: "PENDING" });
    expect(await storyRenderState(scope, "i1")).toEqual({ rendering: true });
  });

  it("ignores another item's jobs", async () => {
    job({ status: "PENDING", payload: { itemId: "i2" } });
    expect(await storyRenderState(scope, "i1")).toEqual({ rendering: false });
  });

  it("shows a refusal word for word, with its code", async () => {
    await saveStoryVersion(scope, "i1", 0, input([frame("p1"), frame("c1"), frame("p3")]), person);
    db.item!.status = "PUBLISHED";
    const err = await runStoryRender(m.enqueue.mock.calls[0][0].payload).catch((e: unknown) => e);
    job({ status: "DEAD_LETTER", lastError: String(err).slice(0, 2000) });
    expect(await storyRenderState(scope, "i1")).toEqual({ rendering: false, error: "This story can't be edited any more.", errorCode: "story.notEditable" });
  });

  it("keeps a refusal's data (a frame's number) for the app's own wording", async () => {
    job({ status: "DEAD_LETTER", lastError: `story-refused:${JSON.stringify({ code: "story.textFit", message: "Frame 2: the text doesn't fit.", data: { n: 2 } })}` });
    expect(await storyRenderState(scope, "i1")).toEqual({ rendering: false, error: "Frame 2: the text doesn't fit.", errorCode: "story.textFit", errorData: { n: 2 } });
  });

  it("doesn't show an agent's failed rewrite as the person's render error", async () => {
    job({ status: "DEAD_LETTER", lastError: "Error: ffmpeg exited 1", payload: { actor: { kind: "agent", runId: "r1" } } });
    expect(await storyRenderState(scope, "i1")).toEqual({ rendering: false });
  });

  it("never shows raw render errors (ffmpeg text, temp paths)", async () => {
    job({ status: "DEAD_LETTER", lastError: "Error: ffmpeg exited 1: C:\\Temp\\story-frame-x\\source: Invalid data" });
    expect(await storyRenderState(scope, "i1")).toEqual({ rendering: false, error: "The clip couldn't be rendered. Try again.", errorCode: "story.renderFailed" });
  });

  it("ignores an older save's failure once a newer version exists", async () => {
    db.versions.push({ id: "v2", contentItemId: "i1", version: 2, body: {}, createdAt: new Date() });
    job({ status: "DEAD_LETTER", lastError: "Error: x", payload: { baseVersion: 1 } });
    expect(await storyRenderState(scope, "i1")).toEqual({ rendering: false });
    job({ status: "DEAD_LETTER", lastError: "Error: y", payload: { baseVersion: 2 } });
    expect((await storyRenderState(scope, "i1")).errorCode).toBe("story.renderFailed");
  });
});

describe("the check under the lock", () => {
  const sideEffect = (fn: () => void) =>
    m.photo.mockImplementationOnce(async () => {
      fn();
      return { key: "w1/b1/stories/a.jpg", file: { width: 1080, height: 1920, bytes: 1 } };
    });

  it("refuses a photo save when the story is approved while its frames render", async () => {
    sideEffect(() => (db.item!.status = "APPROVED"));
    await expect(saveStoryVersion(scope, "i1", 0, input(), person)).rejects.toMatchObject({ status: 409, code: "story.notEditable" });
    expect(db.versions).toHaveLength(0);
  });

  it("refuses a photo save when someone saves while its frames render", async () => {
    sideEffect(() => db.versions.push({ id: "v1", contentItemId: "i1", version: 1, body: {}, createdAt: new Date() }));
    await expect(saveStoryVersion(scope, "i1", 0, input(), person)).rejects.toMatchObject({ status: 409, code: "story.stale" });
    expect(db.versions).toHaveLength(1);
  });

  it("refuses the job's last step when the story is published while its photos render", async () => {
    await saveStoryVersion(scope, "i1", 0, input([frame("p1"), frame("c1"), frame("p3")]), person);
    await runStoryRender(m.enqueue.mock.calls[0][0].payload);
    sideEffect(() => (db.item!.status = "PUBLISHED"));
    await expect(runStoryRender(m.enqueue.mock.calls[1][0].payload)).rejects.toMatchObject({ status: 409, code: "story.notEditable" });
    expect(db.versions).toHaveLength(0);
  });

  it("refuses the job's last step when the story is approved while its photos render", async () => {
    await saveStoryVersion(scope, "i1", 0, input([frame("p1"), frame("c1"), frame("p3")]), person);
    await runStoryRender(m.enqueue.mock.calls[0][0].payload);
    sideEffect(() => (db.item!.status = "APPROVED"));
    await expect(runStoryRender(m.enqueue.mock.calls[1][0].payload)).rejects.toMatchObject({ status: 409, code: "story.notEditable" });
    expect(db.versions).toHaveLength(0);
  });

  const rendered = { frames: [{ label: "", headline: "H", body: "", mediaKey: "w1/b1/uploads/a.jpg", mediaKind: "photo" as const, renderedKey: "w1/b1/stories/a.jpg" }], cta: "", link: "", brandMark: false, hook: "", productIds: [] };
  const direct = (base: number, o: object = {}) => (prisma as never as { $transaction: (fn: (tx: never) => unknown) => Promise<unknown> }).$transaction((tx) => createStoryVersion(tx, scope, "i1", base, rendered, person, o));

  it("createStoryVersion refuses a stale base", async () => {
    db.versions.push({ id: "v1", contentItemId: "i1", version: 1, body: {}, createdAt: new Date() });
    await expect(direct(0)).rejects.toMatchObject({ status: 409, code: "story.stale" });
    expect(db.versions).toHaveLength(1);
  });

  it.each(["SCHEDULED", "PUBLISHED"])("createStoryVersion refuses a %s story", async (status) => {
    db.item!.status = status;
    await expect(direct(0)).rejects.toMatchObject({ status: 409, code: "story.notEditable" });
    expect(db.versions).toHaveLength(0);
  });

  it("createStoryVersion refuses a story approved since the save started, not one approved before it", async () => {
    db.item!.status = "APPROVED";
    await expect(direct(0, { statusAtSave: "AWAITING_APPROVAL" })).rejects.toMatchObject({ status: 409, code: "story.notEditable" });
    expect(db.versions).toHaveLength(0);
    await direct(0, { statusAtSave: "APPROVED" });
    expect(db.versions).toHaveLength(1);
  });
});

describe("a retried final step", () => {
  const clipStory = () => input([frame("p1"), frame("c1"), frame("p3")]);

  it("treats its own committed version as done: no stale refusal, no refund", async () => {
    await saveStoryVersion(scope, "i1", 0, clipStory(), agent);
    await runStoryRender(m.enqueue.mock.calls[0][0].payload);
    const last = m.enqueue.mock.calls[1][0].payload;
    await runStoryRender(last);
    expect(db.versions).toHaveLength(1);
    expect(db.versions[0].body.renderId).toBe(last.renderId);
    // The job died before it was marked complete, and runs again.
    m.start.mockClear();
    await expect(runStoryRender(last)).resolves.toBeUndefined();
    expect(db.versions).toHaveLength(1);
    expect(m.refund).not.toHaveBeenCalled();
    // It may have died before Quality was started: the version has no check, so it starts it.
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "quality", input: { itemId: "i1", version: 1 } }));
  });

  it("doesn't check a version again when its Quality check is already there", async () => {
    await saveStoryVersion(scope, "i1", 0, clipStory(), agent);
    await runStoryRender(m.enqueue.mock.calls[0][0].payload);
    const last = m.enqueue.mock.calls[1][0].payload;
    await runStoryRender(last);
    db.checked = { id: "q1" };
    m.start.mockClear();
    await runStoryRender(last);
    expect(m.start).not.toHaveBeenCalled();
  });

  it("still refuses another save's job on the same base as stale", async () => {
    await saveStoryVersion(scope, "i1", 0, clipStory(), person);
    await saveStoryVersion(scope, "i1", 0, clipStory(), person);
    const [a, b] = [m.enqueue.mock.calls[0][0].payload, m.enqueue.mock.calls[1][0].payload];
    await runStoryRender(a);
    await runStoryRender(m.enqueue.mock.calls.at(-1)![0].payload);
    await expect(runStoryRender(b)).rejects.toMatchObject({ code: "story.stale" });
    expect(db.versions).toHaveLength(1);
  });
});

describe("saveDraft", () => {
  it("refuses a story with 400 story.useEditStory", async () => {
    await expect(saveDraft({ ...scope, itemId: "i1", version: 0, body: { hook: "", caption: "x", hashtags: [], slides: [], script: [], pinTitle: "", altText: "" } }))
      .rejects.toMatchObject({ status: 400, code: "story.useEditStory" });
  });
});

describe("storyTab", () => {
  it.each([
    ["PLANNED", false, [], "drafts"],
    ["BRIEF_READY", false, [], "drafts"],
    ["DRAFT_REVIEW", false, [], "drafts"],
    ["AWAITING_APPROVAL", false, [], "drafts"],
    ["REJECTED", false, [], "drafts"],
    ["BLOCKED", false, [], "drafts"],
    ["APPROVED", false, [], "drafts"],
    ["APPROVED", true, [], "scheduled"],
    ["SCHEDULED", false, [], "scheduled"],
    ["SCHEDULED", false, ["PARTIAL"], "posted"],
    ["SCHEDULED", false, ["PENDING_VERIFY"], "posted"],
    ["SCHEDULED", false, ["FAILED"], "scheduled"],
    ["PUBLISHED", false, [], "posted"],
  ] as const)("%s (byHand %s, attempts %j) → %s", (status, byHand, attempts, tab) => {
    expect(storyTab({ status, byHand }, attempts.map((s) => ({ status: s })))).toBe(tab);
  });
});

describe("deleteStory and duplicateStory", () => {
  it("refuses to delete a scheduled story with 409", async () => {
    db.item!.status = "SCHEDULED";
    await expect(deleteStory(scope, "i1")).rejects.toMatchObject({ status: 409 });
    expect(p.contentItem.delete).not.toHaveBeenCalled();
  });
  it("deletes a draft", async () => {
    await deleteStory(scope, "i1");
    expect(p.contentItem.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });
  it("answers 404 for another brand's story", async () => {
    await expect(deleteStory({ ...scope, brandId: "b2" }, "i1")).rejects.toMatchObject({ status: 404 });
  });
  it("duplicates as a planned story with the latest body minus render fields", async () => {
    db.versions.push({ id: "v1", contentItemId: "i1", version: 1, createdAt: new Date(), body: { frames: [{ label: "", headline: "H", body: "", source: { kind: "upload", id: "p1" }, mediaKey: "w1/b1/uploads/p1.jpg", mediaKind: "photo", renderedKey: "w1/b1/stories/x.jpg", file: { width: 1, height: 1, bytes: 1 } }], cta: "", link: "", hook: "H", productIds: ["prod1"], brandMark: false } });
    const copy = await duplicateStory(scope, "i1");
    expect(copy.id).toBe("copy1");
    expect(p.contentItem.create.mock.calls[0][0].data).toMatchObject({ workspaceId: "w1", brandId: "b1", channel: "INSTAGRAM_STORY", status: "PLANNED", productIds: ["prod1"], opportunityId: "o1" });
    const v = db.versions.find((x) => x.contentItemId === "copy1")!;
    expect(v.version).toBe(1);
    expect(v.body.frames[0].renderedKey).toBeUndefined();
    expect(v.body.frames[0].file).toBeUndefined();
    expect(v.body.frames[0].mediaKey).toBe("w1/b1/uploads/p1.jpg");
  });
});

describe("content route", () => {
  const post = (body: object) =>
    POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ workspaceId: "w1", brandId: "b1", contentId: "i1" }) });
  beforeEach(() => m.authorize.mockResolvedValue(scope));

  it("editStory saves with content.create, starts Quality and returns the signed frames", async () => {
    const story = { ...input(), frames: input().frames.map((f, i) => (i === 0 ? { ...f, renderedKey: "w9/b9/stories/evil.jpg" } : f)) };
    const res = await post({ action: "editStory", version: 0, story });
    expect(res.status).toBe(200);
    expect(m.authorize.mock.calls[0][2]).toBe("content.create");
    const json = await res.json();
    expect(json).toMatchObject({ saved: "saved", rendering: false, renderError: null });
    expect(json.frames[0]).toEqual({ n: 1, url: "https://signed/w1/b1/stories/p1.jpg.jpg", sourceUrl: "https://signed/w1/b1/uploads/p1.jpg", sourceSize: null, kind: "photo", headline: "Headline p1" });
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "quality", input: { itemId: "i1", version: 1 } }));
  });

  it("editStory refuses invalid input with the story code", async () => {
    const res = await post({ action: "editStory", version: 0, story: { ...input(), link: "http://plain.test" } });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("story.invalid");
  });

  it("delete answers 204 for a draft; duplicate answers 201 with the new id", async () => {
    expect((await post({ action: "duplicate" })).status).toBe(201);
    expect((await post({ action: "delete" })).status).toBe(204);
    expect(m.authorize.mock.calls.map((c) => c[2])).toEqual(["content.create", "content.create"]);
  });
});
