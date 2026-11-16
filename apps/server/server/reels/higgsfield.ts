import { safeFetchBytes } from "@/server/research/crawl";
import { type ModelId, VIDEO_MODELS } from "@/server/reels/router";

/**
 * Higgsfield API, the parts reels and photoshoots use: image-to-video on the routed model (router.ts), image models
 * (photoshoot/tiers.ts) and request status.
 * Its API has no voice or stitch models (checked 2026-10-30 via GET /models), so those are ours (voice.ts, join.ts).
 * A user's own video service later sits behind the same two calls.
 */
const BASE = "https://api.higgsfield.ai";

export type HfStatus = { state: "queued" | "in_progress" | "completed" | "failed"; url?: string; error?: string };

// The console's key is "id:secret"; accept it whole in the ID variable, or split across the two.
function authorization() {
  const id = process.env.HIGGSFIELD_API_KEY_ID ?? "";
  const secret = process.env.HIGGSFIELD_API_KEY_SECRET ?? "";
  if (!id) throw new Error("Video making isn't set up on this server (HIGGSFIELD_API_KEY_ID is missing).");
  return `Key ${id.includes(":") ? id : `${id}:${secret}`}`;
}

async function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: authorization(), "Content-Type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Higgsfield ${res.status}: ${typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? data).slice(0, 200)}`);
  return data;
}

export const higgsfield = {
  /** Submit one scene clip. The idempotency key makes a resend return the same job, uncharged. */
  /** webhook: only a public https address (Higgsfield can't call localhost); without one, polling carries the render. */
  async animate(input: { model: ModelId; photoUrl: string; prompt: string; seconds: number; imageUrls?: string[]; audioUrl?: string; webhook?: string; idempotencyKey: string }) {
    const m = VIDEO_MODELS[input.model];
    const data = await call(`${m.path}${input.webhook ? `?hf_webhook=${encodeURIComponent(input.webhook)}` : ""}`, {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: m.body(input),
    });
    if (typeof data.request_id !== "string") throw new Error("Higgsfield accepted the clip but sent no request id");
    return data.request_id;
  },

  /** Submit one image job (a photoshoot shot); same Idempotency-Key rule as animate. */
  async image(path: string, body: Record<string, unknown>, idempotencyKey: string) {
    const data = await call(path, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body });
    if (typeof data.request_id !== "string") throw new Error("Higgsfield accepted the image but sent no request id");
    return data.request_id;
  },

  async status(requestId: string): Promise<HfStatus> {
    const data = await call(`/requests/${encodeURIComponent(requestId)}/status`);
    // Video jobs answer with video.url, image jobs with images[].url.
    const url = (data.video as { url?: string } | undefined)?.url ?? (data.images as { url?: string }[] | undefined)?.[0]?.url;
    switch (data.status) {
      case "completed":
        return url ? { state: "completed", url } : { state: "failed", error: "Finished without a result" };
      case "failed":
        return { state: "failed", error: typeof data.error === "string" ? data.error : "The clip failed" };
      case "nsfw":
        return { state: "failed", error: "The video service refused this scene as unsafe" };
      case "in_progress":
        return { state: "in_progress" };
      default:
        return { state: "queued" };
    }
  },
};

/** Download a finished file Higgsfield's status pointed to: public https hosts only, 100 MB at most (images pass less). */
export async function fetchResult(url: string, maxBytes = 100 * 1024 * 1024): Promise<Uint8Array> {
  if (!url.startsWith("https://")) throw new Error("Result links must be https");
  const res = await safeFetchBytes(url, "*/*", maxBytes, undefined, 120_000); // video files: up to 2 min
  if (res.status !== 200 || res.truncated) throw new Error(`Couldn't download the result (${res.truncated ? "too large" : res.status})`);
  return res.bytes;
}
