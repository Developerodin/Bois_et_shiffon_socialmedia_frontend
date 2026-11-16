"use client";

import { useIndicator } from "@/components/admin/use-indicator";
import { cn } from "@/lib/utils";

/** The browser half of Segmented (components/admin/ui.tsx): the links, and the pill that slides to the current one. */
export function SegmentedLinks({ label, options, value }: { label: string; options: { value: string; label: string; href: string }[]; value: string }) {
  const { ref, style, shown, pick } = useIndicator<HTMLDivElement>(value, "box");
  return (
    <div ref={ref} role="group" aria-label={label} className="relative inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1">
      <span aria-hidden="true" className="slide-indicator pointer-events-none absolute left-0 top-0 rounded-full bg-primary" style={style} />
      {options.map((o) => {
        const on = o.value === shown;
        return (
          // A plain link (a full page load), not next/link: switching only the query in place sometimes never
          // finished in production (Next 15.5: React stayed suspended on the new view, seen on Logs and Spend).
          // ponytail: costs a full reload per filter; try next/link again after a Next upgrade.
          <a
            key={o.value}
            href={o.href}
            onClick={pick(o.value)}
            aria-current={on ? "true" : undefined}
            className={cn(
              "relative rounded-full px-3 py-1 text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </a>
        );
      })}
    </div>
  );
}
