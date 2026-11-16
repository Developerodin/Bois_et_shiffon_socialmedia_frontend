import { z } from "zod";
import type { IntegrationConnection } from "@prisma/client";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { call, ProviderError } from "@/server/integrations/providers";
import { accessToken, markReconnect } from "@/server/services/connections";
import { PublishingError } from "@/server/services/publishing";

/**
 * Customers inbox (mobile M02/M03/M17): Instagram Direct and Facebook Messenger conversations, read live from Meta with
 * the brand's connected accounts. Nothing is stored. A reply goes out only from the person's tap, and is audited.
 * ponytail: pull on open, no webhooks, so no "new message" notifications; add Meta webhooks + a message table for that.
 * Meta only accepts replies within 24 hours of the customer's last message (standard messaging window).
 */
type Scope = { workspaceId: string; brandId: string; userId: string };
type Channel = "INSTAGRAM" | "META";

const IG = "https://graph.instagram.com/v23.0";
const FB = "https://graph.facebook.com/v23.0";
/** The scope each account needs for messages; accounts connected before inbox existed lack it until reconnected. */
const MESSAGING_SCOPE: Record<Channel, string> = { INSTAGRAM: "instagram_business_manage_messages", META: "pages_messaging" };
const READS_PER_MIN = 30;
const SENDS_PER_HOUR = 60;

type Raw = {
  id: string;
  updated_time: string;
  participants?: { data: { id: string; name?: string; username?: string }[] };
  messages?: { data: { id: string; message?: string; created_time: string; from?: { id: string } }[] };
};

const accounts = (scope: Scope) =>
  prisma.integrationConnection.findMany({
    where: { workspaceId: scope.workspaceId, brandId: scope.brandId, provider: { in: ["INSTAGRAM", "META"] }, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

async function limit(key: string, max: number, windowMs: number, message: string) {
  if (!(await hitRateLimit(key, max, windowMs)).allowed) throw new PublishingError(message, 429);
}

async function meta<T>(conn: IntegrationConnection, path: string, params: Record<string, string>, body?: unknown): Promise<T> {
  const token = await accessToken(conn);
  const base = conn.provider === "INSTAGRAM" ? IG : FB;
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  try {
    return await call<T>(`${base}/${path}?${qs}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    console.error("[inbox]", conn.provider, path, e.message);
    if (/allowed window|2018278|outside of allowed/i.test(e.message)) throw new PublishingError("Meta only allows replies within 24 hours of the customer's last message. Answer them in the Instagram or Messenger app.", 409);
    // Code 190 / "Invalid OAuth … Token": the token is dead (expired, password changed, app removed).
    if (/OAuth[^"]*Token|access token|\(#190\)/i.test(e.message)) await markReconnect(conn.id, `Access expired. Reconnect ${conn.displayName}.`);
    if (/^(401|403) /.test(e.message) || /permission|OAuth/i.test(e.message)) throw new PublishingError(`${conn.displayName} can't read or send messages. Reconnect it in Business → Connections.`, 409);
    throw new PublishingError("Meta didn't answer. Try again in a moment.", 502);
  }
}

const person = (c: IntegrationConnection, r: Raw) => {
  const p = r.participants?.data.find((x) => x.id !== c.externalAccountId) ?? r.participants?.data[0];
  return { id: p?.id ?? "", name: p?.name ?? (p?.username ? `@${p.username}` : null) };
};

/** Inbox: each messaging account's state, and the latest conversations across them, newest first. */
export async function inbox(scope: Scope) {
  await limit(`inbox:read:${scope.brandId}`, READS_PER_MIN, 60_000, "Messages are being refreshed too often. Wait a minute.");
  const conns = await accounts(scope);
  const results = await Promise.all(
    conns.map(async (c) => {
      const channel = c.provider as Channel;
      const canRead = c.scopes.includes(MESSAGING_SCOPE[channel]);
      const account = { connectionId: c.id, channel, name: c.displayName, canRead, error: null as string | null };
      if (!canRead) return { account, conversations: [] };
      try {
        // ponytail: the 20 most recent conversations per account; page when someone needs older ones in the app.
        const r = await meta<{ data: Raw[] }>(c, channel === "INSTAGRAM" ? "me/conversations" : `${c.externalAccountId}/conversations`, {
          platform: channel === "INSTAGRAM" ? "instagram" : "messenger",
          fields: "participants,updated_time,messages.limit(1){message,created_time,from}",
          limit: "20",
        });
        return {
          account,
          conversations: r.data.map((x) => {
            const last = x.messages?.data[0];
            return {
              id: x.id,
              connectionId: c.id,
              channel,
              person: person(c, x),
              updatedAt: x.updated_time,
              last: last ? { text: last.message ?? "", at: last.created_time, fromCustomer: last.from?.id !== c.externalAccountId } : null,
            };
          }),
        };
      } catch (e) {
        return { account: { ...account, error: e instanceof Error ? e.message : String(e) }, conversations: [] };
      }
    }),
  );
  return {
    accounts: results.map((r) => r.account),
    conversations: results.flatMap((r) => r.conversations).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

const ID = /^[A-Za-z0-9_=-]{1,300}$/;

async function connection(scope: Scope, connectionId: string) {
  const c = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, workspaceId: scope.workspaceId, brandId: scope.brandId, provider: { in: ["INSTAGRAM", "META"] }, status: "ACTIVE" },
  });
  if (!c) throw new PublishingError("This account isn't connected any more.", 404);
  return c;
}

async function rawThread(c: IntegrationConnection, conversationId: string) {
  if (!ID.test(conversationId)) throw new PublishingError("Unknown conversation", 404);
  return meta<Raw>(c, conversationId, { fields: "participants,updated_time,messages.limit(20){message,created_time,from}" });
}

/** Reply screen: the last 20 messages, oldest first. */
export async function thread(scope: Scope, connectionId: string, conversationId: string) {
  await limit(`inbox:read:${scope.brandId}`, READS_PER_MIN, 60_000, "Messages are being refreshed too often. Wait a minute.");
  const c = await connection(scope, connectionId);
  const r = await rawThread(c, conversationId);
  return {
    channel: c.provider as Channel,
    account: c.displayName,
    person: person(c, r),
    messages: (r.messages?.data ?? [])
      .map((m) => ({ id: m.id, text: m.message ?? "", at: m.created_time, fromCustomer: m.from?.id !== c.externalAccountId }))
      .reverse(),
  };
}

export const SendRequest = z.object({ text: z.string().trim().min(1).max(1000) });

/** "Send": the person's own tap sends their (edited) reply to the customer in this conversation. */
export async function sendReply(scope: Scope, connectionId: string, conversationId: string, text: string) {
  const c = await connection(scope, connectionId);
  await limit(`inbox:send:${scope.brandId}`, SENDS_PER_HOUR, 3_600_000, "That's a lot of messages this hour. Try again later.");
  // The recipient comes from Meta's own conversation, never from the request.
  const to = person(c, await rawThread(c, conversationId)).id;
  if (!to) throw new PublishingError("Unknown conversation", 404);
  const sent = await meta<{ message_id?: string }>(
    c,
    c.provider === "INSTAGRAM" ? "me/messages" : `${c.externalAccountId}/messages`,
    {},
    { recipient: { id: to }, message: { text }, ...(c.provider === "META" ? { messaging_type: "RESPONSE" } : {}) },
  );
  await prisma.auditEvent
    .create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "inbox.reply.sent", entityType: "IntegrationConnection", entityId: c.id, metadata: { conversationId, messageId: sent.message_id ?? null, text } },
    })
    .catch((e: unknown) => console.error("[inbox] audit failed", e)); // sent already: never turn it into an error (a retry would send twice)
}
