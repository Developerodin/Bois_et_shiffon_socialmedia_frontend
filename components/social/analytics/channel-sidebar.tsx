"use client";

import { ChevronRight } from "lucide-react";
import type { Channel, ConnState } from "@/lib/analytics-channels";
import { TONE_DOT, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { CHANNEL_ICON } from "./channel-icons";

export type RailItem = { channel: Channel; conn: { name: string | null; state: ConnState } };

/** A channel's second line and its dot: the account, "Needs reconnect", "Not connected", or "Published by hand". */
export function railStatus({ channel, conn }: RailItem): { text: string; tone: Tone | null } {
  if (channel.kind === "manual") return { text: "Published by hand", tone: "muted" };
  if (conn.state === "on") return { text: conn.name ?? "Connected", tone: "good" };
  if (conn.state === "broken") return { text: "Needs reconnect", tone: "warn" };
  if (conn.state === "off") return { text: "Not connected", tone: "muted" };
  return { text: "", tone: null };
}

/**
 * The channels, one button each (the chosen one marked as the current page): its mark, name, and the account or why
 * there is none, with a status dot. A column beside the numbers once the page has room (the parent's container
 * query, `an`), else a grid of chips above them.
 */
export function ChannelSidebar({ items, current, onSelect }: { items: RailItem[]; current: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Channels" className="min-w-0">
      <ul className="grid grid-cols-2 gap-1.5 @min-[36rem]/an:grid-cols-3 @min-[60rem]/an:grid-cols-1">
        {items.map((item) => {
          const { channel: c } = item;
          const I = CHANNEL_ICON[c.id];
          const on = c.id === current;
          const s = railStatus(item);
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-foreground/15 bg-card shadow-sm" : "border-transparent hover:bg-card/70",
                )}
              >
                <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-accent">
                  <I aria-hidden className="size-4" />
                  {s.tone ? <span aria-hidden className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background", TONE_DOT[s.tone])} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", on && "font-medium")}>{c.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.text || " "}</span>
                </span>
                {on && <ChevronRight aria-hidden className="hidden size-4 shrink-0 text-muted-foreground @min-[60rem]/an:block" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
