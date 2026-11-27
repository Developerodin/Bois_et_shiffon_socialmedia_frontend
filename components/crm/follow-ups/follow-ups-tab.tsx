"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import type { ConversationDto, ConversationRow, FollowUpCounts, FollowUpFilter } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { ownerName, useOwners } from "@/components/crm/customers/people";
import { ConversationView, conversationTitle } from "@/components/crm/follow-ups/conversation-view";
import { FOLLOW_UP_STATE_LABEL, followUpChips, stateTone } from "@/components/crm/follow-ups/labels";
import { ListSkeleton } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListDetail, ListRow, useListSelection } from "@/components/ui/list-detail";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

const WHEN = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * The Follow-ups tab of /crm (inbox.read): the queue by filter (100 a page, Load more) with counts on the chips, and
 * one conversation beside it. Counts are read once per visit and after a change made here; nothing polls.
 * `?c=<id>` (a follow-up task's link, a customer's conversation) opens that conversation.
 */
export function FollowUpsTab({ w, b, canManage }: { w: string; b: string; canManage: boolean }) {
  const [filter, setFilter] = useState<FollowUpFilter>("open");
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState<"idle" | "busy" | "failed">("idle");
  const [counts, setCounts] = useState<FollowUpCounts | null>(null);
  const owners = useOwners(w, b);
  const { selected, open, ids } = useListSelection({ item: "conversation", list: "follow-ups-list", emptyHeadingId: "follow-ups-empty-h" });

  const loadCounts = useCallback(() => {
    crmApi.followUpCounts(w, b).then(
      (r) => setCounts(r.counts),
      () => setCounts(null), // the chips just go without numbers
    );
  }, [w, b]);
  const load = useCallback(() => {
    setFailed(false);
    setRows(null);
    crmApi.followUps(w, b, filter).then(
      (r) => (setRows(r.conversations), setNext(r.nextCursor)),
      () => setFailed(true),
    );
  }, [w, b, filter]);
  useEffect(load, [load]);
  useEffect(loadCounts, [loadCounts]);
  const loadMore = async () => {
    if (!next) return;
    setMore("busy");
    try {
      const r = await crmApi.followUps(w, b, filter, next);
      setRows((list) => [...(list ?? []), ...r.conversations.filter((c) => !(list ?? []).some((x) => x.id === c.id))]);
      setNext(r.nextCursor);
      setMore("idle");
    } catch {
      setMore("failed");
    }
  };
  // A change keeps the row where it is (until the next load), so the list doesn't jump under the reader.
  const changed = (c: ConversationDto) => {
    setRows((list) => (list ?? []).map((x) => (x.id === c.id ? c : x)));
    loadCounts();
  };

  const urlId = useSearchParams().get("c");
  const handled = useRef<string | null>(null);
  const listed = rows !== null || failed;
  useEffect(() => {
    if (!urlId || !listed || handled.current === urlId) return;
    handled.current = urlId;
    open(urlId, "always");
  }, [urlId, listed, open]);

  const chips = (
    <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
      {followUpChips(counts).map((c) => (
        <button
          key={c.filter}
          type="button"
          aria-pressed={c.filter === filter}
          onClick={() => setFilter(c.filter)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2",
            c.filter === filter ? "border-control bg-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {c.label}
          {c.count !== null ? <span className="ml-1.5 tabular-nums">{c.count.toLocaleString("en")}</span> : null}
        </button>
      ))}
    </div>
  );
  const current = rows?.find((r) => r.id === selected) ?? null;

  let list: React.ReactNode;
  if (failed)
    list = (
      <li className="px-5 py-3">
        <LoadFailed what="the follow-ups" onRetry={load} />
      </li>
    );
  else if (!rows)
    list = (
      <li className="px-5 py-3">
        <ListSkeleton label="Loading follow-ups" rows={3} />
      </li>
    );
  else
    list = (
      <>
        {rows.map((r) => (
          <ListRow key={r.id} selected={r.id === selected} onSelect={() => open(r.id)} className="flex-col gap-1">
            <span className="flex w-full items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{r.customer?.displayName ?? conversationTitle(r)}</span>
              <time dateTime={r.lastMessageAt} className="shrink-0 text-xs text-muted-foreground">{WHEN.format(new Date(r.lastMessageAt))}</time>
            </span>
            <span className="flex w-full flex-wrap items-center gap-1.5">
              <StatusBadge tone={stateTone(r.state)}>{FOLLOW_UP_STATE_LABEL[r.state]}</StatusBadge>
              {r.overdue ? <StatusBadge tone="bad">Overdue</StatusBadge> : null}
              {r.subject ? <span className="min-w-0 truncate text-xs text-muted-foreground">{r.subject}</span> : null}
            </span>
            <span className="w-full truncate text-xs text-muted-foreground">
              {[ownerName(owners, r.ownerId) ?? "No owner", r.nextAction ? `Next: ${r.nextAction}${r.nextActionDue ? `, due ${r.nextActionDue}` : ""}` : null].filter(Boolean).join(" · ")}
            </span>
          </ListRow>
        ))}
        {!rows.length ? (
          <li className="px-5 py-3 text-sm text-muted-foreground">
            Nothing here. Conversations are logged from a customer&rsquo;s page.
          </li>
        ) : null}
        {next ? (
          <li className="px-5 pt-2">
            <Button size="sm" variant="outline" disabled={more === "busy"} onClick={() => void loadMore()}>
              {more === "busy" ? "Loading…" : "Load more"}
            </Button>
            {more === "failed" ? (
              <span className="ml-2 text-sm text-destructive" role="alert">
                Couldn&rsquo;t load more. Try again.
              </span>
            ) : null}
          </li>
        ) : null}
      </>
    );

  return (
    <>
      <p className="max-w-prose text-sm text-muted-foreground">Conversations waiting on the team or on the customer. Overdue: a reply waiting over a day, the customer silent for a week, or a next action past its day.</p>
      <ListDetail
        list={
          <ListCard id={ids.list} title="Follow-ups" top={chips}>
            {list}
          </ListCard>
        }
        detail={
          selected ? (
            <ConversationView
              key={selected}
              sectionId={ids.item}
              w={w}
              b={b}
              id={selected}
              name={current ? (current.customer?.displayName ?? conversationTitle(current)) : null}
              owners={owners}
              canManage={canManage}
              onChanged={changed}
            />
          ) : null
        }
        placeholder={<EmptyState variant="card" icon={MessagesSquare} title="No conversation open" description="Pick a conversation to see its messages, log a new one, or change who follows it up." />}
      />
    </>
  );
}
