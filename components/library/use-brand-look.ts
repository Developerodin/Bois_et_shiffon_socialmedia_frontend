"use client";

import { useCallback } from "react";
import type { BrandAssetsView } from "@/shared";
import { JOB_INTERVALS, putShared, sharedAt, useJob } from "@/components/workspace/use-job";
import { stale } from "@/lib/signed-links";
import { brandLookUrl } from "./api";

const pick = (d: never) => d as BrandAssetsView;

/**
 * The brand's look and photo library, shared by every panel on the page. Reads again once the answer is 50 minutes
 * old. Ceiling: that check runs on render, so a page nobody touches re-reads on its next render or Refresh.
 */
export function useBrandLook(workspaceId: string, brandId: string) {
  const url = brandLookUrl(workspaceId, brandId);
  const done = useCallback(() => !stale(sharedAt(url)), [url]);
  const { data, failed, reload } = useJob(url, { pick, done, intervals: JOB_INTERVALS.always });
  // The URL is fixed when the edit starts: an answer for this brand never lands on another.
  const set = useCallback((view: BrandAssetsView) => putShared(url, view), [url]);
  return { view: data, failed, reload, set };
}
