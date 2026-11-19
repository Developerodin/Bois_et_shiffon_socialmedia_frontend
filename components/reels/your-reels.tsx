"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { reelStage, type ReelSummary } from "@/shared";
import { Button } from "@/components/ui/button";
import { PageSection } from "@/components/ui/page-section";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { ListSkeleton, LoadError } from "@/components/settings/shared";
import { sharedAt } from "@/components/workspace/use-job";
import { stale } from "@/lib/signed-links";
import { reelsUrl } from "./api";
import { countByStage, postLinkWanted } from "./reel";
import { ReelCard } from "./reel-card";
import { useReels } from "./use-reels";

const PostLinkDialog = dynamic(() => import("./post-link-dialog").then((m) => m.PostLinkDialog), { ssr: false });

type Filter = "all" | "ready" | "processing";

/** The brand's reels, newest first, filtered by stage; each card opens its reel. */
export function YourReels({ workspaceId, brandId, canPublish }: { workspaceId: string; brandId: string; canPublish: boolean }) {
  const { data, failed, reload } = useReels(workspaceId, brandId);
  const [filter, setFilter] = useState<Filter>("all");
  // The dialog loads on the first press; `linking` is the reel it is open for.
  const [linking, setLinking] = useState<ReelSummary | null>(null);
  const [linkMounted, setLinkMounted] = useState(false);
  const counts = useMemo(() => countByStage(data ?? []), [data]);
  const shown = useMemo(() => (data ?? []).filter((r) => filter === "all" || reelStage(r) === filter), [data, filter]);
  // Links cached over 50 minutes ago may have expired: show nothing until the read that replaces them lands.
  const ready = data !== null && !failed && !stale(sharedAt(reelsUrl(workspaceId, brandId)));

  const filterSwitch = ready ? (
    <SegmentedRadios
      label="Filter reels"
      name="reels-filter"
      value={filter}
      onChange={setFilter}
      options={[
        { value: "all", label: "All", count: counts.all },
        { value: "ready", label: "Ready", count: counts.ready },
        { value: "processing", label: "Processing", count: counts.processing },
      ]}
    />
  ) : null;

  if (!ready || shown.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <PageSection id="your-reels" title="Your reels" description={ready ? "No reels yet." : undefined} actions={filterSwitch} />
        {failed ? <LoadError message="Couldn't load your reels." onRetry={() => void reload()} /> : !ready ? <ListSkeleton label="Loading reels" /> : null}
      </div>
    );
  }

  return (
    <PageSection id="your-reels" title="Your reels" actions={filterSwitch}>
      <ul aria-label="Reels" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {shown.map((r) => (
          <li key={r.id}>
            <ReelCard reel={r} brandId={brandId} />
            {canPublish && postLinkWanted(r) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                aria-label={`Posted ${r.title}? Add the link`}
                onClick={() => {
                  setLinkMounted(true);
                  setLinking(r);
                }}
              >
                Posted it? Add link
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {linkMounted ? <PostLinkDialog workspaceId={workspaceId} brandId={brandId} reel={linking} onClose={() => setLinking(null)} onSaved={() => void reload()} /> : null}
    </PageSection>
  );
}
