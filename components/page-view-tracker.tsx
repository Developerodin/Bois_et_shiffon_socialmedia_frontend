"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Send one visit as a beacon: it never slows navigation, and a lost one is just a missing row. The body goes as a
 * plain string (text/plain): some browsers throw for a JSON Blob, and recording must never break the page.
 */
export function sendPageView(path: string, workspaceId: string | null, brandId: string | null) {
  try {
    navigator.sendBeacon("/api/v1/activity/page-views", JSON.stringify({ path, platform: "web", workspaceId: workspaceId ?? undefined, brandId: brandId ?? undefined }));
  } catch {
    // ponytail: a refused beacon is a lost visit, by design (the spec's "a trail, not billing")
  }
}

/**
 * Records each page the person opens (admin console → Activity). The server drops paths it doesn't keep
 * (/admin, /api, /invite) and checks the workspace.
 */
export function PageViewTracker({ workspaceId, brandId }: { workspaceId: string | null; brandId: string | null }) {
  const path = usePathname();
  const sent = useRef<string | null>(null); // React runs effects twice in development: one visit, one row
  useEffect(() => {
    const key = `${path}|${workspaceId}|${brandId}`; // switching workspace or project on the same page is a new visit
    if (sent.current === key) return;
    sent.current = key;
    sendPageView(path, workspaceId, brandId);
  }, [path, workspaceId, brandId]);
  return null;
}
