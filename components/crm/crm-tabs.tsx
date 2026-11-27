"use client";

import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import { crmAccess, type CrmAccess, type CrmTab } from "@/components/crm/crm-link";
import { CustomersTab } from "@/components/crm/customers/customers-tab";
import { FollowUpsTab } from "@/components/crm/follow-ups/follow-ups-tab";
import { PipelineTab } from "@/components/crm/pipeline/pipeline-tab";
import { QuotesBoard } from "@/components/crm/quotes/quotes-board";
import { PageHeader } from "@/components/ui/page-header";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

export type { CrmTab };
export const CRM_TAB_LABEL: Record<CrmTab, string> = { "follow-ups": "Follow-ups", customers: "Customers", pipeline: "Pipeline", quotes: "Quotes" };

/** The tabs a role sees on /crm, in page order (Decision 17): Follow-ups needs inbox.read, the others crm.manage. */
export function crmTabs(access: Pick<CrmAccess, "manage" | "inbox">): CrmTab[] {
  const out: CrmTab[] = [];
  if (access.inbox) out.push("follow-ups");
  if (access.manage) out.push("customers", "pipeline", "quotes");
  return out;
}

/** The tab a bare /crm opens: Customers for crm.manage, else the first one the role sees. */
export function defaultCrmTab(tabs: readonly CrmTab[]): CrmTab | null {
  return tabs.includes("customers") ? "customers" : (tabs[0] ?? null);
}

/** /crm's one header, its tab nav (`?tab=`, replaced in place as on Performance) and the open tab's body. */
export function CrmTabs({ w, b, perms, workspacePerms }: { w: string; b: string; perms: readonly string[]; workspacePerms: readonly string[] }) {
  const access = crmAccess(perms, workspacePerms);
  const tabs = crmTabs(access);
  const urlTab = useSearchParams().get("tab");
  const active = tabs.find((t) => t === urlTab) ?? defaultCrmTab(tabs);
  const tabRefs = useRef<Partial<Record<CrmTab, HTMLButtonElement | null>>>({});
  const title = navFor("/crm").title;

  // The page's gate lets in only a role holding one of the keys, so there is always a tab.
  if (!active) return null;

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
      <PageHeader title={title}>Who needs a reply, the business&rsquo;s customers, its pipeline and its quotes, in one place for the team.</PageHeader>
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
      <div
        role="tabpanel"
        id={`crm-panel-${active}`}
        aria-labelledby={`crm-tab-${active}`}
        tabIndex={0}
        className="flex flex-col gap-5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <CrmPanel tab={active} w={w} b={b} access={access} />
      </div>
    </>
  );
}

/** The body of each tab. */
function CrmPanel({ tab, w, b, access }: { tab: CrmTab; w: string; b: string; access: CrmAccess }) {
  switch (tab) {
    case "follow-ups":
      return <FollowUpsTab w={w} b={b} canManage={access.manage} canDraft={access.draft} />;
    case "customers":
      return <CustomersTab w={w} b={b} access={access} />;
    case "pipeline":
      return <PipelineTab w={w} b={b} />;
    case "quotes":
      return <QuotesBoard w={w} b={b} />;
  }
}
