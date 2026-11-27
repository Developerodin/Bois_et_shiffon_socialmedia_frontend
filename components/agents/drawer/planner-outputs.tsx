"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { DrawerSection, LatestRun, OpenPost, runItems, Stat, WaitingNow } from "@/components/agents/drawer/shared";
import type { DrawerData } from "@/components/agents/drawer/types";
import type { ContentItem } from "@/components/workspace/content-panels";
import { briefProducts, groupBy, plannerSummary } from "@/lib/agent-drawer";
import { CHANNEL_LABEL, STATUS_LABEL } from "@/lib/post-labels";
import { dayTime } from "@/lib/time";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const channelName = (c: string) => CHANNEL_LABEL[c] ?? c;

/** The Planner's latest run in numbers, from the planned posts the list could read. Nothing is guessed. */
export function PlannerSummary({ items }: { items: ContentItem[] }) {
  const s = plannerSummary(items);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/50 px-3 py-3 @sm:grid-cols-4">
      <Stat label="Posts planned" value={s.posts} />
      <Stat label="Channels" value={s.channels.length} />
      {s.products !== null && <Stat label="Products" value={s.products} />}
      <Stat label="Dates" value={s.from && s.to ? (s.from.slice(0, 10) === s.to.slice(0, 10) ? day(s.from) : `${day(s.from)} – ${day(s.to)}`) : "No dates"} />
    </dl>
  );
}

/** Planner Outputs: the latest run's planned posts by channel, then what still waits for a brief across the brand. */
export function PlannerOutputs({ d }: { d: DrawerData }) {
  return (
    <>
      <LatestRun d={d} noun="planned posts">
        {(items) => (
          <>
            <PlannerSummary items={items} />
            {groupBy(items, (p) => p.channel).map((g) => (
              <div key={g.key} className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">{channelName(g.key)} · {g.items.length}</p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {g.items.map((p) => {
                    const products = briefProducts(p.brief);
                    return (
                      <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{p.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.scheduledFor ? dayTime(p.scheduledFor) : "No date"}
                            {products.length > 0 && ` · ${products.join(", ")}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge status={p.status} quiet>{STATUS_LABEL[p.status] ?? p.status}</StatusBadge>
                          <OpenPost id={p.id} onOpenPost={d.onOpenPost} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </>
        )}
      </LatestRun>
      <WaitingNow d={d} />
    </>
  );
}

/** Planner Overview numbers: its latest run's summary when read. */
export function PlannerOverview({ d }: { d: DrawerData }) {
  const read = runItems(d);
  if (!read || !read.items.length) return null;
  return (
    <DrawerSection id="planner-sum-h" title="Latest run" scope="From the posts it planned">
      <PlannerSummary items={read.items} />
    </DrawerSection>
  );
}
