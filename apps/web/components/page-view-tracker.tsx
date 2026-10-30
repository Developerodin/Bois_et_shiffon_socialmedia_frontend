"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Records each page the person opens (admin console → Activity). A beacon: it never slows navigation, and a lost one
 * is just a missing row. The server drops paths it doesn't keep (/admin, /api, /invite) and checks the workspace.
 */
export function PageViewTracker({ workspaceId, brandId }: { workspaceId: string | null; brandId: string | null }) {
  const path = usePathname();
  const sent = useRef<string | null>(null); // React runs effects twice in development: one visit, one row
  useEffect(() => {
    if (sent.current === path) return;
    sent.current = path;
    const body = JSON.stringify({ path, platform: "web", workspaceId: workspaceId ?? undefined, brandId: brandId ?? undefined });
    navigator.sendBeacon("/api/v1/activity/page-views", new Blob([body], { type: "application/json" }));
  }, [path, workspaceId, brandId]);
  return null;
}
