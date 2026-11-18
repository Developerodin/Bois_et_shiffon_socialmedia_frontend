import { Fragment } from "react";
import { Play } from "lucide-react";
import { VIDEO_MODEL_NAMES, type ReelDetail, type ReelOptions } from "@/shared";
import { Button } from "@/components/ui/button";
import { JOIN_LABELS } from "./labels";

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/** The Storyboard step, read-only: the plan's facts and each scene. Takes the reel and options as props; the page owns the preview. */
export function StoryboardStep({ detail, options, current, onSelect, onWatch }: {
  detail: ReelDetail;
  options: ReelOptions | null | undefined;
  current: number;
  onSelect: (index: number) => void;
  onWatch: () => void;
}) {
  const plan = detail.plan;
  if (!plan) return null;
  const presenter = plan.presenter === "none" ? "No presenter" : options?.presenters.find((p) => p.id === plan.presenter)?.name ?? "Presenter";
  const facts = [detail.seconds !== null ? `${detail.seconds} s` : null, "9:16 vertical", presenter, plural(plan.scenes.length, "scene")].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{facts}</p>
      {detail.videoUrl ? (
        <Button type="button" variant="outline" className="self-start" onClick={onWatch}>
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
                  {photo ? <img src={photo} alt={s.shot} className="h-full w-full object-cover" /> : null}
                </button>
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <h3 className="font-medium">{i + 1}. {s.shot}</h3>
                  <p className="text-muted-foreground">{s.direction}</p>
                  {s.onScreenText ? <p>On screen: {s.onScreenText}</p> : null}
                  {s.voiceText ? <p>{s.voiceText}</p> : null}
                  {model ? <p className="text-xs text-muted-foreground">{model}</p> : null}
                  {s.standIn ? <p className="text-xs text-destructive">This photo shows something else. Pick the right one before making the video.</p> : null}
                </div>
              </li>
              {next ? <li aria-hidden="true" className="px-4 text-center text-xs text-muted-foreground">{next}</li> : null}
            </Fragment>
          );
        })}
      </ol>
      <p className="text-sm text-muted-foreground">Make the video in the Espanda app for now.</p>
    </div>
  );
}
