/**
 * CMO chat on Neon + the running app (npm run start): the tools read the right brand data and
 * refuse agent runs for roles without agents.run; the route streams, saves the conversation,
 * explains an empty AI balance plainly, and keeps conversations private to their owner.
 * Run: npm run smoke:chat -w web
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { chatTools } from "@/server/chat/tools";

const BASE = "http://localhost:3100";

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const keep = (r: Response) => r.headers.getSetCookie().forEach((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); });
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  let r = await fetch(`${BASE}/api/auth/csrf`);
  keep(r);
  const { csrfToken } = await r.json();
  r = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE }) });
  keep(r);
  return cookie;
}

const call = <T,>(t: { execute?: unknown }, input: unknown) =>
  (t.execute as (i: unknown, o: unknown) => Promise<T>)(input, { toolCallId: "smoke", messages: [] });

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL!.toLowerCase() } });
  const member = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: admin.id } });
  const brand = await prisma.brand.findFirstOrThrow({ where: { workspaceId: member.workspaceId }, orderBy: { createdAt: "asc" } });
  const scope = { workspaceId: brand.workspaceId, brandId: brand.id, userId: admin.id };
  const tools = chatTools(scope);

  // 1. Tools read this brand's data
  const docs = await call<{ kind: string; status: string }[]>(tools.listDocuments, {});
  assert.equal(docs.length, 5);
  const voice = await call<{ status: string; markdown?: string }>(tools.readDocument, { kind: "brand-voice" });
  assert.ok(voice.status);
  const reports = await call<{ seo: unknown; geo: unknown }>(tools.getSiteReports, {});
  const agents = await call<{ key: string }[]>(tools.listAgents, {});
  assert.ok(agents.some((a) => a.key === "seo") && !agents.some((a) => a.key === "systems-check"));
  console.log(`1 tools: ${docs.length} docs, brand voice ${voice.status}, SEO report ${typeof reports.seo === "object" ? "present" : "missing"}, ${agents.length} agents ✓`);

  // 2. An admin's startAgent only offers (the person presses Start); a viewer's is refused
  const email = `smoke-chat-${Date.now()}@example.com`;
  const password = `pw-${randomUUID()}`;
  const viewerRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_slug: { workspaceId: brand.workspaceId, slug: "viewer" } } });
  const viewer = await prisma.user.create({ data: { email, name: "Smoke Viewer", passwordHash: await bcrypt.hash(password, 10) } });
  await prisma.workspaceMember.create({ data: { workspaceId: brand.workspaceId, userId: viewer.id, roleId: viewerRole.id } });
  const threadId = randomUUID();
  try {
    const runsBefore = await prisma.agentRun.count({ where: { brandId: brand.id } });
    const offered = await call<{ proposed: boolean; agentKey?: string }>(tools.startAgent, { agentKey: "seo" });
    assert.deepEqual([offered.proposed, offered.agentKey], [true, "seo"]);
    assert.equal(await prisma.agentRun.count({ where: { brandId: brand.id } }), runsBefore, "the chat started a run by itself");
    const refused = await call<{ proposed: boolean; reason?: string }>(chatTools({ ...scope, userId: viewer.id }).startAgent, { agentKey: "seo" });
    assert.equal(refused.proposed, false);
    console.log(`2 startAgent offers without starting; viewer refused: "${refused.reason}" ✓`);

    // 3. Live turn as admin: streams, saves, and explains an empty balance in plain words
    const adminCookie = await login(process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!);
    const url = `${BASE}/api/v1/workspaces/${brand.workspaceId}/brands/${brand.id}/chat`;
    const message = { id: randomUUID(), role: "user", parts: [{ type: "text", text: "Quelle est notre voix de marque ?" }] };
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", cookie: adminCookie() }, body: JSON.stringify({ id: threadId, message }) });
    assert.equal(res.status, 200);
    const stream = await res.text();
    const credits = stream.includes("AI credits used up");
    const answered = stream.includes("\"text-delta\"");
    assert.ok(credits || answered, `expected an answer or the credits message, got: ${stream.slice(0, 300)}`);
    console.log(`3 POST chat → 200; ${credits ? "AI balance empty → plain 'AI credits used up' message" : "streamed a real answer"} ✓`);
    await new Promise((r) => setTimeout(r, 1500));
    const saved = await prisma.chatThread.findUniqueOrThrow({ where: { id: threadId } });
    assert.equal(saved.userId, admin.id);
    assert.equal(saved.title, "Quelle est notre voix de marque ?");
    const restored = await (await fetch(url, { headers: { cookie: adminCookie() } })).json();
    assert.equal(restored.thread.id, threadId);
    console.log(`4 conversation saved ("${saved.title}") and restored by GET ✓`);

    // 5. Another person can't post into (or read) that conversation
    const viewerCookie = await login(email, password);
    const other = await fetch(url, { method: "POST", headers: { "content-type": "application/json", cookie: viewerCookie() }, body: JSON.stringify({ id: threadId, message: { ...message, id: randomUUID() } }) });
    assert.equal(other.status, 404);
    const theirs = await (await fetch(url, { headers: { cookie: viewerCookie() } })).json();
    assert.equal(theirs.thread, null);
    console.log("5 another member can't post into or see the conversation (404 / none) ✓");
  } finally {
    await prisma.chatThread.deleteMany({ where: { id: threadId } });
    await prisma.workspaceMember.deleteMany({ where: { userId: viewer.id } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: viewer.id } });
    await prisma.user.delete({ where: { id: viewer.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
