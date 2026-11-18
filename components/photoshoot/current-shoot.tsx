"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Shoot, ShootRequest } from "@/shared";
import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/ui/job-progress";
import { useShootPrices } from "@/components/shell/use-plan-credits";
import { fetchShared, sharedAt, sharedResponse } from "@/components/workspace/use-job";
import { loadPlanCredits, withPrice } from "@/lib/plan-credits";
import { stale } from "@/lib/signed-links";
import { shootUrl, shootsUrl } from "./api";
import { refundLine, shootTitle, waitLine } from "./labels";
import { isRepeatClick } from "./press";
import { retryRequest, shootSteps, stepsDone } from "./shoot";
import { useShoot } from "./use-shoots";

const CARD = "rounded-2xl border border-border bg-card px-5 py-4 shadow-sm";

/**
 * The shoot just started (or named in the URL): its progress, then its four photos or the refund and Try again.
 * Try again re-sends this shoot's own request, priced from its tier, through the studio's presser (`onRetry`).
 */
export function CurrentShoot({ workspaceId, brandId, shootId, onRetry, pressing, retryError }: {
  workspaceId: string;
  brandId: string;
  shootId: string;
  /** Absent for a role that can't start shoots: no Try again. */
  onRetry?: (r: ShootRequest) => void;
  pressing: boolean;
  retryError: string;
}) {
  const job = useShoot(workspaceId, brandId, shootId);
  const { data: shoot, failed, status } = job;
  const { priceOf, blocker: priceBlocker, unlimited } = useShootPrices(workspaceId);
  const steps = useMemo(() => shootSteps(shoot), [shoot]);

  // The refund puts credits back: the chip in the top bar reads them again.
  const shootStatus = shoot?.status;
  useEffect(() => {
    if (shootStatus === "FAILED") void loadPlanCredits(workspaceId, true);
  }, [shootStatus, workspaceId]);

  // The list doesn't poll for this shoot (useShoots trackedId): once it ends, read the list again so its card does too.
  // Also when the list has no answer yet, or one without it: a read already out may predate the end (fresh goes after it).
  useEffect(() => {
    if (shootStatus !== "DONE" && shootStatus !== "FAILED") return;
    const list = shootsUrl(workspaceId, brandId);
    const listed = (sharedResponse(list) as { shoots: Shoot[] } | undefined)?.shoots.find((s) => s.id === shootId);
    if (!listed || listed.status === "RUNNING") void fetchShared(list, true).catch(() => undefined);
  }, [shootStatus, workspaceId, brandId, shootId]);

  if (failed && (status === 403 || status === 404)) {
    return (
      <div role="alert" className={`${CARD} text-sm`}>
        Couldn&apos;t find this photoshoot. It may have been made for another business.
      </div>
    );
  }

  // Links cached over 50 minutes ago may have expired: no photos until the read that replaces them lands.
  const linksOk = shoot !== null && !failed && !stale(sharedAt(shootUrl(workspaceId, brandId, shootId)));
  const title = shoot ? shootTitle(shoot.input) : "";

  return (
    <div className="flex flex-col gap-3">
      {/* Stays mounted on DONE and FAILED, so its live region announces the end. */}
      <JobProgress title={shoot ? waitLine(shoot.input.tier) : "Preparing your photos"} steps={steps} value={stepsDone(steps)} job={job} />

      {shoot?.status === "DONE" ? (
        <div className={`${CARD} flex flex-col gap-4`}>
          {linksOk ? (
            <ul aria-label={`Photos, ${title}`} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {shoot.shots.map((s, i) => (
                <li key={s.key}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed */}
                  <img
                    src={s.url}
                    alt={`Photo ${i + 1} of ${shoot.shots.length}, ${title}`}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/5] w-full rounded-xl bg-muted object-cover"
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <Button asChild variant="outline" className="self-start">
            <Link href={`/photoshoot/${shoot.id}`}>
              Open shoot
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : null}

      {shoot?.status === "FAILED" ? (
        <div className={`${CARD} flex flex-col items-start gap-3`}>
          <h3 className="text-lg font-semibold">This photoshoot didn&apos;t work</h3>
          <p className="text-sm text-muted-foreground">{refundLine(shoot.credits, unlimited)}</p>
          {onRetry ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={pressing || priceBlocker !== null}
                aria-describedby={priceBlocker ? "retry-blocker" : undefined}
                onClick={(e) => {
                  if (!isRepeatClick(e)) onRetry(retryRequest(shoot));
                }}
              >
                {withPrice("Try again", priceOf(shoot.input.tier))}
              </Button>
              {priceBlocker ? <p id="retry-blocker" className="text-sm text-muted-foreground">{priceBlocker}</p> : null}
              <p role="alert" className="text-sm text-destructive empty:hidden">{retryError}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
