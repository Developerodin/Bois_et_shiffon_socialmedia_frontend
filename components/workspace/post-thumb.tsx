"use client";

import { useState } from "react";
import { sameSignedObject } from "@/lib/post-card";

/** How long a signed link is reused (the server signs them for an hour). */
const REUSE_MS = 50 * 60 * 1000;

/**
 * A signed picture link that stays the same across the calendar's polls: the server signs a new link on every read, so
 * without this each poll would change every card's `src` and reload its picture. A link to another object, or one held
 * for 50 minutes, is taken as new.
 */
export function useStableSignedUrl(url: string | null): string | null {
  const [held, setHeld] = useState(() => (url ? { url, at: Date.now() } : null));
  // Adjusted while rendering (as useJob does with its URL), so the old link never shows for a different picture.
  if (url !== held?.url && (!url || !held || !sameSignedObject(held.url, url) || Date.now() - held.at > REUSE_MS)) {
    const next = url ? { url, at: Date.now() } : null;
    setHeld(next);
    return next?.url ?? null;
  }
  return held?.url ?? null;
}

/** A post's picture in a calendar row: lazy, decorative (the row names the post), steady across polls. */
export function PostThumb({ url, className }: { url: string; className: string }) {
  const src = useStableSignedUrl(url);
  // eslint-disable-next-line @next/next/no-img-element -- a signed storage link
  return src ? <img src={src} alt="" loading="lazy" className={className} /> : null;
}
