"use client";

import { useMemo, useState } from "react";
import { PageSection } from "@/components/ui/page-section";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { ListSkeleton, LoadError } from "@/components/settings/shared";
import { sharedAt, stale } from "@/components/workspace/use-job";
import { shootsUrl } from "./api";
import { countByKind, type ShootKind } from "./shoot";
import { ShootCard } from "./shoot-card";
import { useShoots } from "./use-shoots";

type Filter = "all" | ShootKind;

/** The brand's photoshoots, newest first, filtered by kind; each card opens its shoot. */
export function PastShoots({ workspaceId, brandId }: { workspaceId: string; brandId: string }) {
  const { data, failed, reload } = useShoots(workspaceId, brandId);
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => countByKind(data ?? []), [data]);
  const shown = useMemo(() => (data ?? []).filter((s) => filter === "all" || s.kind === filter), [data, filter]);
  // Links cached over 50 minutes ago may have expired: show nothing until the read that replaces them lands.
  const ready = data !== null && !failed && !stale(sharedAt(shootsUrl(workspaceId, brandId)));

  const filterSwitch = ready ? (
    <SegmentedRadios
      label="Filter photoshoots"
      name="past-filter"
      value={filter}
      onChange={setFilter}
      options={[
        { value: "all", label: "All", count: counts.all },
        { value: "product", label: "Product", count: counts.product },
        { value: "fashion", label: "Fashion", count: counts.fashion },
      ]}
    />
  ) : null;

  if (!ready || shown.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <PageSection id="past" title="Past photoshoots" description={ready ? "No photoshoots yet." : undefined} actions={filterSwitch} />
        {failed ? <LoadError message="Couldn't load your photoshoots." onRetry={() => void reload()} /> : !ready ? <ListSkeleton label="Loading photoshoots" /> : null}
      </div>
    );
  }

  return (
    <PageSection id="past" title="Past photoshoots" actions={filterSwitch}>
      <ul aria-label="Photoshoots" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {shown.map((s) => (
          <li key={s.id}>
            <ShootCard shoot={s} />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
