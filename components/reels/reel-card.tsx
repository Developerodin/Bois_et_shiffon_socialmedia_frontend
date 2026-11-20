"use client";

import { memo } from "react";
import Link from "next/link";
import { Film } from "lucide-react";
import { reelStage, type ReelStage, type ReelSummary } from "@/shared";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/lib/status";
import { reelHref } from "./reel";

const STAGE_BADGE: Record<ReelStage, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "muted" },
  processing: { label: "Processing", tone: "info" },
  ready: { label: "Ready", tone: "good" },
  failed: { label: "Didn't work", tone: "bad" },
};

/** The card's badge: the render stage, unless the reel is scheduled or posted. */
function badge(r: ReelSummary): { label: string; tone: Tone } {
  if (r.status === "SCHEDULED") return { label: "Scheduled", tone: "info" };
  if (r.status === "PUBLISHED") return { label: "Posted", tone: "good" };
  return STAGE_BADGE[reelStage(r)];
}

/** One reel, linking to its page: its first scene's photo, title, status and length. */
export const ReelCard = memo(function ReelCard({ reel, brandId }: { reel: ReelSummary; brandId: string }) {
  const b = badge(reel);
  return (
    <Link
      href={reelHref(reel.id, brandId)}
      className="block rounded-xl ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block aspect-[9/16]">
        {reel.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed
          <img src={reel.thumbUrl} alt="" loading="lazy" decoding="async" className="size-full rounded-xl bg-muted object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Film className="size-6" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="flex flex-col items-start gap-1 px-1 pt-2">
        <span className="w-full truncate text-sm font-medium">{reel.title}</span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={b.tone}>{b.label}</StatusBadge>
          {reel.seconds !== null ? <span className="text-xs text-muted-foreground">{reel.seconds} s</span> : null}
        </span>
      </span>
    </Link>
  );
});
