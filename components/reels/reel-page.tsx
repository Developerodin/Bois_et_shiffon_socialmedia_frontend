"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CaptionCue, ReelDetail } from "@/shared";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PreviewFrame } from "@/components/ui/preview-frame";
import { StepsRail } from "@/components/ui/steps-rail";
import { ListSkeleton, LoadError } from "@/components/settings/shared";
import { STEP_LABELS } from "./labels";
import { PlanStep, usePlanChat } from "./plan-step";
import { PhotosStep } from "./photos-step";
import { PresenterStep } from "./presenter-step";
import { ScriptStep } from "./script-step";
import { useReelSave } from "./use-reel-save";
import { BUILT_STEPS, reelHref, renderNews, rendering, stepFrom, stepState, toWebVtt, type ReelStep } from "./reel";
import { ReviewStep } from "./review-step";
import { StoryboardStep } from "./storyboard-step";
import { VideoStep } from "./video-step";
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

/** The cues as a WebVTT `blob:` link for the preview's captions track, revoked when the cues change and on unmount. */
function useCaptionsUrl(cues: CaptionCue[] | null | undefined): string | undefined {
  const vtt = useMemo(() => (cues?.length ? toWebVtt(cues) : null), [cues]);
  const [url, setUrl] = useState<string>();
  // Keyed on the text, not the array: same cues, same URL, so a poll doesn't reload the track.
  useEffect(() => {
    if (!vtt) return setUrl(undefined);
    const u = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [vtt]);
  return url;
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
export function ReelPage({ workspaceId, brandId, reelId, step: stepParam, perms }: {
  workspaceId: string;
  brandId: string;
  reelId: string;
  step: string | undefined;
  /** The person's permissions on this brand. Passed as is to the steps that need more than one (Publish). */
  perms: readonly string[];
}) {
  const { data: detail, failed, slow, status, reload } = useReel(workspaceId, brandId, reelId);
  const { data: options } = useReelOptions(workspaceId, brandId);
  const chat = usePlanChat(workspaceId, brandId, reelId);
  // One save lock for the whole page: the steps that edit the plan (Photos, Script) take it from here.
  const save = useReelSave(workspaceId, brandId, reelId);
  const router = useRouter();
  const step = stepFrom(stepParam, detail);
  const [scene, setScene] = useState(0);
  const title = detail?.item.title;
  // Viewers see every step's content, with no Make video, Try again, caption edit or Check again; Download approves.
  const can = useMemo(() => ({
    create: perms.includes("content.create"),
    approve: perms.includes("content.approve"),
    publish: perms.includes("publish.execute"),
  }), [perms]);
  const canCreate = can.create;
  const captionsUrl = useCaptionsUrl(detail?.captions);

  // Stable while the reel and brand stay, so `go` can go to memoised steps (the plan chat re-renders this page per frame).
  const stepHref = useCallback((s: ReelStep) => reelHref(reelId, brandId, s), [reelId, brandId]);
  const go = useCallback((s: ReelStep) => router.replace(stepHref(s)), [router, stepHref]);
  const steps = useMemo(() => BUILT_STEPS.map((s) => ({
    id: s,
    label: STEP_LABELS[s],
    state: stepState(s, detail),
    href: stepHref(s),
  })), [detail, stepHref]);

  // A render that ends, said once wherever the person is (and handed to the Video step, which moves focus on it).
  // Cleared when a render starts, so the next one is announced too.
  const [ended, setEnded] = useState<string | null>(null);
  const prev = useRef<ReelDetail | null>(null);
  useEffect(() => {
    if (!detail) return;
    const before = prev.current?.item.id === detail.item.id ? prev.current : null;
    prev.current = detail;
    if (rendering(detail)) setEnded(null);
    else {
      const news = renderNews(before, detail);
      if (news) setEnded(news);
    }
  }, [detail]);

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
  // The Review step shows the video (with captions); every other step shows the chosen scene's photo.
  const showVideo = step === "review" && !!detail.videoUrl;

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
      {/* Always in the page (sr-only while empty, so it takes no room), so the line is announced when it fills in. On the
          Video step it is only announced: the step shows the same news itself and moves focus to Review your reel. */}
      <p aria-live="polite" className={ended && step !== "video" ? "text-sm font-medium" : "sr-only"}>{ended}</p>

      {/* lg: rail | editor | preview. md–lg: rail | editor, the preview under the editor. Below md: menu, editor, preview. */}
      <div className="grid items-start gap-6 md:grid-cols-[12rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,20rem)]">
        <StepsRail label="Reel steps" steps={steps} current={step} replace />

        <section aria-labelledby="reel-step" className="flex min-w-0 flex-col gap-4">
          <h2 id="reel-step" className="text-lg font-semibold">{STEP_LABELS[step]}</h2>
          {step === "plan" ? <PlanStep detail={detail} options={options} canCreate={canCreate} chat={chat} /> : null}
          {step === "presenter" ? (
            <PresenterStep workspaceId={workspaceId} brandId={brandId} detail={detail} options={options} canCreate={canCreate} chat={chat} save={save} />
          ) : null}
          {step === "photos" ? (
            <PhotosStep workspaceId={workspaceId} brandId={brandId} detail={detail} canCreate={canCreate} save={save} chatBusy={chat.stream.sending} />
          ) : null}
          {step === "script" ? (
            <ScriptStep workspaceId={workspaceId} brandId={brandId} detail={detail} canCreate={canCreate} save={save} chatBusy={chat.stream.sending} />
          ) : null}
          {step === "storyboard" ? (
            <StoryboardStep
              workspaceId={workspaceId}
              brandId={brandId}
              photosHref={stepHref("photos")}
              detail={detail}
              options={options}
              canCreate={canCreate}
              chatBusy={chat.stream.sending}
              saving={save.saving}
              go={go}
              current={index}
              onSelect={setScene}
            />
          ) : null}
          {step === "video" ? (
            <VideoStep
              workspaceId={workspaceId}
              brandId={brandId}
              detail={detail}
              slow={slow}
              failed={failed}
              reload={reload}
              ended={ended}
              canCreate={canCreate}
              chatBusy={chat.stream.sending}
              saving={save.saving}
              go={go}
            />
          ) : null}
          {step === "review" ? (
            <ReviewStep workspaceId={workspaceId} brandId={brandId} detail={detail} reload={reload} canCreate={canCreate} canApprove={can.approve} go={go} />
          ) : null}
        </section>

        <section id="reel-preview" tabIndex={-1} aria-label="Preview" className="min-w-0 focus-visible:outline-none md:col-start-2 lg:col-start-3 lg:row-start-1">
          <PreviewFrame
            photoUrl={shown ? detail.photoUrls[shown.photoKey] : undefined}
            videoUrl={showVideo ? (detail.videoUrl ?? undefined) : undefined}
            alt={shown?.shot ?? ""}
            // The rendered video carries no on-screen text (only the "Made with AI" mark), so the overlay is hidden over it.
            onScreenText={showVideo ? undefined : shown?.onScreenText}
            captionsUrl={showVideo ? captionsUrl : undefined}
            captionsLang={detail.plan?.language ?? "en"}
            noDownload={showVideo}
          />
          {showVideo ? null : scenes.length > 1 ? (
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
