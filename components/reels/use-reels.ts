"use client";

import { useCallback, useMemo, useState } from "react";
import { isReelIdea, reelStage, type CloningInfo, type ReelDetail, type ReelOptions, type ReelSummary, type ReelVoiceOption } from "@/shared";
import { JOB_INTERVALS, sharedAt, useJob } from "@/components/workspace/use-job";
import { createLinkCache, useRereadWhenStale } from "@/components/workspace/use-steady-links";
import { stale } from "@/lib/signed-links";
import type { Opportunity } from "@/components/workspace/content-panels";
import { errorMessage } from "@/components/settings/api";
import { opportunitiesUrl, reelOptionsUrl, reelUrl, reelsApi, reelsUrl, voicesUrl } from "./api";
import { RENDER_SLOW_MS, keepReelLinks, optionsMaking, rendering } from "./reel";

// One link cache per type (the list's summaries, the page's detail): see createLinkCache for the ceiling.
const summaries = createLinkCache<ReelSummary>((r) => r.id, keepReelLinks);
const details = createLinkCache<ReelDetail>((d) => d.item.id, keepReelLinks);

const STOP_ON = [403, 404] as const;
const processing = (r: ReelSummary) => reelStage(r) === "processing";

/** The brand's reels, newest first; polls while one is processing, and reads again when the shown links near their hour. */
export function useReels(w: string, b: string) {
  const url = reelsUrl(w, b);
  const pick = useMemo(() => (d: never) => (d as { reels: ReelSummary[] }).reels.map((r) => summaries.steady(r, sharedAt(url))), [url]);
  const done = useMemo(() => (reels: ReelSummary[]) => !reels.some(processing) && !stale(summaries.linksAt(reels)), []);
  const { data, failed, status, reload } = useJob(url, { pick, done, intervals: JOB_INTERVALS.reelList, stopOn: STOP_ON });
  useRereadWhenStale(data && data.length > 0 ? summaries.linksAt(data) : null, reload);
  return { data, failed, status, reload };
}

/**
 * One reel in full; polls while a render runs. A 403 or 404 stops polling (`status` says which). `slow`: this page has
 * polled a render for RENDER_SLOW_MS (the Video step also counts from the render's start: renderLong). The wait for
 * the checks after a render isn't polled here: the Review step drives its own, with an end, so a check run that never
 * lands can't keep every open tab polling.
 */
export function useReel(w: string, b: string, id: string) {
  const url = reelUrl(w, b, id);
  const pick = useMemo(() => (d: never) => details.steady(d as ReelDetail, sharedAt(url)), [url]);
  const done = useMemo(() => (d: ReelDetail) => !rendering(d) && !stale(details.linksAt([d])), []);
  const { data, failed, slow, status, reload } = useJob(url, { pick, done, intervals: JOB_INTERVALS.reelRender, capMs: RENDER_SLOW_MS, stopOn: STOP_ON });
  useRereadWhenStale(data ? details.linksAt([data]) : null, reload);
  return { data, failed, slow, status, reload };
}

const identity = (d: never) => d as ReelOptions;

/** The templates and presenters: polled while one is being made, and read again when their preview links go stale. */
export function useReelOptions(w: string, b: string) {
  const url = reelOptionsUrl(w, b);
  const done = useMemo(() => (o: ReelOptions) => !optionsMaking(o) && !stale(sharedAt(url)), [url]);
  const { data, failed, reload } = useJob(url, { pick: identity, done, intervals: JOB_INTERVALS.reelOptions });
  useRereadWhenStale(data ? sharedAt(url) : null, reload);
  return { data, failed, reload };
}

/** Removes a presenter, one at a time, then reads the options again. Shared by the reels home and the Presenter step. */
export function usePresenterRemove(w: string, b: string, reload: () => Promise<unknown>) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remove = useCallback(async (id: string) => {
    if (removing) return;
    setRemoving(id);
    setError(null);
    try {
      await reelsApi.removePresenter(w, b, id);
    } catch (e) {
      setError(errorMessage(e));
    }
    await reload().catch(() => undefined);
    setRemoving(null);
  }, [w, b, reload, removing]);
  return { removing, error, remove };
}

const pickVoices = (d: never) => d as { voices: ReelVoiceOption[]; cloning: CloningInfo };

/** The voices a reel may use and what cloning needs: read once, and again when the clone samples (signed links) go stale. */
export function useVoices(w: string, b: string) {
  const url = voicesUrl(w, b);
  const done = useMemo(() => () => !stale(sharedAt(url)), [url]);
  const { data, reload } = useJob(url, { pick: pickVoices, done, intervals: JOB_INTERVALS.always });
  useRereadWhenStale(data ? sharedAt(url) : null, reload);
  return { data, reload };
}

const pickIdeas = (d: never) => (d as { opportunities: Opportunity[] }).opportunities.filter(isReelIdea);
const once = () => true;

/** The brand's reel ideas, read once; `reload` after "Use this idea" only. */
export function useReelIdeas(w: string, b: string) {
  const { data, reload } = useJob(opportunitiesUrl(w, b), { pick: pickIdeas, done: once, intervals: JOB_INTERVALS.always });
  return { data, reload };
}
