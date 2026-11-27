"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The tabs of /crm (crm-tabs.tsx); kept here so a tab's body can link to another without importing the shell. */
export type CrmTab = "follow-ups" | "customers" | "pipeline" | "quotes";

/** A link to a tab of /crm, with what to open there (`customer`, `quote`). */
export function crmHref(tab: CrmTab, open: Record<string, string> = {}) {
  return `/crm?${new URLSearchParams({ tab, ...open }).toString()}`;
}

/**
 * A link between the tabs of /crm. A plain click moves through native history (Next syncs useSearchParams from it,
 * no server round trip; Back returns); a modified click opens the URL as any link would.
 */
export function CrmLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // null, not window.history.state: Next ignores a call that carries its own state.
    window.history.pushState(null, "", href);
  };
  return (
    <a href={href} onClick={onClick} className={cn("underline-offset-4 hover:underline", className)}>
      {children}
    </a>
  );
}
