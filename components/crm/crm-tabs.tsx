"use client";

import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import type { CrmTab } from "@/components/crm/crm-link";
import { CustomersTab } from "@/components/crm/customers/customers-tab";
import { QuotesBoard } from "@/components/crm/quotes/quotes-board";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

export type { CrmTab };
export const CRM_TAB_LABEL: Record<CrmTab, string> = { "follow-ups": "Follow-ups", customers: "Customers", pipeline: "Pipeline", quotes: "Quotes" };

/**
 * The tabs a role sees on /crm, in page order (plan 2026-11-27-crm, Decision 17): Follow-ups needs inbox.read, the
 * others crm.manage. Follow-ups and Pipeline join this list when they are built; the server checks each route again.
 */
export function crmTabs(perms: readonly string[]): CrmTab[] {
  const out: CrmTab[] = [];
  if (perms.includes("crm.manage")) out.push("customers", "quotes");
  return out;
}

/** The tab a bare /crm opens: Customers for crm.manage, else the first one the role sees. */
export function defaultCrmTab(tabs: readonly CrmTab[]): CrmTab | null {
  return tabs.includes("customers") ? "customers" : (tabs[0] ?? null);
}

/** /crm's one header, its tab nav (`?tab=`, replaced in place as on Performance) and the open tab's body. */
export function CrmTabs({ w, b, perms }: { w: string; b: string; perms: readonly string[] }) {
  const tabs = crmTabs(perms);
  const urlTab = useSearchParams().get("tab");
  const active = tabs.find((t) => t === urlTab) ?? defaultCrmTab(tabs);
  const tabRefs = useRef<Partial<Record<CrmTab, HTMLButtonElement | null>>>({});
  const title = navFor("/crm").title;

  if (!active) {
    // inbox.read alone passes the page's gate; its Follow-ups tab isn't built yet.
    return (
      <EmptyState
        size="hero"
        icon={Lock}
        headingLevel="h1"
        title={title}
        description="Your role can't see this business's customer records or quotes. Ask a workspace admin for the customer records permission."
      />
    );
  }

  function select(tab: CrmTab) {
    // Only the tab: what the other tab had open (?customer, ?quote) doesn't carry over.
    window.history.replaceState(null, "", `${window.location.pathname}?${new URLSearchParams({ tab }).toString()}`);
  }
  function onTabKey(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    let next = index + delta;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else if (!delta) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    select(tab);
    tabRefs.current[tab]?.focus();
  }

  return (
    <>
      <PageHeader title={title}>The business&rsquo;s customers and quotes, in one place for the team.</PageHeader>
      <div role="tablist" aria-label={title} className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border border-border bg-card p-1">
        {tabs.map((t, i) => {
          const selected = t === active;
          return (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              role="tab"
              id={`crm-tab-${t}`}
              aria-selected={selected}
              aria-controls={`crm-panel-${t}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-accent ring-1 ring-inset ring-control text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {CRM_TAB_LABEL[t]}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`crm-panel-${active}`} aria-labelledby={`crm-tab-${active}`} className="flex flex-col gap-5">
        <CrmPanel tab={active} w={w} b={b} />
      </div>
    </>
  );
}

/** The body of each tab. Follow-ups and Pipeline get their branch when they join crmTabs(). */
function CrmPanel({ tab, w, b }: { tab: CrmTab; w: string; b: string }) {
  switch (tab) {
    case "customers":
      return <CustomersTab w={w} b={b} />;
    case "quotes":
      return <QuotesBoard w={w} b={b} />;
    case "follow-ups":
    case "pipeline":
      // Not in crmTabs() yet, so never active.
      return null;
  }
}
