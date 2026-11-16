import type { IntegrationConnection, IntegrationProvider } from "@prisma/client";
import { requireBrandAccess } from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import { hashToken, newToken } from "@/server/auth/tokens";
import { currentKeyVersion, decryptCredentials, encryptCredentials } from "@/server/crypto/credentials";
import { prisma } from "@/server/db/prisma";
import { PROVIDERS, ProviderError, providerConfig, type ConnectedAccount, type OAuthProvider } from "@/server/integrations/providers";
import { postedCount, storyTargetOf } from "@/server/services/publishing";

const STATE_TTL_MS = 10 * 60_000; // DEC-017: ≤10 min

export class ConnectionError extends Error {}
/** The account's access is gone (expired, revoked on the platform): a person must reconnect it. */
export class ReconnectNeeded extends Error {}

const REFRESH_AHEAD_MS = 3 * 86_400_000;

/** Mark an account as needing reconnect, with a reason people can read in Connections. */
export async function markReconnect(connectionId: string, reason: string) {
  await prisma.integrationConnection.updateMany({
    where: { id: connectionId, status: "ACTIVE" },
    data: { status: "ERROR", lastError: reason.slice(0, 300) },
  });
}

/**
 * A usable access token for this account, refreshed first when it expires within 3 days.
 * A refresh the platform refuses (or an already-expired token) marks the account "Needs reconnect".
 * A network failure while the old token still works just uses the old one; the next call retries.
 * ponytail: two refreshes at once both succeed and the last write wins; the platforms allow it.
 */
export async function accessToken(conn: IntegrationConnection): Promise<string> {
  if (conn.status !== "ACTIVE" || !conn.encryptedCredentials) throw new ReconnectNeeded(`${conn.displayName} isn't connected`);
  const creds = decryptCredentials<ConnectedAccount["credentials"]>(conn.encryptedCredentials);
  const expiresAt = conn.tokenExpiresAt?.getTime();
  // Google access tokens live an hour: refresh just before, not 3 days ahead (that would refresh on every call).
  const ahead = conn.provider === "GOOGLE" || conn.provider === "GOOGLE_BUSINESS" ? 5 * 60_000 : REFRESH_AHEAD_MS;
  // Shopify Admin tokens don't expire and have no refresh.
  if (!expiresAt || expiresAt - Date.now() > ahead || conn.provider === "SHOPIFY") return creds.accessToken;
  const adapter = PROVIDERS[conn.provider];
  const cfg = providerConfig(conn.provider);
  const expired = expiresAt <= Date.now();
  try {
    if (!adapter.refresh || !cfg) throw new ProviderError("400 This account can't be refreshed automatically");
    const next = await adapter.refresh({ credentials: creds, ...cfg });
    const keyVersion = currentKeyVersion();
    // Only onto a still-connected account: a Disconnect during the refresh must keep its credentials gone.
    const { count } = await prisma.integrationConnection.updateMany({
      where: { id: conn.id, status: "ACTIVE" },
      data: { encryptedCredentials: encryptCredentials(next.credentials, keyVersion), credentialKeyVersion: keyVersion, tokenExpiresAt: next.tokenExpiresAt, lastError: null },
    });
    if (count !== 1) throw new ReconnectNeeded(`${conn.displayName} isn't connected`);
    return next.credentials.accessToken;
  } catch (e) {
    if (e instanceof ReconnectNeeded) throw e;
    const refused = e instanceof ProviderError && /^4\d\d /.test(e.message);
    // An expired token with a refresh token isn't lost on a network blip: the next call refreshes again.
    if (refused || (expired && !creds.refreshToken)) {
      await markReconnect(conn.id, `Access expired. Reconnect ${conn.displayName}.`);
      throw new ReconnectNeeded(`${conn.displayName}'s access expired`);
    }
    return creds.accessToken;
  }
}

/** Daily: refresh every token that expires within 3 days, so posts never meet an expired one. */
export async function refreshExpiringTokens() {
  const soon = await prisma.integrationConnection.findMany({
    where: { status: "ACTIVE", tokenExpiresAt: { lt: new Date(Date.now() + REFRESH_AHEAD_MS) } },
  });
  for (const c of soon) await accessToken(c).catch(() => {});
}

/** OAuth providers sign in through the platform; Shopify is connected with a pasted Admin API token ("token"). */
export function listProviders() {
  return [
    ...(Object.keys(PROVIDERS) as OAuthProvider[]).map((p) => ({ provider: p, label: PROVIDERS[p].label, configured: providerConfig(p) !== null, kind: "oauth" as const })),
    { provider: "SHOPIFY" as const, label: "Shopify", configured: true, kind: "token" as const },
  ];
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

/** Step 1: persist a single-use state bound to user + brand + provider (+ where it started), return the consent URL. */
export async function startConnect(input: {
  workspaceId: string;
  brandId: string;
  userId: string;
  provider: OAuthProvider;
  /** "mobile": the callback sends the code back to the app instead of connecting (see the callback route). */
  client?: "web" | "mobile";
}) {
  const cfg = providerConfig(input.provider);
  if (!cfg) throw new ConnectionError(`${PROVIDERS[input.provider].label} isn't set up yet (missing app keys)`);
  const { raw, hash } = newToken();
  await prisma.oAuthStateTransaction.create({
    data: { ...input, client: input.client ?? "web", stateHash: hash, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
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
  provider: OAuthProvider;
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
  if (consumed.count !== 1) {
    const replay = await replayedConnect(stateHash, input);
    if (replay) return replay;
    throw new ConnectionError("This connect link expired or was already used. Try again.");
  }
  const st =await prisma.oAuthStateTransaction.findUniqueOrThrow({ where: { stateHash } });

  await requireBrandAccess(st.workspaceId, st.brandId, input.userId);
  await requirePermission(st.workspaceId, input.userId, "integrations.manage", st.brandId);

  const cfg = providerConfig(input.provider);
  if (!cfg) throw new ConnectionError("Provider keys were removed during connect");
  const accounts = await PROVIDERS[input.provider].exchange({ code: input.code, ...cfg });

  const saved = await saveConnections({ workspaceId: st.workspaceId, brandId: st.brandId, provider: input.provider, userId: input.userId, accounts });
  return { workspaceId: st.workspaceId, brandId: st.brandId, connections: saved };
}

/**
 * Save connected accounts (tokens encrypted; a reconnect replaces them in place) and the `integration.connected`
 * audit event in one transaction. Used by the OAuth callback and by Shopify's token connect.
 */
export async function saveConnections(input: { workspaceId: string; brandId: string; provider: IntegrationProvider; userId: string; accounts: ConnectedAccount[] }) {
  const keyVersion = currentKeyVersion();
  return prisma.$transaction(async (tx) => {
    const rows = [];
    for (const a of input.accounts) {
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
              brandId: input.brandId,
              provider: input.provider,
              externalAccountId: a.externalAccountId,
            },
          },
          create: { ...data, workspaceId: input.workspaceId, brandId: input.brandId, provider: input.provider, externalAccountId: a.externalAccountId },
          update: data, // reconnect refreshes tokens in place
        }),
      );
    }
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        actorUserId: input.userId,
        action: "integration.connected",
        entityType: "IntegrationConnection",
        entityId: rows[0].id,
        metadata: { provider: input.provider, accounts: rows.map((r) => r.displayName) },
      },
    });
    return rows;
  });
}

/**
 * Browsers and providers sometimes hit the callback twice (back button, prefetch, a double
 * redirect). The first request consumed the state and connected; the repeat should report the
 * same success, not "already used". Only the same user, the same state, within 2 minutes, and it
 * never issues or touches tokens. Waits briefly in case the first request is still exchanging.
 */
async function replayedConnect(stateHash: string, input: { provider: OAuthProvider; userId: string }) {
  const st = await prisma.oAuthStateTransaction.findUnique({ where: { stateHash } });
  if (!st?.consumedAt || st.userId !== input.userId || st.provider !== input.provider) return null;
  if (Date.now() - st.consumedAt.getTime() > 2 * 60_000) return null;
  await requireBrandAccess(st.workspaceId, st.brandId, input.userId);
  for (let i = 0; i < 15; i++) {
    const connections = await prisma.integrationConnection.findMany({
      where: { brandId: st.brandId, provider: input.provider, status: "ACTIVE", updatedAt: { gte: st.consumedAt } },
    });
    if (connections.length) return { workspaceId: st.workspaceId, brandId: st.brandId, connections };
    await new Promise((r) => setTimeout(r, 1000)); // ponytail: polls ~15s; the first request's exchange is usually <5s
  }
  return null;
}

/**
 * Disconnect = forget the tokens. Posts scheduled to this account are cancelled now (back to
 * Approved, ready to schedule elsewhere) rather than failing silently at their time.
 * Returns null when there was nothing to disconnect, else how many scheduled posts were cancelled.
 * ponytail: no provider-side revoke call; the user can also remove the app in the platform's settings.
 */
export async function disconnect(input: { workspaceId: string; brandId: string; connectionId: string; userId: string }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.integrationConnection.updateMany({
      where: { id: input.connectionId, workspaceId: input.workspaceId, brandId: input.brandId, status: { not: "REVOKED" } },
      data: { status: "REVOKED", encryptedCredentials: null },
    });
    if (count === 0) return null;
    const scheduled = await tx.publicationAttempt.findMany({ where: { connectionId: input.connectionId, status: "SCHEDULED" }, select: { id: true, contentItemId: true, target: true } });
    // A story's Post the rest carries frames already out: it goes back to PARTIAL with its item still SCHEDULED (as
    // cancelling it does), not to an approved story whose next schedule would post those frames again.
    const partial = scheduled.filter((a) => postedCount(storyTargetOf(a.target)?.progress ?? []) > 0);
    const plain = scheduled.filter((a) => !partial.includes(a));
    if (partial.length) {
      await tx.publicationAttempt.updateMany({
        where: { id: { in: partial.map((a) => a.id) }, status: "SCHEDULED" },
        data: { status: "PARTIAL", error: "The account was disconnected. Reconnect it, then post the rest or mark the story as done." },
      });
    }
    if (plain.length) {
      await tx.publicationAttempt.updateMany({
        where: { id: { in: plain.map((a) => a.id) }, status: "SCHEDULED" },
        data: { status: "CANCELLED", error: "Cancelled because the account was disconnected. Schedule it again with a connected account." },
      });
      await tx.contentItem.updateMany({ where: { id: { in: plain.map((a) => a.contentItemId) }, status: "SCHEDULED" }, data: { status: "APPROVED" } });
    }
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        actorUserId: input.userId,
        action: "integration.disconnected",
        entityType: "IntegrationConnection",
        entityId: input.connectionId,
        metadata: { cancelledPosts: scheduled.length },
      },
    });
    return { cancelled: scheduled.length };
  });
}
