import { Fragment } from "react";
import Link from "next/link";
import { Loader2, Play } from "lucide-react";
import { VIDEO_MODEL_NAMES, type ReelDetail, type ReelOptions } from "@/shared";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/shell/use-plan-credits";
import { creditsText } from "@/lib/plan-credits";
import { JOIN_LABELS } from "./labels";
import { makeVideoBlock, presenterName, rendering, type ReelStep } from "./reel";
import { useRenderPress } from "./use-render-press";

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

const LINK = "rounded-full font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The Storyboard step: the plan's facts and each scene, and Make video (See progress while one is made). Takes the reel
 * and options as props; the page owns the preview.
 */
export function StoryboardStep({ workspaceId, brandId, detail, options, canCreate, chatBusy, saving, go, current, photosHref, onSelect }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  options: ReelOptions | null | undefined;
  canCreate: boolean;
  chatBusy: boolean;
  saving: boolean;
  go: (s: ReelStep) => void;
  current: number;
  /** The Photos step's address, for the stand-in scenes' "Pick photos" link. */
  photosHref: string;
  onSelect: (index: number) => void;
}) {
  const plan = detail.plan;
  if (!plan) return null;
  const presenter = presenterName(plan, options);
  const facts = [detail.seconds !== null ? `${detail.seconds} s` : null, "9:16 vertical", presenter, plural(plan.scenes.length, "scene")].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{facts}</p>
      {detail.videoUrl ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => go("review")}>
          <Play className="size-4" aria-hidden="true" />
          Watch the video
        </Button>
      ) : null}
      <ol className="flex flex-col gap-3">
        {plan.scenes.map((s, i) => {
          const photo = detail.photoUrls[s.photoKey];
          const model = s.presenter ? "Presenter" : s.model ? (VIDEO_MODEL_NAMES[s.model] ?? s.model) : null;
          const next = plan.scenes[i + 1] && s.transition ? JOIN_LABELS[s.transition] : null;
          return (
            <Fragment key={i}>
              <li className={`flex gap-4 rounded-2xl border bg-card px-4 py-4 shadow-sm ${i === current ? "border-primary" : "border-border"}`}>
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-label={`Show scene ${i + 1} in the preview`}
                  className="h-28 w-16 shrink-0 overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, as in the library grid */}
                  {photo ? <img src={photo} alt={s.shot} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : null}
                </button>
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <h3 className="font-medium">{i + 1}. {s.shot}</h3>
                  <p className="text-muted-foreground">{s.direction}</p>
                  {s.onScreenText ? <p>On screen: {s.onScreenText}</p> : null}
                  {s.voiceText ? <p>{s.voiceText}</p> : null}
                  {model ? <p className="text-xs text-muted-foreground">{model}</p> : null}
                  {s.standIn ? <p className="text-xs text-destructive">
                      Stand-in: this photo doesn&apos;t show what the scene talks about.{" "}
                      <Link href={photosHref} replace className={LINK}>Pick photos</Link>
                    </p> : null}
                </div>
              </li>
              {next ? <li aria-hidden="true" className="px-4 text-center text-xs text-muted-foreground">{next}</li> : null}
            </Fragment>
          );
        })}
      </ol>
      {rendering(detail) ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => go("video")}>See progress</Button>
      ) : !detail.videoUrl && canCreate ? (
        <MakeVideo workspaceId={workspaceId} brandId={brandId} detail={detail} chatBusy={chatBusy} saving={saving} go={go} photosHref={photosHref} />
      ) : null}
    </div>
  );
}

/** Make video: the page's only primary. Its own component so the press hook mounts only when it can be pressed. */
function MakeVideo({ workspaceId, brandId, detail, chatBusy, saving, go, photosHref }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  chatBusy: boolean;
  saving: boolean;
  go: (s: ReelStep) => void;
  photosHref: string;
}) {
  const { unlimited } = usePlan(workspaceId);
  const { label, ready, pressing, error, press } = useRenderPress(workspaceId, brandId, detail, go);
  const block = makeVideoBlock(detail, chatBusy, saving);
  const standIn = detail.plan?.scenes.some((s) => s.standIn) ?? false;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" disabled={!ready || pressing || !!block} onClick={press}>
        {pressing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {label("Make video")}
      </Button>
      {block ? (
        <p className="text-sm text-muted-foreground">
          {block}
          {standIn ? <>{" "}<Link href={photosHref} replace className={LINK}>Pick photos</Link></> : null}
        </p>
      ) : null}
      {!unlimited && detail.price !== null ? (
        <p className="text-sm text-muted-foreground">Current balance: {creditsText(detail.credits)} · {creditsText(detail.price)} will be reserved</p>
      ) : null}
      <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
    </div>
  );
}
