import { z } from "zod";
import type { IntegrationConnection } from "@prisma/client";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { call, ProviderError } from "@/server/integrations/providers";
import { accessToken, markReconnect } from "@/server/services/connections";
import { ownMediaKey, PublishingError } from "@/server/services/publishing";
import { signedMediaUrl } from "@/server/storage/media";

/**
 * Google Business Profile for the mobile Google Growth and Reviews screens. Read live from Google on every open; nothing
 * is stored but the connection. Replies and posts go out only from an explicit tap, and are audited with their text.
 * ponytail: live reads, no cache, capped per brand (READS_PER_MIN) so one brand can't spend the project's shared
 * Business Profile quota (~300 req/min). Add a 30-60 s cache when many brands use this at once.
 */
type Scope = { workspaceId: string; brandId: string; userId: string };

const V4 = "https://mybusiness.googleapis.com/v4";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const READS_PER_MIN = 30;
const WRITES_PER_HOUR = 30;

const businessConnection = (scope: Scope) =>
  prisma.integrationConnection.findFirst({
    // ponytail: the first connected location; add a picker when someone manages two.
    where: { workspaceId: scope.workspaceId, brandId: scope.brandId, provider: "GOOGLE_BUSINESS", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

async function limit(scope: Scope, kind: "read" | "write") {
  const [max, windowMs] = kind === "read" ? [READS_PER_MIN, 60_000] : [WRITES_PER_HOUR, 3_600_000];
  if (!(await hitRateLimit(`google:${kind}:${scope.brandId}`, max, windowMs)).allowed) {
    throw new PublishingError(kind === "read" ? "Google is being asked too often. Wait a minute and try again." : "That's a lot of Google updates this hour. Try again later.", 429);
  }
}

/** Google's own error text stays in the logs (it can name the cloud project and quotas); people get a fixed message. */
async function google<T>(conn: IntegrationConnection, url: string, init?: { method: string; body: unknown }): Promise<T> {
  const token = await accessToken(conn);
  try {
    return await call<T>(url, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, ...(init ? { "content-type": "application/json" } : {}) },
      body: init ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    console.error("[google-business]", url.replace(/\?.*/, ""), e.message);
    const status = Number(e.message.slice(0, 3));
    if (status === 401) {
      await markReconnect(conn.id, `Google access was removed. Reconnect ${conn.displayName}.`);
      throw new PublishingError(`Google access to ${conn.displayName} was removed. Reconnect it in Business → Connections.`, 409);
    }
    if (status === 429) throw new PublishingError("Google is busy. Try again in a minute.", 503);
    if (status === 403) throw new PublishingError("Google refused: this account can't manage this Business Profile any more.", 502);
    if (status === 404) throw new PublishingError("Google couldn't find this any more. Refresh and try again.", 404);
    if (status === 400) throw new PublishingError("Google didn't accept this. If your business isn't verified on Google yet, verify it first.", 502);
    throw new PublishingError("Google didn't answer. Try again in a moment.", 502);
  }
}

const locationId = (conn: IntegrationConnection) => conn.externalAccountId.split("/").slice(2).join("/"); // locations/2

async function requireConnection(scope: Scope) {
  const conn = await businessConnection(scope);
  if (!conn) throw new PublishingError("Connect your Google Business Profile first.", 409);
  return conn;
}

/** After Google accepted: a failed audit write is logged, never turned into an error (a retry would post twice). */
async function audit(scope: Scope, conn: IntegrationConnection, action: string, metadata: Record<string, unknown>) {
  await prisma.auditEvent
    .create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action, entityType: "IntegrationConnection", entityId: conn.id, metadata: { location: conn.externalAccountId, ...metadata } as object },
    })
    .catch((e: unknown) => console.error("[google-business] audit failed", action, e));
}

async function location(conn: IntegrationConnection) {
  return google<{
    title?: string;
    websiteUri?: string;
    storefrontAddress?: { addressLines?: string[]; locality?: string; postalCode?: string };
    regularHours?: { periods?: unknown[] };
    metadata?: { newReviewUri?: string; hasVoiceOfMerchant?: boolean };
  }>(conn, `${INFO}/${locationId(conn)}?readMask=title,websiteUri,storefrontAddress,regularHours,metadata`);
}

/** G13/G14 header + Profile tab: the location's public details, and whether the review link is ready. */
export async function businessProfile(scope: Scope) {
  const conn = await businessConnection(scope);
  if (!conn) return { connected: false as const };
  await limit(scope, "read");
  const loc = await location(conn);
  const a = loc.storefrontAddress;
  return {
    connected: true as const,
    name: loc.title ?? conn.displayName,
    address: a ? [...(a.addressLines ?? []), [a.postalCode, a.locality].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null,
    website: loc.websiteUri ?? null,
    hasHours: !!loc.regularHours?.periods?.length,
    /** The link to send customers so they land on "Write a review". Null until Google verifies the profile. */
    reviewUrl: loc.metadata?.newReviewUri ?? null,
    verified: loc.metadata?.hasVoiceOfMerchant ?? false,
  };
}

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as Record<string, number>;

/**
 * A review Google translated carries both texts: "(Translated by Google) …\n\n(Original)\n…" or the original first with
 * "\n\n(Translated by Google)\n…" after it. Keep the person's own words.
 */
export function originalReviewText(comment: string) {
  const original = comment.match(/\(Original\)\s*([\s\S]*)$/);
  if (original) return original[1].trim();
  return comment.split(/\n\n\(Translated by Google\)/)[0].trim();
}

/** Reviews screen: newest first, with the business's reply when there is one, and the shareable review link. */
export async function businessReviews(scope: Scope) {
  const conn = await businessConnection(scope);
  if (!conn) return { connected: false as const, reviews: [] };
  await limit(scope, "read");
  // ponytail: newest 50 (Google's page maximum); page with nextPageToken when someone needs older reviews in the app.
  const [r, loc] = await Promise.all([
    google<{
      averageRating?: number;
      totalReviewCount?: number;
      reviews?: { reviewId: string; reviewer?: { displayName?: string; isAnonymous?: boolean }; starRating?: string; comment?: string; createTime: string; reviewReply?: { comment: string; updateTime: string } }[];
    }>(conn, `${V4}/${conn.externalAccountId}/reviews?pageSize=50&orderBy=updateTime%20desc`),
    location(conn),
  ]);
  return {
    connected: true as const,
    average: r.averageRating ?? null,
    total: r.totalReviewCount ?? 0,
    reviewUrl: loc.metadata?.newReviewUri ?? null,
    reviews: (r.reviews ?? []).map((v) => ({
      id: v.reviewId,
      author: v.reviewer?.isAnonymous ? null : (v.reviewer?.displayName ?? null),
      rating: STARS[v.starRating ?? ""] ?? null,
      comment: originalReviewText(v.comment ?? ""),
      createdAt: v.createTime,
      reply: v.reviewReply ? { comment: v.reviewReply.comment, updatedAt: v.reviewReply.updateTime } : null,
    })),
  };
}

export const ReplyRequest = z.object({ comment: z.string().trim().min(1).max(4000) });
const REVIEW_ID = /^[A-Za-z0-9_-]{1,300}$/;

/** "Post reply" on a review: creates or replaces the business's public reply. Only from the person's tap. */
export async function replyToReview(scope: Scope, reviewId: string, comment: string) {
  if (!REVIEW_ID.test(reviewId)) throw new PublishingError("Unknown review", 404);
  const conn = await requireConnection(scope);
  await limit(scope, "write");
  const r = await google<{ comment: string; updateTime: string }>(conn, `${V4}/${conn.externalAccountId}/reviews/${reviewId}/reply`, { method: "PUT", body: { comment } });
  await audit(scope, conn, "google.review.replied", { reviewId, comment });
  return { comment: r.comment, updatedAt: r.updateTime };
}

/** Posts tab: what's already on the profile. */
export async function businessPosts(scope: Scope) {
  const conn = await businessConnection(scope);
  if (!conn) return [];
  const r = await google<{ localPosts?: { name: string; summary?: string; state?: string; createTime: string; media?: { googleUrl?: string }[] }[] }>(
    conn,
    `${V4}/${conn.externalAccountId}/localPosts?pageSize=10`,
  );
  return (r.localPosts ?? []).map((p) => ({
    id: p.name.split("/").pop()!,
    summary: p.summary ?? "",
    state: p.state ?? "LIVE",
    createdAt: p.createTime,
    photoUrl: p.media?.[0]?.googleUrl ?? null,
  }));
}

export const PostRequest = z.object({
  summary: z.string().trim().min(1).max(1500),
  photoKey: z.string().min(1).max(300).optional(),
});

/** "Publish post": a standard update with a "Learn more" button to the brand's website when it has one. */
export async function createPost(scope: Scope, input: z.infer<typeof PostRequest>) {
  if (input.photoKey && !ownMediaKey(scope, input.photoKey)) throw new PublishingError("Unknown image", 400);
  const conn = await requireConnection(scope);
  await limit(scope, "write");
  const profile = await prisma.brandProfile.findFirst({ where: { brandId: scope.brandId, workspaceId: scope.workspaceId }, select: { websiteUrl: true, locales: true } });
  const language = z.array(z.string()).safeParse(profile?.locales).data?.[0] ?? "en";
  const post = await google<{ name: string }>(conn, `${V4}/${conn.externalAccountId}/localPosts`, {
    method: "POST",
    body: {
      languageCode: language,
      topicType: "STANDARD",
      summary: input.summary,
      ...(profile?.websiteUrl ? { callToAction: { actionType: "LEARN_MORE", url: profile.websiteUrl } } : {}),
      // Google copies the photo when the post is created, so an hour-long link is enough.
      ...(input.photoKey ? { media: [{ mediaFormat: "PHOTO", sourceUrl: await signedMediaUrl(input.photoKey, 3600) }] } : {}),
    },
  });
  await audit(scope, conn, "google.post.created", { post: post.name, summary: input.summary, photoKey: input.photoKey ?? null });
}
