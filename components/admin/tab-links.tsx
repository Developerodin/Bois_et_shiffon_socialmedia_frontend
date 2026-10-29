"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIndicator } from "@/components/admin/use-indicator";
import { cn } from "@/lib/utils";

/**
 * Tabs that are pages (each has its own URL). The underline slides from the old tab to the new one. The first tab
 * matches its path exactly; the others match their path and anything under it.
 */
export function TabLinks({ label, tabs }: { label: string; tabs: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  const active = tabs.find((t, i) => (i === 0 ? path === t.href : path.startsWith(t.href)))?.href ?? "";
  const { ref, style, shown, pick } = useIndicator<HTMLElement>(active, "underline");
  return (
    <nav ref={ref} aria-label={label} className="relative flex flex-wrap gap-1 border-b border-border">
      <span aria-hidden="true" className="slide-indicator pointer-events-none absolute left-0 top-0 rounded-full bg-primary" style={style} />
      {tabs.map((t) => {
        const on = t.href === shown;
        return (
          <Link
            key={t.href}
            href={t.href}
            onClick={pick(t.href)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{t.count.toLocaleString("en")}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
