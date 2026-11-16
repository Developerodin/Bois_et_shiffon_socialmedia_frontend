"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, ChartColumn, Cpu, LayoutDashboard, ScrollText, Users } from "lucide-react";
import { useIndicator } from "@/components/admin/use-indicator";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/spend", label: "Spend & usage", icon: ChartColumn },
  { href: "/admin/activity", label: "Activity", icon: Activity },
  { href: "/admin/logs", label: "Logs", icon: ScrollText },
  { href: "/admin/models", label: "AI models", icon: Cpu },
];

/**
 * The console's sections: a sidebar on wide screens, a wrapping row of links on narrow ones. The highlight slides
 * to the section you pick.
 */
export function AdminNav() {
  const path = usePathname();
  const active = ITEMS.find(({ href, exact }) => (exact ? path === href : path.startsWith(href)))?.href ?? "";
  const { ref, style, shown, pick } = useIndicator<HTMLDivElement>(active, "box");
  return (
    <nav aria-label="Platform admin" className="lg:sticky lg:top-20">
      <p className="mb-2 hidden px-3 text-xs font-medium text-primary lg:block">Platform admin</p>
      <div ref={ref} className="relative flex flex-wrap gap-1 lg:flex-col">
        <span aria-hidden="true" className="slide-indicator pointer-events-none absolute left-0 top-0 rounded-lg bg-muted" style={style} />
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const on = href === shown;
          return (
            <Link
              key={href}
              href={href}
              onClick={pick(href)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "font-medium text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4 transition-colors", on ? "text-primary" : "")} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
