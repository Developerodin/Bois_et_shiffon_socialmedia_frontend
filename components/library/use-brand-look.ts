"use client";

import { useCallback } from "react";
import type { BrandAssetsView } from "@/shared";
import { JOB_INTERVALS, putShared, sharedAt, useJob } from "@/components/workspace/use-job";
import { brandLookUrl } from "./api";

const STALE_MS = 50 * 60_000; // signed links last an hour (the phone reads again after 50 min)
const pick = (d: never) => d as BrandAssetsView;

/**
 * The brand's look and photo library, shared by every panel on the page. Reads again once the answer is 50 minutes
 * old. Ceiling: that check runs on render, so a page nobody touches refreshes on its next render or tab show.
 */
export function useBrandLook(workspaceId: string, brandId: string) {
  const url = brandLookUrl(workspaceId, brandId);
  const done = useCallback(() => Date.now() - sharedAt(url) < STALE_MS, [url]);
  const { data, failed, reload } = useJob(url, { pick, done, intervals: JOB_INTERVALS.always });
  // The URL is fixed when the edit starts: an answer for this brand never lands on another.
  const set = useCallback((view: BrandAssetsView) => putShared(url, view), [url]);
  return { view: data, failed, reload, set };
}
