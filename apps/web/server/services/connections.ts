import type { IntegrationConnection, IntegrationProvider } from "@prisma/client";
import { requireBrandAccess } from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import { hashToken, newToken } from "@/server/auth/tokens";
import { currentKeyVersion, encryptCredentials } from "@/server/crypto/credentials";
import { prisma } from "@/server/db/prisma";
import { PROVIDERS, providerConfig } from "@/server/integrations/providers";

const STATE_TTL_MS = 10 * 60_000; // DEC-017: ≤10 min

export class ConnectionError extends Error {}

export function listProviders() {
  return (Object.keys(PROVIDERS) as IntegrationProvider[]).map((p) => ({
    provider: p,
    label: PROVIDERS[p].label,
    configured: providerConfig(p) !== null,
  }));
}

export const toConnectionDto = (c: IntegrationConnection) => ({
  id: c.id,
  provider: c.provider,
  displayName: c.displayName,
  status: c.status,
  lastError: c.lastError,
  tokenExpiresAt: c.tokenExpiresAt?.toISOString() ?? null,
  connectedAt: c.createdAt.toISOString(),
});

export const listConnections = (workspaceId: string, brandId: string) =>
  prisma.integrationConnection.findMany({
    where: { workspaceId, brandId, status: { not: "REVOKED" } },
    orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
  });

/** Step 1: persist a single-use state bound to user + brand + provider, return the consent URL. */
export async function startConnect(input: {
  workspaceId: string;
  brandId: string;
  userId: string;
  provider: IntegrationProvider;
}) {
  const cfg = providerConfig(input.provider);
  if (!cfg) throw new ConnectionError(`${PROVIDERS[input.provider].label} isn't set up yet (missing app keys)`);
  const { raw, hash } = newToken();
  await prisma.oAuthStateTransaction.create({
    data: { ...input, stateHash: hash, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
  });
  return PROVIDERS[input.provider].authorizeUrl({
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    state: raw,
    scope: PROVIDERS[input.provider].scopes.join(","),
  });
}

/**
 * Step 2 (callback): consume the state atomically *before* the code exchange, so a replayed
 * or concurrent callback gets nothing. Re-checks access at callback time — a role revoked
 * mid-flow must not still connect.
 */
export async function completeConnect(input: {
  provider: IntegrationProvider;
  state: string;
  code: string;
  userId: string;
}) {
  const stateHash = hashToken(input.state);
  const consumed = await prisma.oAuthStateTransaction.updateMany({
    where: {
      stateHash,
      provider: input.provider,
      userId: input.userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new ConnectionError("This connect link expired or was already used. Try again.");
  const st = await prisma.oAuthStateTransaction.findUniqueOrThrow({ where: { stateHash } });

  await requireBrandAccess(st.workspaceId, st.brandId, input.userId);
  await requirePermission(st.workspaceId, input.userId, "integrations.manage", st.brandId);

  const cfg = providerConfig(input.provider);
  if (!cfg) throw new ConnectionError("Provider keys were removed during connect");
  const accounts = await PROVIDERS[input.provider].exchange({ code: input.code, ...cfg });

  const keyVersion = currentKeyVersion();
  const saved = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const a of accounts) {
      const data = {
        displayName: a.displayName,
        scopes: a.scopes,
        encryptedCredentials: encryptCredentials(a.credentials, keyVersion),
        credentialKeyVersion: keyVersion,
        tokenExpiresAt: a.tokenExpiresAt,
        status: "ACTIVE" as const,
        lastError: null,
        connectedByUserId: input.userId,
      };
      rows.push(
        await tx.integrationConnection.upsert({
          where: {
            brandId_provider_externalAccountId: {
              brandId: st.brandId,
              provider: input.provider,
              externalAccountId: a.externalAccountId,
            },
          },
          create: { ...data, workspaceId: st.workspaceId, brandId: st.brandId, provider: input.provider, externalAccountId: a.externalAccountId },
          update: data, // reconnect refreshes tokens in place
        }),
      );
    }
    await tx.auditEvent.create({
      data: {
        workspaceId: st.workspaceId,
        brandId: st.brandId,
        actorUserId: input.userId,
        action: "integration.connected",
        entityType: "IntegrationConnection",
        entityId: rows[0].id,
        metadata: { provider: input.provider, accounts: rows.map((r) => r.displayName) },
      },
    });
    return rows;
  });
  return { workspaceId: st.workspaceId, brandId: st.brandId, connections: saved };
}

/** Disconnect = forget the tokens. ponytail: no provider-side revoke call; the user can also remove the app in the platform's settings. */
export async function disconnect(input: { workspaceId: string; brandId: string; connectionId: string; userId: string }) {
  const { count } = await prisma.integrationConnection.updateMany({
    where: { id: input.connectionId, workspaceId: input.workspaceId, brandId: input.brandId, status: { not: "REVOKED" } },
    data: { status: "REVOKED", encryptedCredentials: null },
  });
  if (count === 0) return false;
  await prisma.auditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      actorUserId: input.userId,
      action: "integration.disconnected",
      entityType: "IntegrationConnection",
      entityId: input.connectionId,
    },
  });
  return true;
}
