"use client";

import { X } from "lucide-react";
import { ChannelConnection, type Conns } from "@/components/social/channel-connection";
import { Button } from "@/components/ui/button";
import { NEW_POST_CHANNELS } from "@/components/workspace/new-post-dialog";
import { channelsOf } from "@/lib/calendar-filter";
import { channelIcon } from "@/lib/post-labels";
import { channelName } from "@/lib/social-channels";

export type ChannelCounts = { scheduled: number; awaiting: number; published: number };

/**
 * The context line a channel's calendar opens with (cf_channel set): its mark, "<Channel> calendar", its connection state
 * and, once the posts it counts are loaded, how many are scheduled, awaiting approval and published over `range` (which
 * says what they cover). "All channels" clears only the channel, keeping the other filters. When New post can't make
 * this channel's posts (it makes Instagram posts and carousels), it says so rather than surprising anyone.
 */
export function ChannelCalendarHeader({ channel, conns, counts, range, onReset }: { channel: string; conns: Conns; counts: ChannelCounts | null; range: string; onReset: () => void }) {
  const Icon = channelIcon(channel);
  const name = channelName(channel);
  const composes = channelsOf(channel).some((c) => NEW_POST_CHANNELS.includes(c));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent">
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="truncate text-sm font-semibold">{name} calendar</span>
      </span>
      <ChannelConnection filter={channel} conns={conns} detail={false} />
      {counts && (
        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums">{counts.scheduled}</span> scheduled &middot; <span className="tabular-nums">{counts.awaiting}</span> awaiting approval &middot; <span className="tabular-nums">{counts.published}</span> published
          <span> &middot; {range}</span>
        </p>
      )}
      {!composes && <p className="text-xs text-muted-foreground">New post makes an Instagram post or carousel</p>}
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onReset}>
        <X aria-hidden />
        All channels
      </Button>
    </div>
  );
}
