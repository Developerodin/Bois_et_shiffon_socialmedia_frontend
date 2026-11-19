"use client";

import { memo, useEffect } from "react";
import Link from "next/link";
import type { ReelDetail } from "@/shared";
import { connectionsUrl, type Connection } from "@/components/settings/api";
import { ReleasePanel } from "@/components/workspace/release-panel";
import { JOB_INTERVALS, fetchShared, useJob } from "@/components/workspace/use-job";
import { brandUrl } from "./api";
import { instagramState, reelHref, sendBlock } from "./reel";

const LINK = "rounded-full font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CONNECTIONS = "/settings?tab=connections";
const STOP_ON = [403, 404] as const;
const pickConnections = (d: never) => (d as { connections: Connection[] }).connections;
const once = () => true;

/**
 * The Publish step (the phone's R08 and R09): the release panel, which approves a version awaiting approval and then
 * publishes it in one press, schedules, cancels and keeps the history; above it, why it can't go yet, and the Instagram
 * account when the release state can't say (none connected, or one that needs reconnecting). Loaded lazily by the page.
 */
export const PublishStep = memo(function PublishStep({ workspaceId, brandId, detail, perms, onChanged }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  perms: readonly string[];
  onChanged: () => void;
}) {
  const url = connectionsUrl(workspaceId, brandId);
  // Read once; again when the person comes back to the tab (they may have connected an account meanwhile). No polling.
  const { data: connections } = useJob(url, { pick: pickConnections, done: once, intervals: JOB_INTERVALS.always, stopOn: STOP_ON });
  useEffect(() => {
    // Joins the hook's first read when it sends one; a cached answer is read again here.
    void fetchShared(url).catch(() => undefined);
    const onShow = () => {
      if (document.visibilityState === "visible") void fetchShared(url, true).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [url]);

  if (!detail.videoUrl) {
    return (
      <p className="text-sm text-muted-foreground">
        Make the video first.{" "}
        <Link href={reelHref(detail.item.id, brandId, "storyboard")} replace className={LINK}>Go to the storyboard</Link>
      </p>
    );
  }

  const block = sendBlock(detail);
  const ig = connections ? instagramState(connections) : null;
  return (
    <div className="flex flex-col gap-4">
      {block ? <p className="text-sm text-muted-foreground">{block}</p> : null}
      {ig?.state === "expired" ? (
        <p className="text-sm">
          Instagram needs reconnecting. <Link href={CONNECTIONS} className={LINK}>Reconnect</Link>
        </p>
      ) : ig?.state === "none" ? (
        <p className="text-sm">
          Instagram isn&apos;t connected. <Link href={CONNECTIONS} className={LINK}>Connect</Link>
        </p>
      ) : null}
      <ReleasePanel
        base={brandUrl(workspaceId, brandId)}
        id={detail.item.id}
        status={detail.item.status}
        version={detail.version}
        qualityBlocked={detail.checks?.overall === "BLOCKER"}
        perms={perms}
        onChanged={onChanged}
        approveFirst
      />
    </div>
  );
});
