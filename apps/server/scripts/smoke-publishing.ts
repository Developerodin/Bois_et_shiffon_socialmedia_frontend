/**
 * Approval → publishing on Neon with Pinterest's API faked (nothing reaches a real account):
 * creator ≠ approver, approval bound to the latest version, one live attempt per account even
 * under concurrent clicks, success, refusal (retry allowed), unknown outcome (no blind retry),
 * draft changed after scheduling, cancel; a person's edit (new version, voids approval, stale edits
 * refused); "request changes" reaching the Creator with the approver's note; agents never overwrite
 * a newer draft; expiring tokens refreshed before posting, refused ones flagged for reconnect;
 * disconnecting cancels scheduled posts. Throwaway workspace. Run: npm run smoke:publishing -w web
 */
import assert from "node:assert/strict";
import { encryptCredentials } from "@/server/crypto/credentials";
import { prisma } from "@/server/db/prisma";
import { creatorAgent } from "@/server/agents/definitions/creator";
import { qualityAgent } from "@/server/agents/definitions/quality";
import type { AgentContext } from "@/server/agents/types";
import { disconnect } from "@/server/services/connections";
import { decide, executePublication, PublishingError, releaseState, saveDraft, schedulePublication, settlePublication } from "@/server/services/publishing";

let platform: { status: number; body: unknown } = { status: 200, body: { id: "pin-1" } };
let tokenEndpoint: { status: number; body: unknown } = { status: 200, body: { access_token: "fresh", expires_in: 2_592_000 } };
const calls: string[] = [];
const auth: string[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (String(url).includes("/oauth/token")) return new Response(JSON.stringify(tokenEndpoint.body), { status: tokenEndpoint.status });
  calls.push(String(url));
  auth.push(String((init?.headers as Record<string, string> | undefined)?.authorization ?? ""));
  return new Response(JSON.stringify(platform.body), { status: platform.status });
}) as typeof fetch;

const refused = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => e instanceof PublishingError && re.test(e.message));

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL!.toLowerCase() } });
  const ws = await prisma.workspace.create({ data: { name: "Smoke publishing", slug: `smoke-pub-${Date.now()}` } });
  const brand = await prisma.brand.create({ data: { workspaceId: ws.id, slug: "b", displayName: "Smoke", profile: { create: { websiteUrl: "https://shop.example.org" } } } });
  const scope = { workspaceId: ws.id, brandId: brand.id, userId: user.id };
  const conn = await prisma.integrationConnection.create({
    data: { workspaceId: ws.id, brandId: brand.id, connectedByUserId: user.id, provider: "PINTEREST", externalAccountId: "acct", displayName: "@smoke", scopes: [], encryptedCredentials: encryptCredentials({ accessToken: "t" }), credentialKeyVersion: 1 },
  });
  const newItem = async (title: string) => {
    const item = await prisma.contentItem.create({ data: { workspaceId: ws.id, brandId: brand.id, title, channel: "PINTEREST_PIN", status: "AWAITING_APPROVAL" } });
    await addVersion(item.id, 1, "agent");
    return item;
  };
  const addVersion = async (itemId: string, version: number, createdBy: string) => {
    const v = await prisma.contentVersion.create({ data: { contentItemId: itemId, version, createdBy, body: { hook: "Oak", caption: `Caption v${version}`, hashtags: ["#bois"], slides: [], script: [], pinTitle: "Oak table", altText: "An oak table" } } });
    await prisma.qualityCheck.create({ data: { contentVersionId: v.id, overall: "PASS", results: [] } });
  };
  const pin = { boardId: "board-1", imageUrl: "https://cdn.example.org/table.jpg", connectionId: conn.id };
  const attempt = async (itemId: string) => prisma.publicationAttempt.findFirstOrThrow({ where: { contentItemId: itemId }, orderBy: { createdAt: "desc" } });
  const status = async (itemId: string) => (await prisma.contentItem.findUniqueOrThrow({ where: { id: itemId } })).status;

  try {
    // 1. Approval rules
    const a = await prisma.contentItem.create({ data: { workspaceId: ws.id, brandId: brand.id, title: "A", channel: "PINTEREST_PIN", status: "AWAITING_APPROVAL" } });
    await addVersion(a.id, 1, user.id);
    await refused(decide({ ...scope, itemId: a.id, version: 1, verdict: "APPROVED" }), /someone else/);
    await refused(decide({ ...scope, itemId: a.id, version: 1, verdict: "CHANGES_REQUESTED" }), /what needs to change/);
    await addVersion(a.id, 2, "agent");
    await refused(decide({ ...scope, itemId: a.id, version: 1, verdict: "APPROVED" }), /newer draft/);
    await decide({ ...scope, itemId: a.id, version: 2, verdict: "APPROVED" });
    assert.equal(await status(a.id), "APPROVED");
    console.log("1 creator can't approve own draft, notes required for changes, approval binds to the latest version ✓");

    // 2. Publish gate + one live attempt even with simultaneous clicks
    await refused(schedulePublication({ ...scope, itemId: a.id, version: 2, ...pin, imageUrl: "" }), /needs an image/);
    await refused(schedulePublication({ ...scope, itemId: a.id, version: 2, ...pin, imageUrl: "http://insecure.example.org/x.jpg" }), /https/);
    const clicks = await Promise.allSettled([1, 2, 3].map(() => schedulePublication({ ...scope, itemId: a.id, version: 2, ...pin })));
    assert.equal(clicks.filter((c) => c.status === "fulfilled").length, 1);
    for (const c of clicks) if (c.status === "rejected") assert.match(c.reason.message, /Already scheduled/);
    assert.equal(await status(a.id), "SCHEDULED");
    console.log("2 image and https enforced; three simultaneous Publish clicks → one attempt ✓");

    // 3. Success
    await executePublication({ attemptId: (await attempt(a.id)).id });
    const ok = await attempt(a.id);
    assert.equal(ok.status, "PUBLISHED");
    assert.equal(ok.externalUrl, "https://www.pinterest.com/pin/pin-1/");
    assert.equal(await status(a.id), "PUBLISHED");
    await executePublication({ attemptId: ok.id }); // a duplicate job delivery does nothing
    assert.equal(calls.length, 1);
    console.log("3 published once with a live link; a duplicate job delivery doesn't post again ✓");

    // 4. Unknown outcome → PENDING_VERIFY, never retried; a person settles it, then retry is allowed
    const b = await newItem("B");
    await decide({ ...scope, itemId: b.id, version: 1, verdict: "APPROVED" });
    await schedulePublication({ ...scope, itemId: b.id, version: 1, ...pin });
    platform = { status: 503, body: { message: "unavailable" } };
    await executePublication({ attemptId: (await attempt(b.id)).id });
    assert.equal((await attempt(b.id)).status, "PENDING_VERIFY");
    await refused(schedulePublication({ ...scope, itemId: b.id, version: 1, ...pin }), /Already scheduled/);
    await settlePublication({ ...scope, attemptId: (await attempt(b.id)).id, action: "not-posted" });
    assert.equal(await status(b.id), "APPROVED");
    console.log("4 a 503 is recorded as 'check before retrying', blocks a new attempt until someone settles it ✓");

    // 5. Refusal → FAILED, safe to retry
    platform = { status: 400, body: { message: "Invalid board" } };
    await schedulePublication({ ...scope, itemId: b.id, version: 1, ...pin });
    await executePublication({ attemptId: (await attempt(b.id)).id });
    const bad = await attempt(b.id);
    assert.equal(bad.status, "FAILED");
    assert.match(bad.error!, /Invalid board/);
    assert.equal(await status(b.id), "APPROVED");
    console.log("5 a platform refusal is FAILED with its reason, and the post can be published again ✓");

    // 6. Draft changed after scheduling → not posted
    platform = { status: 200, body: { id: "pin-2" } };
    await schedulePublication({ ...scope, itemId: b.id, version: 1, ...pin });
    await addVersion(b.id, 2, "agent");
    const before = calls.length;
    await executePublication({ attemptId: (await attempt(b.id)).id });
    assert.equal(calls.length, before, "nothing sent to the platform");
    assert.match((await attempt(b.id)).error!, /changed after approval/);
    assert.equal((await releaseState(scope, b.id)).approvalValid, false);
    console.log("6 a new draft after scheduling voids the approval; nothing is posted ✓");

    // 7. Cancel a future post
    await decide({ ...scope, itemId: b.id, version: 2, verdict: "APPROVED" });
    await schedulePublication({ ...scope, itemId: b.id, version: 2, ...pin, runAt: new Date(Date.now() + 86_400_000) });
    await settlePublication({ ...scope, attemptId: (await attempt(b.id)).id, action: "cancel" });
    assert.equal((await attempt(b.id)).status, "CANCELLED");
    assert.equal(await status(b.id), "APPROVED");
    console.log("7 a scheduled post can be cancelled ✓");

    // 8. A person edits: stale or empty edits refused; scheduled posts locked; a saved edit voids the
    //    approval, goes back to the quality check, and its author can't approve it.
    const draft = { hook: "Oak", caption: "Edited caption", hashtags: ["bois", "#bois", "#chêne"], slides: [], script: [], pinTitle: "Oak table", altText: "An oak table" };
    await refused(saveDraft({ ...scope, itemId: b.id, version: 1, body: draft }), /newer draft/);
    await refused(saveDraft({ ...scope, itemId: b.id, version: 2, body: { ...draft, caption: "  " } }), /can't be empty/);
    await schedulePublication({ ...scope, itemId: b.id, version: 2, ...pin, runAt: new Date(Date.now() + 86_400_000) });
    await refused(saveDraft({ ...scope, itemId: b.id, version: 2, body: draft }), /Cancel it first/);
    await settlePublication({ ...scope, attemptId: (await attempt(b.id)).id, action: "cancel" });
    const v3 = await saveDraft({ ...scope, itemId: b.id, version: 2, body: draft });
    assert.equal(v3.version, 3);
    assert.deepEqual((v3.body as { hashtags: string[] }).hashtags, ["#bois", "#chêne"]);
    assert.equal(await status(b.id), "DRAFT_REVIEW");
    assert.equal((await releaseState(scope, b.id)).approvalValid, false);
    await refused(saveDraft({ ...scope, itemId: b.id, version: 3, body: draft }), /Nothing changed/);
    await prisma.qualityCheck.create({ data: { contentVersionId: v3.id, overall: "PASS", results: [] } });
    await prisma.contentItem.update({ where: { id: b.id }, data: { status: "AWAITING_APPROVAL" } });
    await refused(decide({ ...scope, itemId: b.id, version: 3, verdict: "APPROVED" }), /someone else/);
    console.log("8 a person's edit is a new version that voids approval; stale, empty, no-op and scheduled edits refused ✓");

    // 9. "Request changes" reaches the Creator with the note; agents skip posts that changed under them.
    const prompts: string[] = [];
    const ctx: AgentContext = {
      runId: "smoke",
      brand: { workspaceId: ws.id, brandId: brand.id, displayName: "Smoke", websiteUrl: null, about: null, location: null, place: null, voiceSummary: null, pillars: null, locales: null },
      log: async () => {},
      ai: { generateObject: async (i) => { prompts.push(i.prompt); return i.mock!; } },
    };
    await decide({ ...scope, itemId: b.id, version: 3, verdict: "CHANGES_REQUESTED", note: "Mention the oil finish" });
    await creatorAgent.run(ctx, {});
    assert.match(prompts.at(-1)!, /Mention the oil finish/);
    assert.equal((await prisma.contentVersion.count({ where: { contentItemId: b.id } })), 4);
    await qualityAgent.run(ctx, {});
    assert.equal(await status(b.id), "AWAITING_APPROVAL");
    // A Creator that started before a person's edit must not write over it.
    const c = await newItem("C");
    await prisma.contentItem.update({ where: { id: c.id }, data: { status: "BRIEF_READY" } });
    const slow: AgentContext = { ...ctx, ai: { generateObject: async (i) => { await saveDraft({ ...scope, itemId: c.id, version: 1, body: draft }); return i.mock!; } } };
    await creatorAgent.run(slow, {});
    const latestC = await prisma.contentVersion.findFirstOrThrow({ where: { contentItemId: c.id }, orderBy: { version: "desc" } });
    assert.equal(latestC.createdBy, user.id);
    console.log("9 'request changes' sends the note to the Creator; an agent never overwrites a newer draft ✓");

    // 10. Tokens: refreshed before posting when about to expire; a refused refresh or a 401 flags the account.
    const expiring = await prisma.integrationConnection.create({
      data: {
        workspaceId: ws.id, brandId: brand.id, connectedByUserId: user.id, provider: "PINTEREST", externalAccountId: "acct2", displayName: "@expiring", scopes: [],
        encryptedCredentials: encryptCredentials({ accessToken: "old", refreshToken: "r" }), credentialKeyVersion: 1, tokenExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const approvedPin = async (title: string) => {
      const it = await newItem(title);
      await decide({ ...scope, itemId: it.id, version: 1, verdict: "APPROVED" });
      return it;
    };
    platform = { status: 200, body: { id: "pin-3" } };
    const d = await approvedPin("D");
    await schedulePublication({ ...scope, itemId: d.id, version: 1, ...pin, connectionId: expiring.id });
    await executePublication({ attemptId: (await attempt(d.id)).id });
    assert.equal((await attempt(d.id)).status, "PUBLISHED");
    assert.equal(auth.at(-1), "Bearer fresh");
    const refreshed = await prisma.integrationConnection.findUniqueOrThrow({ where: { id: expiring.id } });
    assert.ok(refreshed.tokenExpiresAt!.getTime() > Date.now() + 20 * 86_400_000);
    // Expired and the refresh is refused → nothing posted, account flagged.
    await prisma.integrationConnection.update({ where: { id: expiring.id }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    tokenEndpoint = { status: 400, body: { message: "invalid_grant" } };
    const e = await approvedPin("E");
    await schedulePublication({ ...scope, itemId: e.id, version: 1, ...pin, connectionId: expiring.id });
    const before10 = calls.length;
    await executePublication({ attemptId: (await attempt(e.id)).id });
    assert.equal(calls.length, before10, "nothing sent to Pinterest");
    assert.match((await attempt(e.id)).error!, /Reconnect/);
    assert.equal((await prisma.integrationConnection.findUniqueOrThrow({ where: { id: expiring.id } })).status, "ERROR");
    // A 401 at publish time flags the account too.
    platform = { status: 401, body: { message: "Authentication failed" } };
    await schedulePublication({ ...scope, itemId: e.id, version: 1, ...pin });
    await executePublication({ attemptId: (await attempt(e.id)).id });
    assert.equal((await attempt(e.id)).status, "FAILED");
    assert.equal((await prisma.integrationConnection.findUniqueOrThrow({ where: { id: conn.id } })).status, "ERROR");
    console.log("10 expiring tokens refresh before posting; a refused refresh or a 401 marks the account 'needs reconnect' ✓");

    // 11. Disconnecting cancels posts scheduled to that account; they stay approved.
    await prisma.integrationConnection.update({ where: { id: conn.id }, data: { status: "ACTIVE", lastError: null } });
    platform = { status: 200, body: { id: "pin-4" } };
    await schedulePublication({ ...scope, itemId: e.id, version: 1, ...pin, runAt: new Date(Date.now() + 86_400_000) });
    assert.deepEqual(await disconnect({ ...scope, connectionId: conn.id }), { cancelled: 1 });
    assert.equal((await attempt(e.id)).status, "CANCELLED");
    assert.equal(await status(e.id), "APPROVED");
    console.log("11 disconnecting cancels its scheduled posts openly; they stay approved ✓");
  } finally {
    await prisma.job.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.workspace.delete({ where: { id: ws.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
