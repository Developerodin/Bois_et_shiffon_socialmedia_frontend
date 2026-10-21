/**
 * Approval → publishing on Neon with Pinterest's API faked (nothing reaches a real account):
 * creator ≠ approver, approval bound to the latest version, one live attempt per account even
 * under concurrent clicks, success, refusal (retry allowed), unknown outcome (no blind retry),
 * draft changed after scheduling, cancel. Throwaway workspace. Run: npm run smoke:publishing -w web
 */
import assert from "node:assert/strict";
import { encryptCredentials } from "@/server/crypto/credentials";
import { prisma } from "@/server/db/prisma";
import { decide, executePublication, PublishingError, releaseState, schedulePublication, settlePublication } from "@/server/services/publishing";

let platform: { status: number; body: unknown } = { status: 200, body: { id: "pin-1" } };
const calls: string[] = [];
globalThis.fetch = (async (url: string) => {
  calls.push(String(url));
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
