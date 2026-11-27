import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/lib/status";
import type { Icon } from "./channel-icons";

export type HeaderStatus = { label: string; tone: Tone };

/**
 * The chosen channel's header, the same on every channel: its mark and name, the account (the handle, the Page) or how
 * it is published, its connection or publishing status, when the numbers were read, and on the right the period
 * (`controls`, left out where there is nothing to read) and Open calendar.
 */
export function ChannelAnalyticsHeader({ icon: I, label, identity, status, freshness, controls, calendar }: { icon: Icon; label: string; identity: ReactNode; status: HeaderStatus | null; freshness?: string | null; controls?: ReactNode; calendar: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card">
          <I aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-lg font-semibold leading-tight">{label}</h2>
            {status ? (
              <StatusBadge quiet tone={status.tone}>
                {status.label}
              </StatusBadge>
            ) : null}
          </div>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{identity}</span>
            {freshness ? <span>&middot; {freshness}</span> : null}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {controls}
        <Button asChild size="sm" variant="outline">
          <Link href={calendar}>
            <CalendarDays aria-hidden />
            Open calendar
          </Link>
        </Button>
      </div>
    </header>
  );
}
