/**
 * Live connect-flow check on Neon (no provider login needed): start → state stored hashed →
 * callback consumes it once (replay + wrong user rejected) → disconnect wipes tokens.
 * Run: npm run smoke:connections -w web
 */
import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import { hashToken } from "@/server/auth/tokens";
import { decryptCredentials, encryptCredentials } from "@/server/crypto/credentials";
import { completeConnect, ConnectionError, disconnect, listProviders, startConnect } from "@/server/services/connections";

async function main() {
  const owner = await prisma.workspaceMember.findFirstOrThrow({ where: { roleRef: { slug: "owner" } } });
  const brand = await prisma.brand.findFirstOrThrow({ where: { workspaceId: owner.workspaceId } });
  const scope = { workspaceId: owner.workspaceId, brandId: brand.id, userId: owner.userId };
  const configured = listProviders().flatMap((p) => (p.kind === "oauth" && p.configured ? [p.provider] : []));
  console.log("configured providers:", configured.join(", ") || "none");
  const provider = configured[0];
  assert.ok(provider, "need at least one provider with keys in .env");

  // 1. start: consent URL carries a state; only its hash is stored
  const url = new URL(await startConnect({ ...scope, provider }));
  const state = url.searchParams.get("state")!;
  assert.ok(state && url.searchParams.get("redirect_uri"));
  const row = await prisma.oAuthStateTransaction.findUniqueOrThrow({ where: { stateHash: hashToken(state) } });
  assert.equal(row.brandId, brand.id);
  console.log(`1 ${provider} consent URL → ${url.origin}${url.pathname}, state stored hashed ✓`);

  // 2. wrong user can't use it
  await assert.rejects(completeConnect({ provider, state, code: "x", userId: "someone-else" }), ConnectionError);
  // 3. right user: state consumed, then the fake code fails at the provider
  await assert.rejects(completeConnect({ provider, state, code: "fake-code", userId: owner.userId }), (e: Error) => !(e instanceof ConnectionError));
  // 4. replay is refused before any provider call
  await assert.rejects(completeConnect({ provider, state, code: "fake-code", userId: owner.userId }), ConnectionError);
  console.log("2-4 wrong user rejected, state single-use, replay refused ✓");

  const conn = await prisma.integrationConnection.create({
    data: {
      workspaceId: scope.workspaceId, brandId: scope.brandId, connectedByUserId: owner.userId, provider,
      externalAccountId: `smoke-${Date.now()}`, displayName: "Smoke account", scopes: [],
      encryptedCredentials: encryptCredentials({ accessToken: "t" }), credentialKeyVersion: 1,
    },
  });
  assert.deepEqual(decryptCredentials(conn.encryptedCredentials!), { accessToken: "t" });
  // 4b. a repeat of a callback that did connect reports the same success (browser double-hit)
  const again = await completeConnect({ provider, state, code: "fake-code", userId: owner.userId });
  assert.deepEqual(again.connections.map((c) => c.id), [conn.id]);
  await assert.rejects(completeConnect({ provider, state, code: "x", userId: "someone-else" }), ConnectionError);
  console.log("4b repeated callback after a real connect → same success, other users still refused ✓");

  // 5. disconnect wipes the encrypted tokens
  assert.deepEqual(await disconnect({ ...scope, connectionId: conn.id }), { cancelled: 0 });
  const after = await prisma.integrationConnection.findUniqueOrThrow({ where: { id: conn.id } });
  assert.equal(after.status, "REVOKED");
  assert.equal(after.encryptedCredentials, null);
  console.log("5 disconnect → REVOKED, tokens wiped ✓");

  await prisma.integrationConnection.delete({ where: { id: conn.id } });
  await prisma.oAuthStateTransaction.deleteMany({ where: { id: row.id } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
