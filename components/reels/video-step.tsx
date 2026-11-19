"use client";

import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ReelDetail } from "@/shared";
import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/ui/job-progress";
import { usePlan } from "@/components/shell/use-plan-credits";
import { creditsText } from "@/lib/plan-credits";
import { STOPPED_AT, failureText } from "./labels";
import { makeVideoBlock, reelHref, renderLong, renderSteps, rendering, retryPriceNote, type ReelStep } from "./reel";
import { useRenderPress } from "./use-render-press";

const LINK = "rounded-full font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The Video step (the phone's R05 Generating and X01 Video failed): the video, the running render's progress, or why it
 * failed with Try again. Memoised: the page re-renders per chat frame, and every prop here is a primitive, `detail`, or a
 * stable callback.
 */
export const VideoStep = memo(function VideoStep({ workspaceId, brandId, detail, slow, failed, reload, ended, canCreate, chatBusy, saving, go }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  /** useReel's: this page has polled the render for RENDER_SLOW_MS. */
  slow: boolean;
  failed: boolean;
  reload: () => Promise<void>;
  /** The page's line for a render that just ended; focus moves to Review your reel when it turns non-null here. */
  ended: string | null;
  canCreate: boolean;
  chatBusy: boolean;
  saving: boolean;
  go: (s: ReelStep) => void;
}) {
  const { unlimited } = usePlan(workspaceId);
  const steps = useMemo(() => renderSteps(detail), [detail]);
  // Counted from the render's own start as well, checked on each read, so a page opened late into a render says so at once.
  const long = useMemo(() => renderLong(detail, Date.now()), [detail]);
  const slowNow = slow || long;
  const job = useMemo(() => ({ slow: slowNow, failed, reload }), [slowNow, failed, reload]);

  const reviewRef = useRef<HTMLButtonElement>(null);
  const seen = useRef(ended);
  useEffect(() => {
    if (ended && ended !== seen.current) reviewRef.current?.focus();
    seen.current = ended;
  }, [ended]);

  const render = detail.renders[0];

  if (detail.videoUrl) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm font-medium">Your reel is ready.</p>
        <Button ref={reviewRef} type="button" onClick={() => go("review")}>Review your reel</Button>
      </div>
    );
  }

  if (rendering(detail) && render) {
    const reserved = unlimited ? null : (render.credits ?? detail.price);
    return (
      <div className="flex flex-col gap-3">
        <JobProgress title="Creating your reel" steps={steps} job={job} />
        <p className="text-sm text-muted-foreground">Composing visuals, voiceover and motion pacing for {detail.plan?.title ?? detail.item.title}.</p>
        {reserved !== null ? <p className="text-sm">{creditsText(reserved)} reserved</p> : null}
        <p className="text-sm text-muted-foreground">It&apos;s safe to leave this page.</p>
      </div>
    );
  }

  if (render?.step === "FAILED") {
    return <VideoFailed workspaceId={workspaceId} brandId={brandId} detail={detail} unlimited={unlimited} canCreate={canCreate} chatBusy={chatBusy} saving={saving} go={go} />;
  }

  return (
    <p className="text-sm text-muted-foreground">
      No video yet.{" "}
      <Link href={reelHref(detail.item.id, brandId, "storyboard")} replace className={LINK}>Go to the storyboard</Link>
    </p>
  );
});

/** X01: why the render failed, what it gave back, and Try again (one press, as Make video). */
function VideoFailed({ workspaceId, brandId, detail, unlimited, canCreate, chatBusy, saving, go }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  unlimited: boolean;
  canCreate: boolean;
  chatBusy: boolean;
  saving: boolean;
  go: (s: ReelStep) => void;
}) {
  const render = detail.renders[0]!;
  const failure = render.failure;
  const released = unlimited ? null : render.credits;
  const note = retryPriceNote(detail, unlimited);
  const others = (
    <>
      <Button type="button" variant="outline" onClick={() => go("storyboard")}>Edit storyboard</Button>
      {/* The voices sheet lives in the Script step, so this opens the step. */}
      {failure?.kind === "voiceDeleted" ? <Button type="button" variant="outline" onClick={() => go("script")}>Change voice</Button> : null}
    </>
  );
  return (
    <div className="flex flex-col items-start gap-3">
      <h3 className="text-lg font-semibold">Your reel isn&apos;t ready</h3>
      <p role="alert" className="text-sm text-destructive">{failureText(failure ?? { kind: "other", stoppedAt: "VOICE" })}</p>
      {failure ? <p className="text-sm text-muted-foreground">Failed at: {STOPPED_AT[failure.stoppedAt]}</p> : null}
      {released !== null ? <p className="text-sm text-muted-foreground">{released} reserved {released === 1 ? "credit" : "credits"} released</p> : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      {canCreate ? <TryAgain workspaceId={workspaceId} brandId={brandId} detail={detail} chatBusy={chatBusy} saving={saving} go={go}>{others}</TryAgain> : <div className="flex flex-wrap gap-2">{others}</div>}
    </div>
  );
}

/** Its own component so the press hook mounts only for someone who can make videos. `children`: the buttons beside it. */
function TryAgain({ workspaceId, brandId, detail, chatBusy, saving, go, children }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  chatBusy: boolean;
  saving: boolean;
  go: (s: ReelStep) => void;
  children: ReactNode;
}) {
  const { label, ready, pressing, error, press } = useRenderPress(workspaceId, brandId, detail, go);
  const block = makeVideoBlock(detail, chatBusy, saving);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!ready || pressing || !!block} onClick={press}>
          {pressing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {label("Try again")}
        </Button>
        {children}
      </div>
      {block ? <p className="text-sm text-muted-foreground">{block}</p> : null}
      <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
    </div>
  );
}
