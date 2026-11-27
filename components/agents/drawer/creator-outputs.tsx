"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { LatestRun, OpenPost, WaitingNow } from "@/components/agents/drawer/shared";
import type { DrawerData } from "@/components/agents/drawer/types";
import type { ContentItem } from "@/components/workspace/content-panels";
import { PostThumb } from "@/components/workspace/post-thumb";
import { briefFields, briefProducts, groupBy } from "@/lib/agent-drawer";
import { CHANNEL_LABEL, STATUS_LABEL } from "@/lib/post-labels";
import { cn } from "@/lib/utils";

const CHECK_LABEL = { PASS: "Check passed", WARN: "Check: warnings", BLOCKER: "Revisions required" } as const;
const CHECK_TONE = { PASS: "good", WARN: "warn", BLOCKER: "bad" } as const;

/** One draft: picture, channel, version, status, products, caption preview and hashtags; Expand adds the full caption and the visual brief. */
function DraftCard({ item, onOpenPost }: { item: ContentItem; onOpenPost: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const v = item.latest;
  const products = briefProducts(item.brief);
  const visual = briefFields(item.brief).find((f) => f.key === "visual");
  const caption = v ? [v.body.hook, v.body.caption].filter(Boolean).join("\n\n") || v.body.pinTitle : "";
  const tags = v?.body.hashtags ?? [];
  const cover = v?.photoUrls?.[0] ?? item.firstFrameUrl ?? null;
  const panelId = `draft-${item.id}`;
  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-start gap-3">
        {cover && <PostThumb url={cover} className="size-12 shrink-0 rounded-md bg-muted object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {CHANNEL_LABEL[item.channel] ?? item.channel}
            {v && ` · v${v.version}`}
            {products.length > 0 && ` · ${products.join(", ")}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={item.status} quiet>{STATUS_LABEL[item.status] ?? item.status}</StatusBadge>
          {v?.check && <StatusBadge tone={CHECK_TONE[v.check.overall]}>{CHECK_LABEL[v.check.overall]}</StatusBadge>}
        </div>
      </div>
      {v ? (
        <p className={cn("whitespace-pre-line break-words text-sm", !open && "line-clamp-3")}>{caption || <span className="text-muted-foreground">No caption written.</span>}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No draft on this post now.</p>
      )}
      {tags.length > 0 && (
        <ul aria-label="Hashtags" className="flex flex-wrap gap-1">
          {(open ? tags : tags.slice(0, 5)).map((t) => (
            <li key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t.startsWith("#") ? t : `#${t}`}</li>
          ))}
          {!open && tags.length > 5 && <li className="px-1 text-xs text-muted-foreground">+{tags.length - 5}</li>}
        </ul>
      )}
      {open && visual && (
        <div id={panelId} className="border-l-2 border-border pl-3 text-sm">
          <p className="text-xs text-muted-foreground">Visual brief</p>
          <p className="break-words">{visual.value}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        {v && (caption.length > 160 || tags.length > 5 || visual) ? (
          <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
            {open ? "Collapse" : "Expand draft"}
          </button>
        ) : (
          <span />
        )}
        <OpenPost id={item.id} onOpenPost={onOpenPost} />
      </div>
    </div>
  );
}

/**
 * Drafts from one idea on several channels: a switch between the channel versions, one shown at a time. Only posts
 * that share a real idea (opportunityId) are grouped; the rest stand alone.
 */
function Variants({ items, onOpenPost }: { items: ContentItem[]; onOpenPost: (id: string) => void }) {
  const [shown, setShown] = useState(items[0]!.id);
  const current = items.find((p) => p.id === shown) ?? items[0]!;
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1.5 border-b border-border px-3 pt-3 pb-2">
        <p className="truncate text-xs text-muted-foreground">
          {items[0]!.opportunity?.title ? `From the idea “${items[0]!.opportunity.title}”` : "From the same idea"} · {items.length} channel versions
        </p>
        <div role="group" aria-label="Channel version" className="flex flex-wrap gap-1">
          {items.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === current.id} onClick={() => setShown(p.id)} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", p.id === current.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted")}>
              {CHANNEL_LABEL[p.channel] ?? p.channel}
            </button>
          ))}
        </div>
      </div>
      <DraftCard key={current.id} item={current} onOpenPost={onOpenPost} />
    </div>
  );
}

/** Creator Outputs: the drafts its latest run wrote (channel versions of one idea switchable), then what waits for the check. */
export function CreatorOutputs({ d }: { d: DrawerData }) {
  return (
    <>
      <LatestRun d={d} noun="drafts">
        {(items) => (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {groupBy(items, (p) => (p.opportunityId ? `idea:${p.opportunityId}` : `post:${p.id}`)).map((g) => (
              <li key={g.key}>{g.items.length > 1 ? <Variants items={g.items} onOpenPost={d.onOpenPost} /> : <DraftCard item={g.items[0]!} onOpenPost={d.onOpenPost} />}</li>
            ))}
          </ul>
        )}
      </LatestRun>
      <WaitingNow d={d} />
    </>
  );
}
