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
  imageUrl: string | null;
  boardId: string | null;
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
async function waitForContainer(url: string, field: "status_code" | "status") {
  for (let i = 0; i < 10; i++) {
    const s = await call<Record<string, string>>(url.replace("FIELD", field));
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
    const c = await post(`${IG}/${id}/media`, { image_url: p.imageUrl!, caption: p.text, alt_text: p.altText, access_token: token });
    await waitForContainer(`${IG}/${c.id}?fields=FIELD&access_token=${encodeURIComponent(token)}`, "status_code");
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
