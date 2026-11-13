import type { IntegrationProvider } from "@prisma/client";
import { ProviderError } from "@/server/integrations/providers";

/**
 * One call per platform that turns an approved post into a live one. Graph v23 / Threads v1.0 /
 * Pinterest v5. A thrown PublishRefused means the platform said no (safe to fix and retry); any
 * other error (timeout, 5xx, network) means we don't know whether it posted.
 */
export type PostPayload = {
  text: string; // caption + hashtags
  title: string; // Pinterest title
  altText: string;
  link: string | null; // brand website for Pins
  imageUrl: string | null; // the first image
  imageUrls: string[]; // all images (carousels)
  videoUrl: string | null; // Reels
  boardId: string | null;
  /** An Instagram story: one container per frame (see the INSTAGRAM publisher). */
  story?: StoryPayload;
};
/**
 * `frames`: every frame of the story, links signed just before the call; `skip`: frames already posted (their url may
 * be empty). `onPublishing(i)` is awaited before frame i's media_publish (if it throws, nothing is sent for i);
 * `onPublished(i, id)` right after it.
 */
export type StoryPayload = {
  frames: { url: string; kind: "photo" | "video" }[];
  skip: number[];
  onPublishing(i: number): Promise<void>;
  onPublished(i: number, mediaId: string): Promise<void>;
};
export type Published = { externalId: string; externalUrl: string | null };

export class PublishRefused extends Error {}

const GRAPH = "https://graph.facebook.com/v23.0";
const IG = "https://graph.instagram.com/v23.0";
const THREADS = "https://graph.threads.net/v1.0";
const PINTEREST = "https://api.pinterest.com/v5";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string }; message?: string };
  if (res.status >= 400 && res.status < 500) {
    throw new PublishRefused(`${res.status} ${body.error?.message ?? body.message ?? "refused"}`.slice(0, 300));
  }
  if (!res.ok) throw new ProviderError(`${res.status} ${body.error?.message ?? body.message ?? "platform error"}`.slice(0, 300));
  return body;
}

const post = (url: string, params: Record<string, string>) =>
  call<{ id: string }>(url, { method: "POST", body: new URLSearchParams(params) });

/** Containers (Instagram, Threads) process asynchronously; publish only once they are FINISHED. */
async function waitForContainer(url: string, field: "status_code" | "status", tries = 10) {
  for (let i = 0; i < tries; i++) {
    // Nothing is live until media_publish/threads_publish, so even a 5xx here is a safe "not posted".
    const s = await call<Record<string, string>>(url.replace("FIELD", field)).catch((e) => {
      throw e instanceof PublishRefused ? e : new PublishRefused(`The platform didn't confirm the upload (${e instanceof Error ? e.message : "error"}). Nothing was posted. Try again.`);
    });
    if (s[field] === "FINISHED") return;
    if (s[field] === "ERROR" || s[field] === "EXPIRED") throw new PublishRefused(`The platform couldn't process this post (${s[field]})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  // Nothing was published yet (publish is the next call), so this is a safe failure.
  throw new PublishRefused("The platform took too long to process the post. Try again.");
}

export const PUBLISHERS: Partial<
  Record<IntegrationProvider, (p: PostPayload, account: { id: string; token: string }) => Promise<Published>>
> = {
  async META(p, { id, token }) {
    const res = p.imageUrl
      ? await post(`${GRAPH}/${id}/photos`, { url: p.imageUrl, caption: p.text, access_token: token })
      : await post(`${GRAPH}/${id}/feed`, { message: p.text, access_token: token });
    return { externalId: res.id, externalUrl: `https://www.facebook.com/${res.id}` };
  },

  async INSTAGRAM(p, { id, token }) {
    const ready = (cid: string, tries?: number) => waitForContainer(`${IG}/${cid}?fields=FIELD&access_token=${encodeURIComponent(token)}`, "status_code", tries);
    const permalink = (mediaId: string) => call<{ permalink?: string }>(`${IG}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({ permalink: undefined }));
    if (p.story) {
      const { frames, skip, onPublishing, onPublished } = p.story;
      const todo = frames.map((_, i) => i).filter((i) => !skip.includes(i));
      // Phase 1: every container, waited for together (clips up to ~3 min). Nothing is public yet, so any error here,
      // even a 5xx, means nothing was posted. allSettled: no polling is left running after a failure.
      const made = await Promise.allSettled(todo.map(async (i) => {
        const f = frames[i];
        const c = await post(`${IG}/${id}/media`, { media_type: "STORIES", [f.kind === "video" ? "video_url" : "image_url"]: f.url, access_token: token });
        await ready(c.id, f.kind === "video" ? 60 : undefined);
        return c.id;
      }));
      const failed = made.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) {
        const e = failed.reason;
        throw e instanceof PublishRefused ? e : new PublishRefused(`The platform didn't take the frames (${e instanceof Error ? e.message : "error"}). Nothing was posted. Try again.`);
      }
      const containers = made.map((r) => (r as PromiseFulfilledResult<string>).value);
      // Phase 2: publish in order, recording each frame before and after its call.
      let first: string | null = null;
      for (const [n, i] of todo.entries()) {
        await onPublishing(i);
        const res = await post(`${IG}/${id}/media_publish`, { creation_id: containers[n], access_token: token });
        first ??= res.id;
        await onPublished(i, res.id);
      }
      if (!first) throw new PublishRefused("There were no frames left to post");
      return { externalId: first, externalUrl: (await permalink(first)).permalink ?? null };
    }
    let c: { id: string };
    if (p.videoUrl) {
      // Reels: video processing takes longer (up to ~2.5 min, still within the job's time).
      c = await post(`${IG}/${id}/media`, { media_type: "REELS", video_url: p.videoUrl, caption: p.text, share_to_feed: "true", access_token: token });
      await ready(c.id, 50);
    } else if (p.imageUrls.length > 1) {
      const children: string[] = [];
      for (const url of p.imageUrls) {
        const child = await post(`${IG}/${id}/media`, { image_url: url, is_carousel_item: "true", alt_text: p.altText, access_token: token });
        await ready(child.id);
        children.push(child.id);
      }
      c = await post(`${IG}/${id}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: p.text, access_token: token });
      await ready(c.id);
    } else {
      c = await post(`${IG}/${id}/media`, { image_url: p.imageUrl!, caption: p.text, alt_text: p.altText, access_token: token });
      await ready(c.id);
    }
    const res = await post(`${IG}/${id}/media_publish`, { creation_id: c.id, access_token: token });
    const link = await call<{ permalink?: string }>(`${IG}/${res.id}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({ permalink: undefined }));
    return { externalId: res.id, externalUrl: link.permalink ?? null };
  },

  async THREADS(p, { id, token }) {
    const c = await post(`${THREADS}/${id}/threads`, {
      ...(p.imageUrl ? { media_type: "IMAGE", image_url: p.imageUrl, alt_text: p.altText } : { media_type: "TEXT" }),
      text: p.text,
      access_token: token,
    });
    await waitForContainer(`${THREADS}/${c.id}?fields=FIELD&access_token=${encodeURIComponent(token)}`, "status");
    const res = await post(`${THREADS}/${id}/threads_publish`, { creation_id: c.id, access_token: token });
    const link = await call<{ permalink?: string }>(`${THREADS}/${res.id}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({ permalink: undefined }));
    return { externalId: res.id, externalUrl: link.permalink ?? null };
  },

  async PINTEREST(p, { token }) {
    const res = await call<{ id: string }>(`${PINTEREST}/pins`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        board_id: p.boardId,
        title: p.title.slice(0, 100),
        description: p.text.slice(0, 500),
        alt_text: p.altText.slice(0, 500),
        ...(p.link ? { link: p.link } : {}),
        media_source: { source_type: "image_url", url: p.imageUrl },
      }),
    });
    return { externalId: res.id, externalUrl: `https://www.pinterest.com/pin/${res.id}/` };
  },
};

export async function pinterestBoards(token: string) {
  const res = await call<{ items: { id: string; name: string }[] }>(`${PINTEREST}/boards?page_size=100`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return res.items.map((b) => ({ id: b.id, name: b.name }));
}

/** The account's rolling 24 h API publishing limit (stories count toward it). A 4xx is a PublishRefused. */
export async function instagramPublishingLimit(account: { id: string; token: string }) {
  const res = await call<{ data?: { config?: { quota_total?: number; quota_duration?: number }; quota_usage?: number }[] }>(
    `${IG}/${account.id}/content_publishing_limit?fields=config,quota_usage&access_token=${encodeURIComponent(account.token)}`,
  );
  const d = res.data?.[0];
  if (typeof d?.config?.quota_total !== "number" || typeof d.quota_usage !== "number") throw new ProviderError("Instagram didn't say how much of its daily limit is left");
  return { config: { quota_total: d.config.quota_total, quota_duration: d.config.quota_duration ?? 86_400 }, quota_usage: d.quota_usage };
}

/** A media's permalink (a story's stops working after 24 h). */
export async function instagramPermalink(mediaId: string, account: { token: string }) {
  const res = await call<{ permalink?: string }>(`${IG}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(account.token)}`);
  return res.permalink ?? null;
}
