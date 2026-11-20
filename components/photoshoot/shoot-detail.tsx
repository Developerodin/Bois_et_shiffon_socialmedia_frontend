"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Loader2 } from "lucide-react";
import type { Shoot } from "@/shared";
import { Button } from "@/components/ui/button";
import { JobProgress } from "@/components/ui/job-progress";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListSkeleton, LoadError } from "@/components/settings/shared";
import { useShootPrices } from "@/components/shell/use-plan-credits";
import { sharedAt, sharedResponse } from "@/components/workspace/use-job";
import { loadPlanCredits, withPrice } from "@/lib/plan-credits";
import { stale } from "@/lib/signed-links";
import { dayDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { shootUrl } from "./api";
import { refundLine, shootBadge, shootTitle, stagingSummary, waitLine } from "./labels";
import { pressAndShow, pressErrorText } from "./press";
import { downloadLink, retryRequest, shootSteps, stepsDone } from "./shoot";
import { useShoot } from "./use-shoots";

const CARD = "rounded-2xl border border-border bg-card px-5 py-4 shadow-sm";

function BackLink() {
  return (
    <Link
      href="/photoshoot"
      className="inline-flex items-center gap-1 self-start rounded-full text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to photoshoots
    </Link>
  );
}

/** An id that names no shoot of this brand (or isn't a shoot id at all). */
export function ShootNotFound() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <BackLink />
      <PageHeader title="Photoshoot not found">It may have been made for another business.</PageHeader>
    </div>
  );
}

/**
 * One photoshoot: its four photos (pick one to see it large, compare it with the original, download it), what it was
 * staged with, and Variation, which runs the same setup again as a new charge and returns to the studio showing it.
 */
export function ShootDetail({ workspaceId, brandId, shootId, canCreate }: {
  workspaceId: string;
  brandId: string;
  shootId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const url = shootUrl(workspaceId, brandId, shootId);
  const job = useShoot(workspaceId, brandId, shootId);
  const { data: shoot, failed, status, reload, linksAt } = job;
  const prices = useShootPrices(workspaceId);
  const steps = useMemo(() => shootSteps(shoot), [shoot]);
  const [selected, setSelected] = useState(0);
  const [compare, setCompare] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  // Seen running here: JobProgress then stays mounted on DONE and FAILED, so its live region announces the end.
  const [sawRunning, setSawRunning] = useState(false);
  if (shoot?.status === "RUNNING" && !sawRunning) setSawRunning(true);
  // A second click in the same frame, before `pressing` disables the button.
  const pressingRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The refund puts credits back: the chip in the top bar reads them again.
  const shootStatus = shoot?.status;
  useEffect(() => {
    if (shootStatus === "FAILED") void loadPlanCredits(workspaceId, true);
  }, [shootStatus, workspaceId]);

  if (status === 404) return <ShootNotFound />;

  // Links cached over 50 minutes ago may have expired: no photos or links until the read that replaces them lands.
  // By the age of the links shown, which keepLinks can hold from before the last read.
  const linksOk = shoot !== null && !stale(linksAt);
  if (!linksOk) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <BackLink />
        <PageHeader title={shoot ? shootTitle(shoot.input) : "Photoshoot"} />
        {failed ? <LoadError message="Couldn't load this photoshoot." onRetry={() => void reload()} /> : <ListSkeleton label="Loading photoshoot" />}
      </div>
    );
  }

  const title = shootTitle(shoot.input);
  const shots = shoot.shots;
  const index = Math.min(selected, Math.max(0, shots.length - 1));
  const shot = shots[index];
  const save = shot ? downloadLink(shot) : null;

  async function download(s: Shoot["shots"][number]) {
    setSaveError("");
    let fresh = s;
    // The page may have sat past the links' hour: read the shoot again and save from the new links.
    if (stale(linksAt)) {
      await reload();
      if (!alive.current) return;
      const again = (sharedResponse(url) as { shoot: Shoot } | undefined)?.shoot.shots.find((x) => x.key === s.key);
      if (!again || stale(sharedAt(url))) {
        setSaveError("Couldn't get this photo. Try again.");
        return;
      }
      fresh = again;
    }
    const link = downloadLink(fresh);
    if (!link) {
      setSaveError("Couldn't get this photo. Try again.");
      return;
    }
    // The attachment link saves the file and leaves the page in place.
    if (link.newTab) window.open(link.href, "_blank", "noopener");
    else window.location.assign(link.href);
  }

  async function variation(from: Shoot) {
    if (pressingRef.current) return;
    pressingRef.current = true;
    setPressing(true);
    setError("");
    let succeeded = false;
    try {
      const next = await pressAndShow(workspaceId, brandId, retryRequest(from));
      if (!alive.current) return;
      // The button stays off until the studio replaces this page: the presser cleared its id, so another press charges again.
      succeeded = true;
      router.push(`/photoshoot?${new URLSearchParams({ shoot: next.id, b: brandId })}`);
    } catch (e) {
      const text = pressErrorText(e);
      if (alive.current && text) setError(text);
    } finally {
      if (!succeeded) {
        pressingRef.current = false;
        if (alive.current) setPressing(false);
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <BackLink />
      <PageHeader title={title}>
        <span className="flex flex-wrap items-center gap-2">
          <time dateTime={shoot.createdAt}>{dayDate(shoot.createdAt)}</time>
          <StatusBadge status={shoot.status}>{shootBadge(shoot, prices.unlimited)}</StatusBadge>
        </span>
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          {sawRunning ? <JobProgress title={waitLine(shoot.input.tier)} steps={steps} value={stepsDone(steps)} job={job} /> : null}

          {shoot.status === "FAILED" ? (
            <div className={`${CARD} flex flex-col gap-2`}>
              <h2 className="text-lg font-semibold">This photoshoot didn&apos;t work</h2>
              <p className="text-sm text-muted-foreground">{refundLine(shoot.credits, prices.unlimited)}</p>
            </div>
          ) : null}

          {shoot.status === "DONE" && shot && save ? (
            <div className={`${CARD} flex flex-col gap-4`}>
              <div className={cn("grid gap-3", compare && "grid-cols-2")}>
                {compare ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed
                  <img src={shoot.sourceUrl} alt="Original photo" decoding="async" className="aspect-[4/5] w-full rounded-xl bg-muted object-contain" />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed */}
                <img
                  src={shot.url}
                  alt={`Photo ${index + 1} of ${shots.length}, ${title}`}
                  decoding="async"
                  className="aspect-[4/5] w-full rounded-xl bg-muted object-contain"
                />
              </div>
              <ul aria-label={`Photos, ${title}`} className="grid grid-cols-4 gap-3">
                {shots.map((s, i) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      aria-label={`Photo ${i + 1} of ${shots.length}, ${title}`}
                      aria-pressed={i === index}
                      onClick={() => setSelected(i)}
                      className={cn(
                        // Selection is the border; the ring is for keyboard focus only (primary and ring are one colour).
                        "block w-full rounded-xl border-2 ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        i === index ? "border-primary" : "border-transparent",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links; next/image needs each host allowed */}
                      <img src={s.url} alt="" loading="lazy" decoding="async" className="aspect-[4/5] w-full rounded-xl bg-muted object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void download(shot)}>
                  {save.newTab ? <ExternalLink aria-hidden="true" /> : <Download aria-hidden="true" />}
                  {save.label}
                </Button>
                <Button type="button" variant="outline" aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
                  Compare original
                </Button>
              </div>
              <p role="alert" className="text-sm text-destructive empty:hidden">{saveError}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <section aria-labelledby="shoot-details" className={`${CARD} flex flex-col gap-3`}>
            <h2 id="shoot-details" className="text-lg font-semibold">Shoot details</h2>
            <dl className="flex flex-col gap-2 text-sm">
              {stagingSummary(shoot.input, shoot.credits, prices.unlimited).map((row) => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="break-words">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* As on the phone, only a finished shoot offers Variation. */}
          {canCreate && shoot.status === "DONE" ? (
            <div className="flex flex-col items-start gap-2">
              <Button
                type="button"
                disabled={pressing || prices.blocker !== null}
                aria-describedby={prices.blocker ? "variation-note variation-blocker" : "variation-note"}
                onClick={() => void variation(shoot)}
              >
                {pressing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {withPrice("Variation", prices.priceOf(shoot.input.tier))}
              </Button>
              <p id="variation-note" className="text-sm text-muted-foreground">Runs the same setup again and is charged again.</p>
              {prices.blocker ? <p id="variation-blocker" className="text-sm text-muted-foreground">{prices.blocker}</p> : null}
              {prices.blocker !== null && prices.failed ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void prices.reload()}>
                  Read prices again
                </Button>
              ) : null}
              <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
