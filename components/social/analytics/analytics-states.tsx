import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import { Check, Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReadChannel } from "@/lib/analytics-channels";
import { cn } from "@/lib/utils";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * A line about the numbers that the reader should see, not a footnote: which ones are missing and why. "info" for
 * something expected (days still being counted), "warning" for something the account lacks (a permission). An action
 * only where the app can actually fix it.
 */
export function AnalyticsDataNotice({ tone = "info", title, children, action }: { tone?: "info" | "warning"; title: string; children: ReactNode; action?: ReactNode }) {
  const I = tone === "warning" ? TriangleAlert : Info;
  return (
    <div role="note" className={cn("flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-sm", tone === "warning" ? "border-warning/40 bg-warning/10" : "border-border bg-muted")}>
      <I aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-warning-ink" : "text-muted-foreground")} />
      <div className="min-w-[min(100%,16rem)] flex-1">
        <p className="font-medium">{title}</p>
        <div className="mt-0.5 text-muted-foreground text-pretty">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A channel with nothing to chart, as a working state rather than a lone small card: the platform's mark and a status
 * line, what is going on, one primary action and its secondary ones, and beside it (`aside`) what the reader gets or
 * can do next. Two columns once the panel has room (a container query on this wrapper), stacked under that.
 */
export function AnalyticsEmptyState({ icon: I, status, title, children, primary, secondary, aside }: { icon: Icon; status?: ReactNode; title: string; children: ReactNode; primary?: ReactNode; secondary?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="@container/empty">
      <section aria-label={title} className={cn("grid grid-cols-[minmax(0,1fr)] gap-6 rounded-2xl border border-border bg-card p-5 sm:p-6", aside && "@min-[44rem]/empty:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @min-[44rem]/empty:gap-8")}>
        <div className="flex flex-col items-start gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-muted">
              <I aria-hidden className="size-5" />
            </span>
            {status}
          </div>
          <div>
            <h3 className="text-lg font-semibold leading-tight text-balance">{title}</h3>
            <div className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">{children}</div>
          </div>
          {primary || secondary ? (
            <div className="flex flex-wrap items-center gap-2">
              {primary}
              {secondary}
            </div>
          ) : null}
        </div>
        {aside ? <div className="min-w-0 border-t border-border pt-5 @min-[44rem]/empty:border-l @min-[44rem]/empty:border-t-0 @min-[44rem]/empty:pl-8 @min-[44rem]/empty:pt-0">{aside}</div> : null}
      </section>
    </div>
  );
}

/** A short ticked list under a small heading, for an empty state's side ("Once connected you'll see"). */
export function StateList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-3 flex flex-col gap-2.5 text-sm text-muted-foreground">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A channel read from its platform whose account isn't connected, or whose access stopped working (`broken`): what
 * connecting makes appear here, Connect (or Reconnect) on the Connections page, and the channel's calendar, where its
 * posts can be planned meanwhile.
 */
export function PlatformConnectionState({ channel, icon, broken, status }: { channel: ReadChannel; icon: Icon; broken: boolean; status?: ReactNode }) {
  const verb = broken ? "Reconnect" : "Connect";
  return (
    <AnalyticsEmptyState
      icon={icon}
      status={status}
      title={broken ? `${channel.label} needs reconnecting` : `${channel.label} isn't connected yet`}
      primary={
        <Button asChild size="sm">
          <Link href="/connections">
            {verb} {channel.label}
          </Link>
        </Button>
      }
      secondary={
        <Button asChild size="sm" variant="outline">
          <Link href={channel.calendar}>Plan {channel.label} posts</Link>
        </Button>
      }
      aside={<StateList title={`Once ${broken ? "reconnected" : "connected"}, this page shows`} items={channel.gains} />}
    >
      {broken
        ? `The access ${channel.label} gave has stopped working, so its numbers can't be read. Reconnecting on the Connections page signs in to ${channel.label} again; nothing already planned is lost.`
        : `Connect the ${channel.label} account on the Connections page and its numbers are read from ${channel.source} straight away. You can plan ${channel.label} posts on the calendar before then.`}
    </AnalyticsEmptyState>
  );
}
