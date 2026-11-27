"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AccountNumbers, DAYS } from "@/components/social/channel-analytics";
import { calendarHref } from "@/lib/calendar-filter";
import { channelIcon } from "@/lib/post-labels";
import { cn } from "@/lib/utils";
import type { AnalyticsChannel } from "@/shared";

const TABS: { id: AnalyticsChannel; label: string; calendar: string; icon: string }[] = [
  { id: "instagram", label: "Instagram", calendar: calendarHref({ channel: "instagram" }), icon: "instagram" },
  { id: "facebook", label: "Facebook Page", calendar: calendarHref({ channel: "FACEBOOK_POST" }), icon: "FACEBOOK_POST" },
];

/**
 * The Analytics page (/social/analytics): one tab per account read from Meta, the tab in the URL (?account=) so a link
 * from a channel's calendar or the Channels page opens on it. Each tab is the account's full numbers over the last 28
 * days; LinkedIn and X are posted by hand and Pinterest and Threads aren't read yet, said once at the foot.
 */
export function AnalyticsView({ base, account }: { base: string; account: AnalyticsChannel }) {
  const router = useRouter();
  const path = usePathname();
  const tab = TABS.find((t) => t.id === account) ?? TABS[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Account" className="inline-flex rounded-full border border-border bg-card p-1">
          {TABS.map((t) => {
            const Icon = channelIcon(t.icon);
            const on = t.id === tab.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => router.replace(`${path}?account=${t.id}`, { scroll: false })}
                className={cn("inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon aria-hidden className="size-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Last {DAYS} days, read from Meta</span>
          <Link href={tab.calendar} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Open its calendar
          </Link>
        </div>
      </div>
      <section role="tabpanel" aria-label={tab.label} className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6">
        {/* key: a new tab is a new read, never the other account's numbers for a moment. */}
        <AccountNumbers key={tab.id} base={base} channel={tab.id} titled />
      </section>
      <p className="text-xs text-muted-foreground">
        LinkedIn and X are published by hand, so the platforms send no numbers. Pinterest and Threads analytics aren&apos;t connected yet.
      </p>
    </div>
  );
}
