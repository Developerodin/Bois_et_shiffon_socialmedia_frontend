"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PreviewFrame } from "@/components/ui/preview-frame";
import { StepsRail } from "@/components/ui/steps-rail";
import { ListSkeleton, LoadError } from "@/components/settings/shared";
import { STEP_LABELS } from "./labels";
import { PlanStep, usePlanChat } from "./plan-step";
import { BUILT_STEPS, stepFrom, stepState } from "./reel";
import { StoryboardStep } from "./storyboard-step";
import { useReel, useReelOptions } from "./use-reels";

function BackLink() {
  return (
    <Link
      href="/reels"
      className="inline-flex items-center gap-1 self-start rounded-full text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to reels
    </Link>
  );
}

/** An id that names no reel of this brand, one this role can't read, or not a reel id at all. */
export function ReelNotFound() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <BackLink />
      <PageHeader title="Couldn't load this reel">It may have been made for another business.</PageHeader>
    </div>
  );
}

/**
 * One reel: the steps rail, the current step, and the preview. Reads the reel and the options once here and hands
 * them down; the step comes from `?step=` (or the first thing still to do), clamped to the built steps.
 */
export function ReelPage({ workspaceId, brandId, reelId, step: stepParam, canCreate }: {
  workspaceId: string;
  brandId: string;
  reelId: string;
  step: string | undefined;
  canCreate: boolean;
}) {
  const { data: detail, failed, status, reload } = useReel(workspaceId, brandId, reelId);
  const { data: options } = useReelOptions(workspaceId, brandId);
  const chat = usePlanChat(workspaceId, brandId, reelId);
  const step = stepFrom(stepParam, detail);
  const [scene, setScene] = useState(0);
  const [watching, setWatching] = useState(false);
  const title = detail?.item.title;

  const steps = useMemo(() => BUILT_STEPS.map((s) => ({
    id: s,
    label: STEP_LABELS[s],
    state: stepState(s, detail),
    href: `/reels/${encodeURIComponent(reelId)}?step=${s}&b=${encodeURIComponent(brandId)}`,
  })), [detail, reelId, brandId]);

  useEffect(() => {
    if (title) document.title = `${STEP_LABELS[step]} · ${title} · Reels · Espanda`;
  }, [step, title]);

  if (status === 403 || status === 404) return <ReelNotFound />;
  if (!detail) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <BackLink />
        <PageHeader title="Reel" />
        {failed ? <LoadError message="Couldn't load this reel." onRetry={() => void reload()} /> : <ListSkeleton label="Loading reel" />}
      </div>
    );
  }

  const scenes = detail.plan?.scenes ?? [];
  const index = Math.min(scene, Math.max(scenes.length - 1, 0));
  const shown = scenes[index];
  const showVideo = watching && !!detail.videoUrl;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <a
        href="#reel-preview"
        className="sr-only rounded-full focus:not-sr-only focus:self-start focus:px-3 focus:py-1 focus:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to preview
      </a>
      <BackLink />
      <PageHeader title={detail.item.title} />

      {/* lg: rail | editor | preview. md–lg: rail | editor, the preview under the editor. Below md: menu, editor, preview. */}
      <div className="grid items-start gap-6 md:grid-cols-[12rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,20rem)]">
        <StepsRail label="Reel steps" steps={steps} current={step} replace />

        <section aria-labelledby="reel-step" className="flex min-w-0 flex-col gap-4">
          <h2 id="reel-step" className="text-lg font-semibold">{STEP_LABELS[step]}</h2>
          {step === "plan" ? <PlanStep detail={detail} options={options} canCreate={canCreate} chat={chat} /> : null}
          {step === "storyboard" ? (
            <StoryboardStep detail={detail} options={options} current={index} onSelect={(i) => { setScene(i); setWatching(false); }} onWatch={() => setWatching(true)} />
          ) : null}
        </section>

        <section id="reel-preview" tabIndex={-1} aria-label="Preview" className="min-w-0 focus-visible:outline-none md:col-start-2 lg:col-start-3 lg:row-start-1">
          <PreviewFrame
            photoUrl={shown ? detail.photoUrls[shown.photoKey] : undefined}
            videoUrl={showVideo ? (detail.videoUrl ?? undefined) : undefined}
            alt={shown?.shot ?? ""}
            onScreenText={showVideo ? undefined : shown?.onScreenText}
          />
          {showVideo ? (
            <Button type="button" variant="outline" size="sm" className="mx-auto mt-3 flex" onClick={() => setWatching(false)}>Show the scenes</Button>
          ) : scenes.length > 1 ? (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button type="button" variant="outline" size="icon" aria-label="Previous scene" disabled={index === 0} onClick={() => setScene(index - 1)}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <span className="text-sm text-muted-foreground" aria-live="polite">{index + 1} of {scenes.length}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Next scene" disabled={index >= scenes.length - 1} onClick={() => setScene(index + 1)}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
