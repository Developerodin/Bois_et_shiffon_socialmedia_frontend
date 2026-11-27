"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";
import type { FollowUpCounts as Counts } from "@/shared";
import { followUpCountsAt } from "@/components/crm/api";
import { crmHref } from "@/components/crm/crm-link";

/** "2 need a reply · 1 overdue · 3 waiting" with only the non-zero parts; null when nothing is open. */
export function followUpLine(c: Counts) {
  const parts = [c.needsReply ? `${c.needsReply} ${c.needsReply === 1 ? "needs" : "need"} a reply` : null, c.overdue ? `${c.overdue} overdue` : null, c.waiting ? `${c.waiting} waiting on the customer` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The Overview's customer follow-ups (plan 2026-11-27-crm, Task A10): the viewer's counts from
 * GET …/crm/follow-ups/counts, read once when the Overview opens (no polling), linking to the Follow-ups tab. The
 * Overview renders it only with the `crm` flag and inbox.read; it shows nothing while loading, on an error or when
 * no conversation is open.
 */
export function FollowUpCounts({ base }: { base: string }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    let live = true;
    followUpCountsAt(base).then(
      (r) => live && setCounts(r.counts),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [base]);
  const line = counts && followUpLine(counts);
  if (!line) return null;
  return (
    <section aria-label="Customer follow-ups" className="mt-4 flex items-center gap-3 rounded-xl border border-border px-4 py-3">
      <MessagesSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Customer follow-ups</span>
        <span className="text-muted-foreground"> · {line}</span>
      </p>
      <Link href={crmHref("follow-ups")} className="text-sm font-medium underline-offset-4 hover:underline">
        Open follow-ups
      </Link>
    </section>
  );
}
