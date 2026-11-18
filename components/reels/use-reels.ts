"use client";

import { useMemo } from "react";
import { isReelIdea, type ReelDetail, type ReelOptions, type ReelSummary } from "@/shared";
import { JOB_INTERVALS, sharedAt, useJob } from "@/components/workspace/use-job";
import { createLinkCache, useRereadWhenStale } from "@/components/workspace/use-steady-links";
import { stale } from "@/lib/signed-links";
import type { Opportunity } from "@/components/workspace/content-panels";
import { opportunitiesUrl, reelOptionsUrl, reelUrl, reelsUrl } from "./api";
import { keepReelLinks } from "./reel";

// One link cache per type (the list's summaries, the page's detail): see createLinkCache for the ceiling.
const summaries = createLinkCache<ReelSummary>((r) => r.id, keepReelLinks);
const details = createLinkCache<ReelDetail>((d) => d.item.id, keepReelLinks);

const STOP_ON = [403, 404] as const;
const RENDER_STEPS = ["VOICE", "CLIPS", "JOIN"];
const processing = (r: ReelSummary) => RENDER_STEPS.includes(r.render?.step ?? "");

/** The brand's reels, newest first; polls while one is processing, and reads again when the shown links near their hour. */
export function useReels(w: string, b: string) {
  const url = reelsUrl(w, b);
  const pick = useMemo(() => (d: never) => (d as { reels: ReelSummary[] }).reels.map((r) => summaries.steady(r, sharedAt(url))), [url]);
  const done = useMemo(() => (reels: ReelSummary[]) => !reels.some(processing) && !stale(summaries.linksAt(reels)), []);
  const { data, failed, status, reload } = useJob(url, { pick, done, intervals: JOB_INTERVALS.reelList, stopOn: STOP_ON });
  useRereadWhenStale(data && data.length > 0 ? summaries.linksAt(data) : null, reload);
  return { data, failed, status, reload };
}

/** One reel in full; polls while a render runs. A 403 or 404 stops polling (`status` says which). */
export function useReel(w: string, b: string, id: string) {
  const url = reelUrl(w, b, id);
  const pick = useMemo(() => (d: never) => details.steady(d as ReelDetail, sharedAt(url)), [url]);
  const done = useMemo(() => (d: ReelDetail) => !RENDER_STEPS.includes(d.renders[0]?.step ?? "") && !stale(details.linksAt([d])), []);
  const { data, failed, status, reload } = useJob(url, { pick, done, intervals: JOB_INTERVALS.reelRender, stopOn: STOP_ON });
  useRereadWhenStale(data ? details.linksAt([data]) : null, reload);
  return { data, failed, status, reload };
}

const identity = (d: never) => d as ReelOptions;

/** The templates and presenters: read once, and again only when their preview links go stale. */
export function useReelOptions(w: string, b: string) {
  const url = reelOptionsUrl(w, b);
  const done = useMemo(() => () => !stale(sharedAt(url)), [url]);
  const { data, failed, reload } = useJob(url, { pick: identity, done, intervals: JOB_INTERVALS.always });
  useRereadWhenStale(data ? sharedAt(url) : null, reload);
  return { data, failed, reload };
}

const pickIdeas = (d: never) => (d as { opportunities: Opportunity[] }).opportunities.filter(isReelIdea);
const once = () => true;

/** The brand's reel ideas, read once; `reload` after "Use this idea" only. */
export function useReelIdeas(w: string, b: string) {
  const { data, reload } = useJob(opportunitiesUrl(w, b), { pick: pickIdeas, done: once, intervals: JOB_INTERVALS.always });
  return { data, reload };
}
