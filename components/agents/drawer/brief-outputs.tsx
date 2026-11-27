"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { LatestRun, OpenPost, WaitingNow } from "@/components/agents/drawer/shared";
import type { DrawerData } from "@/components/agents/drawer/types";
import type { ContentItem } from "@/components/workspace/content-panels";
import { briefFields, briefProducts, type BriefField } from "@/lib/agent-drawer";
import { CHANNEL_LABEL, STATUS_LABEL } from "@/lib/post-labels";
import { dayTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const show = (v: BriefField["value"]) => (Array.isArray(v) ? v.join(", ") : v);

/** One brief, collapsed to its post, channel, products and objective; Expand shows every field it has. */
function BriefCard({ item, onOpenPost }: { item: ContentItem; onOpenPost: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const fields = briefFields(item.brief);
  const goal = fields.find((f) => f.key === "goal");
  const message = fields.find((f) => f.key === "keyMessage");
  const products = briefProducts(item.brief);
  const panelId = `brief-${item.id}`;
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {CHANNEL_LABEL[item.channel] ?? item.channel}
            {item.scheduledFor && ` · ${dayTime(item.scheduledFor)}`}
            {products.length > 0 && ` · ${products.join(", ")}`}
          </p>
        </div>
        <StatusBadge status={item.status} quiet>{STATUS_LABEL[item.status] ?? item.status}</StatusBadge>
      </div>
      {(goal || message) && (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {goal && <span className="font-medium text-foreground">{show(goal.value)}</span>}
          {goal && message && " · "}
          {message && show(message.value)}
        </p>
      )}
      {open && (
        <dl id={panelId} className="flex flex-col gap-2 border-l-2 border-border pl-3 text-sm">
          {fields.map((f) => (
            <div key={f.key}>
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="break-words">{Array.isArray(f.value) && f.key === "questions" ? <ul className="list-disc pl-4">{f.value.map((q) => <li key={q}>{q}</li>)}</ul> : show(f.value)}</dd>
            </div>
          ))}
          {!fields.length && <p className="text-muted-foreground">This post has no brief written.</p>}
        </dl>
      )}
      <div className="flex items-center justify-between gap-3">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
          {open ? "Collapse" : "Expand brief"}
        </button>
        <OpenPost id={item.id} onOpenPost={onOpenPost} />
      </div>
    </li>
  );
}

/** Brief writer Outputs: the briefs its latest run wrote, collapsed, then what still waits for a draft across the brand. */
export function BriefOutputs({ d }: { d: DrawerData }) {
  return (
    <>
      <LatestRun d={d} noun="briefs">
        {(items) => (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((p) => (
              <BriefCard key={p.id} item={p} onOpenPost={d.onOpenPost} />
            ))}
          </ul>
        )}
      </LatestRun>
      <WaitingNow d={d} />
    </>
  );
}
