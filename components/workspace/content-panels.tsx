"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ExternalLink, LoaderCircle, Pencil, Plus, SlidersHorizontal, Sparkles, TriangleAlert, X } from "lucide-react";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { ListSkeleton } from "@/components/settings/shared";
import { LoadFailed } from "@/components/ui/load-failed";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { FilterSelect } from "@/components/ui/filter-select";
import { reelHref } from "@/components/reels/href";
import { NewPostDialog } from "@/components/workspace/new-post-dialog";
import { DraftEditor } from "@/components/workspace/draft-editor";
import { ReleasePanel } from "@/components/workspace/release-panel";
import { PeekSlot, usePeekTitle } from "@/components/workspace/peek";
import { QualityCheck } from "@/components/workspace/quality-check";
import { JOB_INTERVALS, useBrandData, useJob } from "@/components/workspace/use-job";
import { loadPlanCredits, withPrice, workspaceIdOf } from "@/lib/plan-credits";
import { dayTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { TONE_CLASS, TONE_DOT, toneOf, type Tone } from "@/lib/status";
import { safeHttpUrl, STATUS_GROUPS, type CheckResult } from "@/shared";
import { activeFilterCount, channelOptions, filterItems, ownerLabel, type CalendarFilter } from "@/lib/calendar-filter";
import { AGENDA_BELOW, CELL_FLOOR, dayCards, type CardForm, dayCellLabel, newPostTime, dayKey, gridRange, gridStep, groupByDay, monthGrid, popoverLeft, popoverSide, shortTime } from "@/lib/calendar-month";
import { ensureWorkLanguage, isRunCancelled, translateIdeas, TranslateToggle, type TranslatedIdea } from "@/components/languages/languages";
import { CHANNEL_LABEL, channelIcon, channelLabel, STATUS_LABEL } from "@/lib/post-labels";

/* ───────────── shared types + data ───────────── */

export type Opportunity = {
  id: string;
  title: string;
  summary: string;
  angle: string;
  channels: string[];
  decision: "RECOMMEND" | "HOLD" | "REJECT";
  reason: string;
  score: number;
  timing: string | null;
  sources: { url: string; title: string }[];
  status: "NEW" | "SHORTLISTED" | "DISMISSED" | "PLANNED";
};
export type ContentItem = {
  id: string;
  title: string;
  channel: string;
  status: string;
  scheduledFor: string | null;
  pillar: string | null;
  brief: Record<string, unknown> | null;
  opportunity: { title: string } | null;
  /** The idea this post was planned from, if any. */
  opportunityId?: string | null;
  /** The last publish went wrong: FAILED = not posted (reason in publishError), CHECK = may have posted. */
  publishIssue: "FAILED" | "CHECK" | null;
  publishError: string | null;
  /** Stories: planned to be posted by hand at `scheduledFor`, and the first rendered frame (signed link). */
  byHand?: boolean;
  firstFrameUrl?: string | null;
  /** Made in the reels studio: its plan, video and caption are changed in Reels. */
  studio?: boolean;
  campaignId?: string | null;
  /** The campaign's name with the post, so an ended or archived one from an older month can still be named; older servers omit it. */
  campaign?: { id: string; name: string } | null;
  /** Who looks after the post; older servers omit it (read as unassigned). */
  owner?: { id: string; name: string | null } | null;
  latest: {
    version: number;
    body: { hook: string; caption: string; hashtags: string[]; slides: string[]; script: string[]; pinTitle: string; altText: string; pinLink?: string };
    byPerson: boolean;
    check: { overall: "PASS" | "WARN" | "BLOCKER"; results: CheckResult[] } | null;
    review: { verdict: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; note: string | null } | null;
  } | null;
};

export { useBrandData };

export { LoadFailed };

/**
 * A polled block: a skeleton until the first load, LoadFailed if that failed, then the content. A refresh that fails
 * after a load keeps the content and says so, until a refresh works again. Without children (a list row of its own)
 * it renders only those states.
 */
export function LoadGate({
  ready,
  failed,
  what,
  onRetry,
  rows,
  className,
  children,
}: {
  ready: boolean;
  failed: boolean;
  what: string;
  onRetry: () => void;
  rows?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!ready) {
    return <div className={className}>{failed ? <LoadFailed what={what} onRetry={onRetry} /> : <ListSkeleton label={`Loading ${what}`} rows={rows} />}</div>;
  }
  return (
    <>
      {children}
      {failed && (
        <p role="status" className={cn("text-xs text-muted-foreground", className)}>
          Couldn&rsquo;t refresh. Showing the last update.
        </p>
      )}
    </>
  );
}

export { CHANNEL_LABEL, STATUS_LABEL };
const PUBLISH_ISSUE = { FAILED: "Not posted", CHECK: "Check needed" };
const DECISION: Record<Opportunity["decision"], string> = { RECOMMEND: "Recommend", HOLD: "Hold", REJECT: "Reject" };
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/* ───────────── Ideas panel ───────────── */

/** `perms`: the person's permissions on this brand (the shell's brandPermissions), here and in the panels below. */
/** Idea id → the first post planned from it (stable, so the shared content poll doesn't re-pick each render). */
export function pickPostByIdea(d: { items?: ContentItem[] }): Map<string, string> {
  const m = new Map<string, string>();
  for (const i of d.items ?? []) if (i.opportunityId && !m.has(i.opportunityId)) m.set(i.opportunityId, i.id);
  return m;
}

export function IdeasPanel({ base, perms, onRunScout, onOpenPosts, onOpenPost }: { base: string; perms: string[]; onRunScout: () => void; onOpenPosts?: () => void; onOpenPost?: (id: string) => void }) {
  const pick = useCallback((d: { opportunities: Opportunity[] }) => d.opportunities, []);
  const { data, failed, reload } = useBrandData(base, "opportunities", pick as (d: never) => Opportunity[]);
  // A planned idea links to the post made from it: read from the calendar's own (shared) list, no extra request.
  const postByIdea = useBrandData(base, "content", pickPostByIdea as (d: never) => Map<string, string>, !!onOpenPost).data;
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [error, setError] = useState<string | null>(null);
  // Translate: while on, the shown ideas in the team language (machine translation, display only), until Show original.
  const [translateOn, setTranslateOn] = useState(false);
  const [translations, setTranslations] = useState<Map<string, TranslatedIdea>>(new Map());
  const [translating, setTranslating] = useState(false);
  const shownIds = (data ?? []).filter((o) => (filter === "all" ? true : o.status === "NEW" || o.status === "SHORTLISTED")).map((o) => o.id).join(",");
  useEffect(() => {
    if (!translateOn || !shownIds) return;
    let cancelled = false;
    setTranslating(true);
    translateIdeas(base, shownIds.split(",")).then(
      (m) => !cancelled && setTranslations(m),
      (e: unknown) => {
        if (cancelled) return;
        setTranslateOn(false);
        setError(errorMessage(e, "Couldn't translate the ideas. Try again."));
      },
    ).finally(() => !cancelled && setTranslating(false));
    return () => {
      cancelled = true;
    };
  }, [translateOn, shownIds, base]);
  const translated = translateOn ? translations : null;
  const canDecide = perms.includes("content.create");
  const [planning, setPlanning] = useState<string | null>(null);
  const [planned, setPlanned] = useState(false);
  // The idea being updated and the status it is moving to, so its button can say so.
  const [deciding, setDeciding] = useState<{ id: string; status: Opportunity["status"] } | null>(null);
  // The Planner may already be running (started here before a reload, or from another panel): read it from the agents list.
  const pickPlanner = useCallback((d: { agents: { key: string; lastRun: { status: string } | null }[] }) => {
    const s = d.agents.find((a) => a.key === "planner")?.lastRun?.status;
    return s === "RUNNING" || s === "QUEUED";
  }, []);
  // Only for roles that can read agents (a client reviewer can't): never asked, so never a failure here.
  const plannerRunning = useBrandData(base, "agents", pickPlanner as (d: never) => boolean, !!perms.includes("agents.read")).data === true;
  const workspaceId = workspaceIdOf(base);
  const planPrice = useRunPrice(workspaceId, "planner");
  const scoutPrice = useRunPrice(workspaceId, "scout");
  const planFailed = useCallback((why: string) => {
    setPlanning(null);
    setError(why);
  }, []);
  const planDone = useCallback(() => {
    setPlanning(null);
    setPlanned(true);
    void reload();
  }, [reload]);

  async function plan() {
    setError(null);
    setPlanned(false);
    try {
      await ensureWorkLanguage(base);
      const { run } = await request<{ run: { id: string } }>(`${base}/agents/planner/runs`, { method: "POST", body: "{}" });
      setPlanning(run.id);
      if (workspaceId) void loadPlanCredits(workspaceId, true);
    } catch (e) {
      if (!isRunCancelled(e)) setError(errorMessage(e, "Couldn't start the Planner. Try again."));
    }
  }

  async function set(id: string, status: Opportunity["status"]) {
    setError(null);
    setPlanned(false);
    setDeciding({ id, status });
    try {
      await request(`${base}/opportunities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await reload();
    } catch {
      setError("Couldn't update that idea. Your role may not allow it.");
    } finally {
      setDeciding(null);
    }
  }

  if (!data) return failed ? <LoadFailed what="ideas" onRetry={reload} className="p-4" /> : <div className="min-h-48 p-4"><ListSkeleton label="Loading ideas" rows={3} /></div>;
  const shown = data.filter((o) => (filter === "all" ? true : o.status === "NEW" || o.status === "SHORTLISTED"));
  const shortlisted = data.filter((o) => o.status === "SHORTLISTED").length;
  return (
    <div className="flex flex-col">
      {/* Pinned, so the next step (Plan posts) stays in view while scrolling the ideas. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2 text-xs">
        <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {shortlisted} shortlisted
          {shortlisted > 0 && perms.includes("agents.run") ? (
            <Button size="sm" onClick={() => void plan()} disabled={!!planning || plannerRunning}>
              {planning || plannerRunning ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
              {planning || plannerRunning ? "Planning posts…" : withPrice(`Plan posts from ${shortlisted === 1 ? "this idea" : `these ${shortlisted} ideas`}`, planPrice)}
            </Button>
          ) : (
            <span>· shortlist the ideas you like, then plan them into posts</span>
          )}
          {planning && <RunWatch base={base} runId={planning} onFailed={planFailed} onDone={planDone} />}
        </span>
        <span className="flex items-center gap-2">
          {/* Translate is an AI call behind agents.read: a client reviewer doesn't get it. */}
          {shown.length > 0 && perms.includes("agents.read") && (
            <TranslateToggle
              on={translateOn && !translating}
              busy={translating}
              onTranslate={() => (setError(null), setTranslateOn(true))}
              onOriginal={() => setTranslateOn(false)}
            />
          )}
          <SegmentedRadios label="Filter ideas" name="ideas-filter" value={filter} onChange={setFilter} options={[{ value: "open", label: "To decide" }, { value: "all", label: "All" }]} />
        </span>
      </div>
      {error && <p role="alert" className="px-4 pt-3 text-sm text-destructive">{error}</p>}
      {planned && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 text-sm">
          <span>Posts planned. Open one to write its brief and draft.</span>
          <span className="flex gap-2">
            {onOpenPosts && (
              <Button size="sm" onClick={() => { setPlanned(false); onOpenPosts(); }}>
                Open posts
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPlanned(false)}>
              Dismiss
            </Button>
          </span>
        </div>
      )}
      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">{data.length ? "No open ideas. Switch to All to see past ones." : "No ideas yet. The Opportunities agent finds what to post about."}</p>
          {perms.includes("agents.run") && (
            <Button size="sm" variant="secondary" onClick={onRunScout}>
              {withPrice("Get ideas", scoutPrice)}
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge status={o.decision}>{DECISION[o.decision]}</StatusBadge>
                {o.timing && <span className="text-muted-foreground">{o.timing}</span>}
                {o.status !== "NEW" && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{o.status === "SHORTLISTED" ? "Shortlisted" : o.status === "PLANNED" ? "Planned" : "Dismissed"}</span>}
              </div>
              <p className="text-sm font-medium">{translated?.get(o.id)?.title ?? o.title}</p>
              <p className="text-sm text-muted-foreground">{translated?.get(o.id)?.summary ?? o.summary}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Why: </span>
                {translated?.get(o.id)?.reason ?? o.reason}
              </p>
              <p className="text-xs text-muted-foreground">{o.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(" · ")}</p>
              {o.sources.length > 0 && (
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {o.sources.flatMap((s) => { const u = safeHttpUrl(s.url); return u ? [{ ...s, u }] : []; }).slice(0, 3).map((s) => (
                    <li key={s.u.href}>
                      <a href={s.u.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 py-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                        {s.title || s.u.hostname} <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {o.status === "PLANNED" && (postByIdea?.get(o.id) && onOpenPost ? (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => onOpenPost(postByIdea.get(o.id)!)}>Open post</Button>
                </div>
              ) : onOpenPosts ? (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="secondary" onClick={onOpenPosts}>Open posts</Button>
                </div>
              ) : null)}
              {o.status !== "PLANNED" && canDecide && (
                <div className="flex gap-2 pt-1">
                  {o.status === "SHORTLISTED" ? (
                    <>
                      {/* The pinned bar above is the one place to plan: the Planner plans every shortlisted idea in one run. */}
                      <Button size="sm" variant="secondary" onClick={() => set(o.id, "NEW")} disabled={!!deciding}>
                        {deciding?.id === o.id ? "Removing…" : "Remove from shortlist"}
                      </Button>
                    </>
                  ) : o.status === "DISMISSED" ? (
                    <Button size="sm" variant="ghost" onClick={() => set(o.id, "NEW")} disabled={!!deciding}>
                      {deciding?.id === o.id ? "Restoring…" : "Undo dismiss"}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => set(o.id, "SHORTLISTED")} disabled={!!deciding}>
                        {deciding?.id === o.id && deciding.status === "SHORTLISTED" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Check aria-hidden="true" />}
                        {deciding?.id === o.id && deciding.status === "SHORTLISTED" ? "Shortlisting…" : "Shortlist"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => set(o.id, "DISMISSED")} disabled={!!deciding}>
                        {deciding?.id === o.id && deciding.status === "DISMISSED" ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <X aria-hidden="true" />}
                        {deciding?.id === o.id && deciding.status === "DISMISSED" ? "Dismissing…" : "Dismiss"}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────── Content (calendar) panel ───────────── */

const STATUS_GROUP_LABEL: Record<keyof typeof STATUS_GROUPS, string> = { toWrite: "To write", awaiting: "Awaiting approval", approved: "Approved", scheduled: "Scheduled", published: "Published" };
const NEED_LABEL = { overdue: "Overdue", blocked: "Blocked", week: "Next 7 days" } as const;
const VIEW_KEY = "cal.view.v1";
type CalendarView = "list" | "month";

/** A post's status as its badge and chip say it. */
const statusText = (i: ContentItem) =>
  i.publishIssue ? PUBLISH_ISSUE[i.publishIssue] : i.latest?.check?.overall === "BLOCKER" && i.status === "DRAFT_REVIEW" ? "Needs fixes" : (STATUS_LABEL[i.status] ?? i.status);

/** `selectedId`: the post open in the side peek, which the month marks. */
export function ContentPanel({ base, perms, me, filter, onFilter, onOpen, onRunPlanner, selectedId }: { base: string; perms: string[]; me: string | null; filter: CalendarFilter; onFilter: (f: CalendarFilter) => void; onOpen: (id: string) => void; onRunPlanner: () => void; selectedId?: string | null }) {
  const pick = useCallback((d: { items: ContentItem[] }) => d.items, []);
  const { data, failed, reload } = useBrandData(base, "content", pick as (d: never) => ContentItem[]);
  const canExport = perms.includes("content.download");
  // Campaign names for the filter, read once (the calendar's poll doesn't carry them); without them the filter just isn't offered.
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [campaignsFailed, setCampaignsFailed] = useState(false);
  useEffect(() => {
    setCampaignsFailed(false);
    request<{ campaigns: { id: string; name: string }[] }>(`${base}/campaigns`).then((r) => setCampaigns(r.campaigns), () => setCampaignsFailed(true));
  }, [base]);
  const shown = useMemo(() => (data ? filterItems(data, filter, me, new Date()) : null), [data, filter, me]);
  // The posts of the month last shown in Month, so its channels and campaigns can be filtered on too.
  const [monthItems, setMonthItems] = useState<ContentItem[]>([]);
  useEffect(() => setMonthItems([]), [base]);
  // List or Month, remembered per browser; read after mount so the server render and the first client render agree.
  const [view, setView] = useState<CalendarView>("list");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "month") setView("month");
    } catch {
      // storage blocked: List
    }
  }, []);
  const pickView = (v: CalendarView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  };
  const viewSwitch = (
    // One height with the toolbar's buttons and selects (32 px); the chosen view carries the --control outline chosen tabs use.
    <div role="tablist" aria-label="Calendar view" className="flex h-8 items-center gap-0.5 rounded-full border border-border bg-muted p-0.5 text-xs pointer-coarse:h-auto">
      {(["list", "month"] as const).map((v) => (
        <button key={v} role="tab" type="button" aria-selected={view === v} onClick={() => pickView(v)} className={cn("h-[26px] rounded-full px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11", view === v ? "bg-card text-foreground ring-1 ring-inset ring-control" : "text-muted-foreground hover:text-foreground")}>
          {v === "list" ? "List" : "Month"}
        </button>
      ))}
    </div>
  );
  // The month Month shows. It lives here so its name and arrows sit in the toolbar row instead of a row of their own.
  const [month, setMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const monthHeadId = useId();
  const showMonth = (y: number, m: number) => setMonth({ y: new Date(y, m, 1).getFullYear(), m: new Date(y, m, 1).getMonth() });
  // Opens the new post in the post view, like a calendar row.
  const canCreate = perms.includes("content.create");
  const newPost = <NewPostDialog base={base} canCreate={canCreate} onCreated={onOpen} />;
  // The same dialog, opened from an empty day in Month, set to that day (newPostTime; a day that is over starts undated).
  const [dayNewPost, setDayNewPost] = useState<{ at: string | null } | null>(null);
  if (!data || !shown) return failed ? <LoadFailed what="the calendar" onRetry={reload} className="p-4" /> : <div className="min-h-48 p-4"><ListSkeleton label="Loading calendar" rows={3} /></div>;
  // Month never shows this: past months come from their own read. The switch stays, so a brand with only old posts gets there.
  if (!data.length && view === "list") {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        {viewSwitch}
        <p className="text-sm text-muted-foreground">Nothing planned yet. Shortlist ideas, then run the Planner to fill your calendar.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onRunPlanner}>
            Plan posts
          </Button>
          {newPost}
        </div>
      </div>
    );
  }
  // Options from the list (open posts + 30 days) and the month last shown, so an older month's channel or campaign can be picked.
  const channels = [...new Set([...data, ...monthItems].map((i) => i.channel))];
  const used = new Set([...data, ...monthItems].map((i) => i.campaignId));
  // The campaigns list names the live ones; a post's own campaign names one that ended or was archived.
  const named = new Map(campaigns.filter((c) => used.has(c.id)).map((c) => [c.id, c.name]));
  for (const i of [...data, ...monthItems]) if (i.campaign && !named.has(i.campaign.id)) named.set(i.campaign.id, i.campaign.name);
  const campaignOptions = [...named].map(([id, name]) => ({ id, name }));
  const set = (patch: Partial<CalendarFilter>) => onFilter(Object.fromEntries(Object.entries({ ...filter, ...patch }).filter(([, v]) => v)) as CalendarFilter);
  // 16 px text on touch screens, so focusing a select doesn't zoom the page.
  const filterCount = activeFilterCount(filter);
  // The filter dropdowns: in the toolbar on a wide panel (`wide`), in the Filters popover otherwise, filling its width.
  const filterControls = (wide: boolean) => {
    return (
      <>
        <FilterSelect label="Channel" fill={!wide} value={filter.channel ?? ""} onChange={(v) => set({ channel: v || undefined })} options={[{ value: "", label: "All channels" }, ...channelOptions(channels, filter.channel).map((ch) => ({ value: ch, label: channelLabel(ch), icon: channelIcon(ch) }))]} />
        <FilterSelect label="Status" fill={!wide} value={filter.status ?? ""} onChange={(v) => set({ status: (v || undefined) as CalendarFilter["status"] })} options={[{ value: "", label: "Any status" }, ...(Object.keys(STATUS_GROUPS) as (keyof typeof STATUS_GROUPS)[]).map((g) => ({ value: g, label: STATUS_GROUP_LABEL[g] }))]} />
        {(campaignOptions.length > 0 || filter.campaignId) && (
          <FilterSelect
            label="Campaign"
            fill={!wide}
            value={filter.campaignId ?? ""}
            onChange={(v) => set({ campaignId: v || undefined })}
            options={[
              { value: "", label: "Any campaign" },
              ...campaignOptions.map((o) => ({ value: o.id, label: o.name })),
              ...(filter.campaignId && !campaignOptions.some((o) => o.id === filter.campaignId) ? [{ value: filter.campaignId, label: "This campaign" }] : []),
            ]}
          />
        )}
        {campaignsFailed && <p className="text-xs text-muted-foreground">Couldn&rsquo;t load campaigns.</p>}
        <FilterSelect label="Owner" fill={!wide} value={filter.owner ?? ""} onChange={(v) => set({ owner: (v || undefined) as CalendarFilter["owner"] })} options={[{ value: "", label: "Anyone" }, ...(me || filter.owner === "me" ? [{ value: "me", label: "Mine", disabled: !me }] : []), { value: "none", label: "Unassigned" }]} />
        <FilterSelect label="Needs action" fill={!wide} value={filter.need ?? ""} onChange={(v) => set({ need: (v || undefined) as CalendarFilter["need"] })} options={[{ value: "", label: "Needs action: any" }, ...(Object.keys(NEED_LABEL) as (keyof typeof NEED_LABEL)[]).map((n) => ({ value: n, label: NEED_LABEL[n] }))]} />
      </>
    );
  };
  const monthNav = (
    // On a narrow panel it takes a row of its own under the buttons. On a wide panel the heading keeps one width so the arrows don't move.
    <div className="flex items-center gap-1 @max-[640px]/cal:order-last @max-[640px]/cal:w-full">
      <h2 id={monthHeadId} aria-live="polite" className="mx-1 text-base font-semibold tracking-tight tabular-nums @min-[900px]/cal:min-w-40 @max-[640px]/cal:mr-auto">
        {new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      </h2>
      <Button size="sm" variant="ghost" className="w-8 px-0 pointer-coarse:w-11" aria-label="Previous month" onClick={() => showMonth(month.y, month.m - 1)}>
        <ChevronLeft aria-hidden className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" className="w-8 px-0 pointer-coarse:w-11" aria-label="Next month" onClick={() => showMonth(month.y, month.m + 1)}>
        <ChevronRight aria-hidden className="size-4" />
      </Button>
      <Button size="sm" variant="outline" onClick={() => showMonth(new Date().getFullYear(), new Date().getMonth())}>
        Today
      </Button>
    </div>
  );
  // Two rows (owner's spec). The first: view, month and its arrows and Today (in Month), then Export and New post at the
  // right. The second: the filter selects, once the panel is 760 px wide (they take about 650 px); under that they fold
  // into a Filters button in the first row and the second row goes. Under 720 px Export shows its icon only.
  // In Month the toolbar sticks to the top of the scrolling page (a short window scrolls under the calendar), on the
  // card's white so nothing shows through. Not in List, whose day headings stick to the same top.
  const filters = (
    <div className={cn("relative flex flex-col gap-2 border-b border-border px-4 py-2 @max-[640px]/cal:px-2", view === "month" && "sticky top-0 z-10 rounded-t-2xl bg-card")}>
      <div className="flex flex-wrap items-center gap-2">
        {viewSwitch}
        {view === "month" && monthNav}
        <span className="ml-auto flex items-center gap-2">
          <span className="@min-[480px]/cal:relative @min-[760px]/cal:hidden">
            <FiltersMenu count={filterCount} onClear={() => onFilter({})}>
              {filterControls(false)}
            </FiltersMenu>
          </span>
          {canExport && <ExportCsvButton url={`${base}/content/export`} filename={`calendar-${new Date().toLocaleDateString("en-CA")}.csv`} labelClassName="@max-[720px]/cal:sr-only" />}
          {newPost}
        </span>
      </div>
      <div role="group" aria-label="Filter posts" className="hidden flex-wrap items-center gap-2 @min-[760px]/cal:flex">
        {filterControls(true)}
        {filterCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onFilter({})}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
  if (view === "month") {
    return (
      // A column that fills the card, so the month grid can take the height that is left.
      <div className="flex flex-1 flex-col @container/cal">
        {filters}
        <MonthView
          base={base}
          filter={filter}
          me={me}
          month={month}
          headId={monthHeadId}
          undated={shown.filter((i) => !i.scheduledFor)}
          onOpen={onOpen}
          selectedId={selectedId ?? null}
          onItems={setMonthItems}
          onNewPost={canCreate ? (day) => setDayNewPost({ at: newPostTime(day) }) : undefined}
        />
        <NewPostDialog base={base} canCreate={canCreate} onCreated={onOpen} open={!!dayNewPost} onOpenChange={(o) => !o && setDayNewPost(null)} at={dayNewPost?.at ?? undefined} />
      </div>
    );
  }
  if (!shown.length) {
    return (
      <div className="@container/cal">
        {filters}
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">No posts match these filters</p>
          <Button size="sm" variant="secondary" onClick={() => onFilter({})}>
            Clear filters
          </Button>
        </div>
      </div>
    );
  }
  // Grouped by the viewer's local date, not the UTC one.
  const groups = groupByDay(shown);
  return (
    <div className="@container/cal">
      {filters}
      <ol className="flex flex-col">
        {[...groups].map(([k, list]) => (
          <li key={k}>
            <p className="sticky top-0 z-[1] bg-background/95 px-4 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">{k === "unscheduled" ? "No date" : day(list[0].scheduledFor!)}</p>
            <ul className="divide-y divide-border">
              {list.map((i) => {
                const time = i.scheduledFor ? shortTime(i.scheduledFor) : null;
                return (
                  <li key={i.id}>
                    <button type="button" onClick={() => onOpen(i.id)} className="flex min-h-11 w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      {i.channel === "INSTAGRAM_STORY" && (
                        // eslint-disable-next-line @next/next/no-img-element -- a signed storage link
                        i.firstFrameUrl ? <img src={i.firstFrameUrl} alt="" className="aspect-[9/16] w-6 shrink-0 rounded bg-muted object-cover" /> : <span aria-hidden className="aspect-[9/16] w-6 shrink-0 rounded bg-muted" />
                      )}
                      {/* One line on a wide panel (time and channel, title, owner, status); three on a narrow one (time,
                          channel and status; the title, wrapping; the owner). Grid placement keeps one reading order. */}
                      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 @min-[640px]/cal:grid-cols-[9rem_minmax(0,1fr)_auto_auto]">
                        <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {time && <span className="shrink-0 tabular-nums">{time}</span>}
                          <span className="truncate">{CHANNEL_LABEL[i.channel] ?? i.channel}</span>
                        </span>
                        <span title={i.title} className="col-span-2 row-start-2 text-sm @min-[640px]/cal:col-span-1 @min-[640px]/cal:col-start-2 @min-[640px]/cal:row-start-1 @min-[640px]/cal:truncate">
                          {i.title}
                        </span>
                        <span className="col-span-2 row-start-3 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground @min-[640px]/cal:col-span-1 @min-[640px]/cal:col-start-3 @min-[640px]/cal:row-start-1">
                          <span className="truncate">{ownerLabel(i.owner)}</span>
                          {i.byHand && i.scheduledFor && <span className="shrink-0 font-medium text-foreground">&middot; Post by hand {dayTime(i.scheduledFor)}</span>}
                        </span>
                        <span className="col-start-2 row-start-1 justify-self-end @min-[640px]/cal:col-start-4">
                          <StatusBadge quiet status={i.publishIssue ?? i.status}>{statusText(i)}</StatusBadge>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The Filters button for a panel too narrow for the selects: it shows how many filters are on and opens them in a
 * popover. Focus moves to the first select on open; Esc or Done closes it and gives focus back to the button, and a
 * press outside closes it. Under 480 px it spans the toolbar (its wrapper isn't positioned there), else it opens under the
 * button, lined up with its right edge (the button sits at the toolbar's right end).
 */
function FiltersMenu({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("select, button")?.focus();
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      // A filter's open menu is portalled to the body: a press in it is still a press inside the popover.
      if ((t as Element).closest?.("[role=menu]")) return;
      if (!box.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };
  return (
    <>
      <Button ref={btn} size="sm" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal aria-hidden="true" />
        Filters
        {count > 0 && (
          <span className="rounded-full bg-foreground px-1.5 text-xs leading-5 text-background tabular-nums">
            {count}
            <span className="sr-only"> on</span>
          </span>
        )}
      </Button>
      {open && (
        <div
          ref={box}
          id={id}
          role="group"
          aria-label="Filter posts"
          onKeyDown={(e) => {
            // Esc in a filter's menu closes that menu only (React passes its keys up through the portal).
            if (e.key !== "Escape" || (e.target as Element).closest("[role=menu]")) return;
            e.preventDefault();
            close();
          }}
          className="absolute left-2 right-2 top-full z-30 mt-1 flex flex-col gap-2 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-lg @min-[480px]/cal:left-auto @min-[480px]/cal:right-0 @min-[480px]/cal:w-72"
        >
          {children}
          <div className="flex justify-end gap-2 pt-1">
            {count > 0 && (
              <Button size="sm" variant="ghost" onClick={onClear}>
                Clear filters
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

type RangeAnswer = { items: ContentItem[]; truncated?: boolean };
const pickRange = (d: RangeAnswer) => d;
/** The gap (px) between day cells and between weeks. */
const CELL_GAP = 5;
// A day cell's size before its first measurement (three one-line cards); ResizeObserver replaces it at once.
const CELL_SIZE = { h: 94, w: 0 };
/** The month's cards mark their status with a coloured edge: this says what each colour is, since colour alone is not a label. */
const LEGEND: readonly (readonly [Tone, string])[] = [["info", "Awaiting approval · Scheduled"], ["good", "Approved · Published"], ["warn", "Needs a look"], ["bad", "Blocked · Rejected"], ["muted", "To write"]];
const postCount = (n: number) => (n === 1 ? "1 post" : `${n} posts`);

/**
 * One post as a card: a quiet fill, a hairline border and a thin left edge in its status colour. Its `form` comes from
 * dayCards, whose steps in calendar-month.ts count on these heights: "stacked2" and "stacked" put the channel's icon and
 * the time small and muted above the title (two lines of title, at most 50 px, or one, 34 px); "line" (28 px) and
 * "compact" (20 px) are one line, the icon and the title, the time left to the tooltip so the title keeps the width.
 * The title is cut short with an ellipsis; the day's popover lists it in full. It opens the post. It is not a tab stop:
 * the day's cell is, and its popover lists the same posts for the keyboard. The full time, title, channel and status are
 * its tooltip and its accessible name. `selected`: the post open in the side peek, outlined so its day reads at a glance.
 */
function PostCard({ item, onOpen, form = "compact", selected = false }: { item: ContentItem; onOpen: (id: string) => void; form?: CardForm; selected?: boolean }) {
  const time = item.scheduledFor ? shortTime(item.scheduledFor) : null;
  const channel = CHANNEL_LABEL[item.channel] ?? item.channel;
  const Icon = channelIcon(item.channel);
  const status = statusText(item); // once per card: the tooltip and the accessible name both use it
  const about = `${time ? `${time} · ` : ""}${item.title} · ${channel} · ${status}`;
  const stacked = form === "stacked" || form === "stacked2";
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => onOpen(item.id)}
      title={about}
      aria-label={about}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "pointer-events-auto relative flex w-full min-w-0 shrink-0 overflow-hidden rounded-md border pl-2.5 pr-1.5 text-left text-xs leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-foreground bg-accent ring-1 ring-foreground" : "border-border/70 bg-background hover:border-control hover:bg-muted",
        form === "stacked2" ? "max-h-[50px] min-h-[34px] flex-col justify-center py-0.5" : form === "stacked" ? "h-[34px] flex-col justify-center" : cn("items-center gap-1.5", form === "line" ? "h-7" : "h-5"),
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_DOT[toneOf(item.publishIssue ?? item.status)])} />
      {stacked ? (
        <span aria-hidden className="flex min-w-0 items-center gap-1 text-xs leading-3 text-muted-foreground">
          <Icon className="size-3 shrink-0" />
          {time && <span className="truncate tabular-nums">{time}</span>}
        </span>
      ) : (
        <Icon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span data-card-title className={cn("min-w-0 font-medium text-foreground", form === "stacked2" ? "line-clamp-2 break-words" : "truncate")}>{item.title}</span>
    </button>
  );
}

const POPOVER_W = 288; // w-72
const POPOVER_MAX_H = 320; // what max-h-80 was
// The close animation is 150 ms; the popover unmounts after this (under reduced motion it is hidden at once meanwhile).
const POPOVER_EXIT_MS = 200;

/** Where a day popover sits in MonthView's box: its left edge, and its top (below the cell) or bottom (above it). */
type PopoverAt = { left: number; top?: number; bottom?: number; maxHeight: number };

/**
 * A day's posts in a popover by its cell: time, channel, title and status, each opening the post. Focus moves in on
 * open; Esc, the close button or a press outside close it, and the caller gives focus back to the cell. It opens below
 * the cell, or above it when there is more room there (popoverSide), and is never taller than that room, so the
 * scrolling page never clips it. An empty day offers New post when `onNewPost` is given. Fades and scales in from 0.96
 * with a 4 px slide from the cell (opacity and transform only), and back out on close.
 * ponytail: not Radix Popover (not installed).
 */
function DayPopover({ label, posts, open, at, cell, onClose, onExited, onOpen, onNewPost }: {
  label: string;
  posts: ContentItem[];
  open: boolean;
  at: PopoverAt;
  cell: () => HTMLElement | null | undefined;
  onClose: () => void;
  onExited: () => void;
  onOpen: (id: string) => void;
  onNewPost?: () => void;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  // Mounted in the closed pose, then opened on the next frame so the transition has a start.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    head.current?.focus({ preventScroll: true });
    // Bring it into view (a bottom-row day in a short panel would otherwise open out of sight).
    const f = requestAnimationFrame(() => {
      setEntered(true);
      box.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(f);
  }, []);
  useEffect(() => {
    if (open) return;
    const t = setTimeout(onExited, POPOVER_EXIT_MS);
    return () => clearTimeout(t);
  }, [open, onExited]);
  // A press outside closes it; a press on its own cell is left to the cell's click, which toggles it.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !cell()?.contains(t)) onClose();
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, cell, onClose]);
  const shown = open && entered;
  const above = at.bottom !== undefined;
  return (
    <div
      ref={box}
      role="dialog"
      aria-labelledby={titleId}
      // Esc is used up here, so a side preview around the calendar doesn't close as well.
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onClose();
      }}
      style={{ left: at.left, top: at.top, bottom: at.bottom, width: POPOVER_W, maxHeight: at.maxHeight }}
      className={cn(
        "absolute z-20 flex max-w-full flex-col gap-1 overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-lg transition-[opacity,translate,scale] duration-150 ease-out motion-reduce:transition-none",
        above ? "origin-bottom-left" : "origin-top-left",
        shown ? "translate-y-0 scale-100 opacity-100" : cn("pointer-events-none scale-[0.96] opacity-0", above ? "translate-y-1" : "-translate-y-1"),
      )}
    >
      <div className="flex items-center gap-2 pl-2">
        <h4 id={titleId} ref={head} tabIndex={-1} className="mr-auto text-xs font-semibold focus-visible:outline-none">
          {posts.length ? <>{label} &middot; {postCount(posts.length)}</> : `Nothing on ${label}`}
        </h4>
        <Button size="sm" variant="ghost" className="w-8 px-0" aria-label="Close this day" onClick={onClose}>
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <DayPosts
        posts={posts}
        onPick={(id) => {
          // Closed first, so focus is back on the cell when the post opens: the preview returns focus there.
          onClose();
          onOpen(id);
        }}
      />
      {!posts.length && onNewPost && (
        <div className="px-2 pb-1">
          <Button
            size="sm"
            onClick={() => {
              onClose();
              onNewPost();
            }}
          >
            <Plus aria-hidden="true" />
            New post
          </Button>
        </div>
      )}
    </div>
  );
}

/** A day's posts, each a row (time and channel, status, title) that opens the post: the day popover's list and the narrow month's agenda. */
function DayPosts({ posts, onPick }: { posts: ContentItem[]; onPick: (id: string) => void }) {
  if (!posts.length) return null;
  return (
    <ul className="flex flex-col">
      {posts.map((i) => {
        const time = i.scheduledFor && shortTime(i.scheduledFor) ? new Date(i.scheduledFor).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
        return (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onPick(i.id)}
              className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11"
            >
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {time && <span className="tabular-nums">{time} &middot; </span>}
                  {CHANNEL_LABEL[i.channel] ?? i.channel}
                </span>
                <StatusBadge quiet status={i.publishIssue ?? i.status}>{statusText(i)}</StatusBadge>
              </span>
              <span className="text-sm">{i.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The calendar as a month grid (weeks start Monday); the toolbar holds its month name and arrows. Dated posts come from
 * their own read of the grid's dates (?from&to, so past months show); undated ones are the list's. The same filters apply.
 * Each day is a button under its cards; arrow keys move between days (the grid is one tab stop). From AGENDA_BELOW px
 * wide, the weeks share the height the page leaves them (each at least CELL_FLOOR), each day shows as many post cards as
 * its height holds (cardsThatFit) and then "+N more", and a day opens a popover listing all its posts; a card opens its
 * post. Under that width days show status dots and a tapped day lists its posts under the grid (an agenda), as phone
 * calendars do, since a popover over a 45 px cell covers the grid it belongs to.
 * A CSS grid with ARIA table roles, not a <table>: table rows size to their content and won't share a height.
 * ponytail: no drag to reschedule, no week view.
 */
function MonthView({ base, filter, me, month, headId, undated, onOpen, selectedId, onItems, onNewPost }: { base: string; filter: CalendarFilter; me: string | null; month: { y: number; m: number }; headId: string; undated: ContentItem[]; onOpen: (id: string) => void; selectedId: string | null; onItems: (items: ContentItem[]) => void; onNewPost?: (day: string) => void }) {
  // The day whose popover shows (its key) and where; `open` is false while it closes.
  const [pop, setPop] = useState<{ key: string; open: boolean; at: PopoverAt } | null>(null);
  // The day last focused: it holds the grid's one tab stop.
  const [cursor, setCursor] = useState<string | null>(null);
  // The narrow month's chosen day, whose posts the agenda lists.
  const [picked, setPicked] = useState<string | null>(null);
  const grid = useMemo(() => monthGrid(month.y, month.m), [month]);
  const { from, to } = gridRange(grid);
  // A month that is all past changes rarely: polled slower. ponytail: one cached read per month looked at, polled while Month is open.
  const past = new Date(to).getTime() <= Date.now();
  const { data, failed, reload } = useJob(`${base}/content?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    pick: pickRange as (d: never) => RangeAnswer,
    intervals: past ? JOB_INTERVALS.preview : JOB_INTERVALS.always,
  });
  const byDay = useMemo(() => groupByDay(data ? filterItems(data.items, filter, me, new Date()) : []), [data, filter, me]);
  // Reported only when what the filters list changes (a post, its channel or campaign), not on every poll.
  const itemsKey = data?.items.map((i) => `${i.id}:${i.channel}:${i.campaign?.id ?? i.campaignId ?? ""}`).join() ?? null;
  useEffect(() => {
    if (data) onItems(data.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, onItems]);
  // Another month closes the open day.
  useEffect(() => setPop(null), [month]);
  const today = dayKey(new Date());
  const agendaId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  // Whether the panel is under AGENDA_BELOW px: the same width the @min-[640px]/cal classes test (this box fills the panel).
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < AGENDA_BELOW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A day cell's measured size (every cell is the same), which sets how many cards a day shows and in which form
  // (dayCards). Watches the weeks' box, which is there once the month has loaded.
  const weeksBox = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(CELL_SIZE);
  const loaded = !!data;
  useEffect(() => {
    const el = weeksBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cell = el.querySelector<HTMLElement>("[role=cell]");
      if (cell) setCellSize((s) => (s.h === cell.offsetHeight && s.w === cell.offsetWidth ? s : { h: cell.offsetHeight, w: cell.offsetWidth }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded, narrow, grid.length]);
  const cellOf = useCallback((k: string) => wrap.current?.querySelector<HTMLElement>(`[data-day="${k}"]`), []);
  const openDay = (k: string) => {
    const el = cellOf(k);
    if (!el) return;
    const box = wrap.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // The room above and below inside the scrolling main area (else the window), which would clip the popover.
    const scroller = wrap.current!.closest("main")?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const { side, maxHeight } = popoverSide(scroller.bottom - r.bottom - 4, r.top - scroller.top - 4, POPOVER_MAX_H);
    const left = popoverLeft(r.left - box.left, POPOVER_W, box.width);
    setPop({ key: k, open: true, at: side === "below" ? { left, top: r.bottom - box.top + 4, maxHeight } : { left, bottom: box.bottom - r.top + 4, maxHeight } });
  };
  // Closing gives focus back to the day's cell.
  const closeDay = useCallback(() => {
    if (!pop?.open) return;
    cellOf(pop.key)?.focus();
    setPop({ ...pop, open: false });
  }, [pop, cellOf]);
  const popCell = useCallback(() => (pop ? cellOf(pop.key) : null), [pop, cellOf]);
  const popExited = useCallback(() => setPop((p) => (p && !p.open ? null : p)), []);
  const inMonth = grid.filter((d) => d.getMonth() === month.m).reduce((n, d) => n + (byDay.get(dayKey(d))?.length ?? 0), 0);
  const weeks = Array.from({ length: grid.length / 7 }, (_, w) => grid.slice(w * 7, w * 7 + 7));
  const keys = grid.map(dayKey);
  // The tab stop: the day last focused if it's on this grid, else today if shown, else the 1st.
  const stop = cursor && keys.includes(cursor) ? cursor : keys.includes(today) ? today : dayKey(new Date(month.y, month.m, 1));
  // The agenda's day: the one tapped if it's on this grid, else the tab stop's.
  const agendaKey = picked && keys.includes(picked) ? picked : stop;
  const dayLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const popDay = pop ? grid[keys.indexOf(pop.key)] : undefined;
  const agendaDay = grid[keys.indexOf(agendaKey)];
  const agendaPosts = byDay.get(agendaKey) ?? [];
  return (
    <div ref={wrap} className="relative flex flex-1 flex-col gap-2 px-4 pt-2 pb-2 @max-[640px]/cal:px-1">
      {undated.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs @max-[640px]/cal:px-1">
          <span className="mr-1 text-muted-foreground">No date &middot; {undated.length}</span>
          {undated.map((i) => (
            <span key={i.id} className="w-48 max-w-full">
              <PostCard item={i} onOpen={onOpen} form="line" selected={i.id === selectedId} />
            </span>
          ))}
        </div>
      )}
      <LoadGate ready={!!data} failed={failed} what="this month" onRetry={reload}>
        {inMonth === 0 && <p className="text-xs text-muted-foreground">Nothing planned this month</p>}
        {data?.truncated && <p className="text-xs text-muted-foreground">Showing the first 500 posts of this range</p>}
        <div role="table" aria-labelledby={headId} className={cn("flex flex-col gap-1.5 text-xs", !narrow && "flex-1")}>
          <div role="rowgroup">
            <div role="row" className="grid grid-cols-7 gap-[5px] @max-[640px]/cal:gap-x-0">
              {grid.slice(0, 7).map((d) => (
                <div key={d.getDay()} role="columnheader" className="px-1.5 text-left text-xs font-semibold uppercase leading-4 tracking-wide text-foreground/70 @max-[640px]/cal:px-0 @max-[640px]/cal:text-center">
                  <abbr title={d.toLocaleDateString(undefined, { weekday: "long" })} className="no-underline">
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </abbr>
                </div>
              ))}
            </div>
          </div>
          <div
            ref={weeksBox}
            role="rowgroup"
            // Wide: the weeks share what height is left, each at least CELL_FLOOR (the floor is also the box's minimum,
            // so a short window scrolls the page instead of squeezing the days). Narrow: rows as tall as their days.
            className={cn("grid", !narrow && "flex-1")}
            style={{ gap: CELL_GAP, ...(narrow ? {} : { gridTemplateRows: `repeat(${weeks.length}, minmax(${CELL_FLOOR}px, 1fr))`, minHeight: weeks.length * CELL_FLOOR + (weeks.length - 1) * CELL_GAP }) }}
            // Arrow keys move between days, a week up or down; the focused day becomes the grid's tab stop.
            onKeyDown={(e) => {
              const k = (e.target as HTMLElement).dataset.day;
              if (e.key === "Escape" && pop?.open) {
                e.preventDefault();
                return closeDay();
              }
              const n = k ? gridStep(keys.indexOf(k), e.key, keys.length) : null;
              if (n === null) return;
              e.preventDefault();
              cellOf(keys[n])?.focus();
            }}
          >
            {weeks.map((week) => (
              <div key={dayKey(week[0])} role="row" className="grid min-h-0 grid-cols-7 gap-[5px] @max-[640px]/cal:gap-x-0">
                {week.map((d) => {
                  const k = dayKey(d);
                  const posts = byDay.get(k) ?? [];
                  const isOpen = !narrow && pop?.key === k && pop.open;
                  const isPicked = narrow && agendaKey === k;
                  const isToday = k === today;
                  const outside = d.getMonth() !== month.m;
                  const fit = dayCards(posts.length, cellSize.h, cellSize.w);
                  // The open post behind "+N more" marks that button instead, so its day still shows.
                  const selectedHidden = !!selectedId && posts.slice(fit.shown).some((i) => i.id === selectedId);
                  return (
                    <div
                      key={k}
                      role="cell"
                      className={cn(
                        // The cell clips: its height comes from the row, never from its cards (cardsThatFit sizes those).
                        "@container/cell relative min-h-0 min-w-0 overflow-hidden rounded-lg border border-border @max-[640px]/cal:min-h-11 @max-[640px]/cal:border-transparent",
                        // The month's days are white; days of the next or last month sit on a muted fill with muted dates.
                        outside ? "bg-muted/60" : "bg-card",
                        // Today is marked by its date alone (a dark circle). The chosen day (popover or agenda open) gets
                        // the --control outline chosen tabs use and a faint fill; the open post marks its own card.
                        (isOpen || isPicked) && "z-[1] border-control bg-accent/40 ring-1 ring-control @max-[640px]/cal:border-control",
                      )}
                    >
                      {/* The day itself: a button under the cards, filling the cell. It opens the day's popover, or on a
                          narrow panel picks the agenda's day. Its name reads the day's posts, which the cards show cut short. */}
                      <button
                        type="button"
                        data-day={k}
                        tabIndex={k === stop ? 0 : -1}
                        aria-label={dayCellLabel(dayLabel(d), posts.map((i) => ({ title: i.title, time: i.scheduledFor ? shortTime(i.scheduledFor) : null, status: statusText(i) })))}
                        aria-current={isToday ? "date" : undefined}
                        {...(narrow ? { "aria-pressed": isPicked, "aria-controls": agendaId } : { "aria-haspopup": "dialog" as const, "aria-expanded": isOpen })}
                        onFocus={() => setCursor(k)}
                        onClick={() => (narrow ? setPicked(k) : isOpen ? closeDay() : openDay(k))}
                        className="absolute inset-0 rounded-lg transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      />
                      {/* What the cell shows, over the button. Clicks pass through to it, except on a card or "+N more".
                          Absolute, so the cards never give the row a height of their own: the row sizes the cell, the
                          cell's measured height sizes the cards (cardsThatFit). In flow they would hold the row at
                          whatever height the last count of cards needed. */}
                      <div className="pointer-events-none absolute inset-0 flex flex-col gap-0.5 px-1 pt-1 pb-0.5 @max-[640px]/cal:items-center">
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                            outside ? "text-muted-foreground/80" : "text-foreground",
                            isToday && "bg-primary font-semibold text-primary-foreground",
                          )}
                        >
                          {d.getDate()}
                        </span>
                        {posts.length > 0 &&
                          (narrow ? (
                            // Narrow panel: a dot per post in its status colour (the agenda below names each one); the open post's is ringed.
                            <span aria-hidden className="flex items-center gap-0.5">
                              {posts.slice(0, 3).map((i) => <span key={i.id} className={cn("size-1.5 rounded-full", TONE_DOT[toneOf(i.publishIssue ?? i.status)], i.id === selectedId && "ring-1 ring-foreground ring-offset-1")} />)}
                              {posts.length > 3 && <span className="leading-none text-muted-foreground">+{posts.length - 3}</span>}
                            </span>
                          ) : (
                            <>
                              {posts.slice(0, fit.shown).map((i) => <PostCard key={i.id} item={i} onOpen={onOpen} form={fit.form} selected={i.id === selectedId} />)}
                              {fit.more > 0 && (
                                // Opens the day's popover, which lists every post: no post is ever out of reach.
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  onClick={() => (isOpen ? closeDay() : openDay(k))}
                                  aria-current={selectedHidden ? "true" : undefined}
                                  className={cn("pointer-events-auto h-5 shrink-0 self-start rounded-md px-1.5 text-left text-xs font-semibold text-foreground underline-offset-2 hover:bg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedHidden && "bg-accent ring-1 ring-foreground")}
                                >
                                  +{fit.more} more
                                </button>
                              )}
                            </>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {narrow && agendaDay && (
          <section id={agendaId} aria-label="Posts on the chosen day" className="flex flex-col gap-1 border-t border-border pt-2">
            <h3 aria-live="polite" className="px-2 text-xs font-semibold">
              {agendaPosts.length ? <>{dayLabel(agendaDay)} &middot; {postCount(agendaPosts.length)}</> : `Nothing on ${dayLabel(agendaDay)}`}
            </h3>
            <DayPosts posts={agendaPosts} onPick={onOpen} />
            {!agendaPosts.length && onNewPost && (
              <div className="px-2">
                <Button size="sm" onClick={() => onNewPost(agendaKey)}>
                  <Plus aria-hidden="true" />
                  New post
                </Button>
              </div>
            )}
          </section>
        )}
        {/* What each colour means, in words: a dot and its label. */}
        <ul aria-label="Status colours" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground @max-[640px]/cal:px-2">
          {LEGEND.map(([tone, label]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} />
              {label}
            </li>
          ))}
        </ul>
      </LoadGate>
      {!narrow && pop && popDay && (
        <DayPopover key={pop.key} label={dayLabel(popDay)} posts={byDay.get(pop.key) ?? []} open={pop.open} at={pop.at} cell={popCell} onClose={closeDay} onExited={popExited} onOpen={onOpen} onNewPost={onNewPost && (() => onNewPost(pop.key))} />
      )}
    </div>
  );
}

/* ───────────── Centre: one post ───────────── */

/** What moves this post forward, and which agent does it. Approval and publishing live in the release panel. */
function nextStep(i: ContentItem): { text: string; agent?: { key: string; label: string }; edit?: string } | null {
  const l = i.latest;
  if (i.status === "PLANNED") return { text: "Next: the Brief writer turns this plan into a production brief.", agent: { key: "brief", label: "Write the brief" }, edit: "Skip it and write the draft" };
  if (i.status === "BRIEF_READY") return { text: "Next: write the draft from the brief.", agent: { key: "creator", label: "Write it with the Creator" }, edit: "Write it yourself" };
  if (i.status === "DRAFT_REVIEW" && l?.review?.verdict === "CHANGES_REQUESTED")
    return { text: `The approver asked for changes${l.review.note ? `: \u201c${l.review.note}\u201d` : "."}`, agent: { key: "creator", label: "Rewrite with the Creator" }, edit: "Edit it yourself" };
  if (i.status === "DRAFT_REVIEW" && l?.check?.overall === "BLOCKER")
    return { text: "The quality check found problems to fix (listed below).", agent: { key: "creator", label: "Fix with the Creator" }, edit: "Fix it yourself" };
  if (i.status === "DRAFT_REVIEW" && l && !l.check) return { text: `Next: the quality check reviews v${l.version} before it goes to the approver.`, agent: { key: "quality", label: "Run the quality check" } };
  if (i.status === "REJECTED") return { text: "The approver rejected this post. Edit the draft to send it back through review.", edit: "Edit the draft" };
  if (i.status === "BLOCKED") return { text: "This post is blocked. Edit the draft to send it back through review.", edit: "Edit the draft" };
  return null;
}

function NextStep({ base, item, perms, onEdit }: { base: string; item: ContentItem; perms: string[]; onEdit: () => void }) {
  const step = nextStep(item);
  // The agent we started, until the post moves on (status, version or check changes).
  const at = `${item.status}:${item.latest?.version ?? 0}:${item.latest?.check ? 1 : 0}`;
  const [started, setStarted] = useState<{ key: string; runId: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The run finished and the post may look the same: say so, until the post changes or another run starts.
  const [ranOut, setRanOut] = useState(false);
  const workspaceId = workspaceIdOf(base);
  // Before the early return below; the key is unused when the step has no agent.
  const price = useRunPrice(workspaceId, step?.agent?.key ?? "");
  useEffect(() => {
    setStarted(null);
    setError(null);
    setRanOut(false);
  }, [at]);
  const stopped = useCallback((why: string) => {
    setStarted(null);
    setError(why);
  }, []);
  // Finished: drop the spinner even if the post looks the same (the next poll brings any change).
  const finished = useCallback(() => {
    setStarted(null);
    setRanOut(true);
  }, []);
  if (!step) return null;
  const canRun = perms.includes("agents.run");
  const story = item.channel === "INSTAGRAM_STORY";
  const canEdit = perms.includes("content.create") && !story;

  async function run(key: string) {
    setPending(true);
    setError(null);
    setRanOut(false);
    try {
      await ensureWorkLanguage(base);
      const { run } = await request<{ run: { id: string } }>(`${base}/agents/${encodeURIComponent(key)}/runs`, { method: "POST", body: "{}" });
      setStarted({ key, runId: run.id });
      if (workspaceId) void loadPlanCredits(workspaceId, true);
    } catch (e) {
      if (!isRunCancelled(e)) setError(errorMessage(e, "Couldn't start the agent. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Next step" className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <p className="text-sm">{step.text}</p>
      {started ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          Working on it. This post updates by itself; follow along in the Agents feed.
          <RunWatch base={base} runId={started.runId} onFailed={stopped} onDone={finished} />
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {step.agent && canRun && (
            <Button size="sm" onClick={() => run(step.agent!.key)} disabled={pending}>
              <Sparkles aria-hidden /> {pending ? "Starting…" : withPrice(step.agent.label, price)}
            </Button>
          )}
          {step.edit && canEdit && (
            <Button size="sm" variant={step.agent && canRun ? "outline" : "default"} onClick={onEdit}>
              <Pencil aria-hidden /> {step.edit}
            </Button>
          )}
          {story && step.edit && <p className="text-sm text-muted-foreground">Edit it on the phone.</p>}
          {!(step.agent && canRun) && !(step.edit && canEdit) && !(story && step.edit) && (
            <p className="text-sm text-muted-foreground">Your role can&rsquo;t do this step. Someone who runs agents or edits content will pick it up.</p>
          )}
        </div>
      )}
      {ranOut && <p role="status" className="text-sm text-muted-foreground">The agent finished.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

/** Polls the agents list while a run we started is going; reports it if that run ends FAILED. */
// ponytail: reads each agent's latest run only; if another run of the same agent starts, ours drops out and the spinner waits for the post to change.
function RunWatch({ base, runId, onFailed, onDone }: { base: string; runId: string; onFailed: (why: string) => void; onDone?: () => void }) {
  type Run = { id: string; status: string; error: string | null };
  const pick = useCallback((d: { agents: { lastRun: Run | null }[] }) => d.agents.find((a) => a.lastRun?.id === runId)?.lastRun ?? null, [runId]);
  const run = useBrandData(base, "agents", pick as (d: never) => Run | null).data;
  useEffect(() => {
    if (run?.status === "FAILED") onFailed(run.error || "The agent stopped before finishing. Try again.");
    if (run?.status === "SUCCEEDED") onDone?.();
  }, [run, onFailed, onDone]);
  return null;
}

type StoryFrameView = { n: number; url: string | null; kind: "photo" | "video" | null; headline: string };
type StoryView = { rendering: boolean; renderError: string | null; frames: StoryFrameView[] };

const pickStoryView = (d: Partial<StoryView>): StoryView => ({ rendering: d.rendering ?? false, renderError: d.renderError ?? null, frames: d.frames ?? [] });
const storyDone = (v: StoryView) => !v.rendering;

/** A story's rendered frames, read-only: 9:16 thumbnails (click for full size), clips play in place. Stories are edited on the phone. */
function StoryFrames({ base, item }: { base: string; item: ContentItem }) {
  // Fetched when the version changes and polled only while rendering: each response signs new links, so polling always would reload every picture.
  const url = `${base}/content/${encodeURIComponent(item.id)}`;
  const version = item.latest?.version;
  const { data, failed, reload } = useJob(url, { pick: pickStoryView, done: storyDone, intervals: JOB_INTERVALS.storyRender });
  // The hook's own mount poll is the first fetch; only a real change of version needs a fresh one (fresh never joins an in-flight request).
  const seen = useRef(version);
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    void reload();
  }, [reload, version]);
  const [zoom, setZoom] = useState<StoryFrameView | null>(null);
  useEffect(() => {
    if (!zoom) return;
    // Capture phase, and used up: Esc closes the zoom first, not the side peek around it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setZoom(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoom]);
  const body = item.latest?.body as unknown as { frames?: { label?: string; headline?: string; body?: string }[]; cta?: string; link?: string } | undefined;
  const link = body?.link ? safeHttpUrl(body.link) : null;
  return (
    <section aria-label="Story frames" className="border-t border-border pt-5">
      <h2 className="text-sm font-semibold">
        Story {item.latest ? `v${item.latest.version}` : ""}
        {item.latest?.byPerson && <span className="ml-2 font-normal text-muted-foreground">edited by a person</span>}
      </h2>
      {!data ? (
        failed ? <LoadFailed what="the frames" onRetry={reload} className="mt-2" /> : <div className="mt-2 min-h-24"><ListSkeleton label="Loading frames" rows={1} /></div>
      ) : (
        <>
          {data.rendering && (
            <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Rendering the frames…
            </p>
          )}
          {data.renderError && <p role="alert" className="mt-2 text-sm text-destructive">{data.renderError}</p>}
          {data.frames.length === 0 && !data.rendering && <p className="mt-2 text-sm text-muted-foreground">No frames yet.</p>}
          <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.frames.map((f) => (
              <li key={f.n} className="flex flex-col gap-1.5">
                {f.url && f.kind === "video" ? (
                  <video controls preload="metadata" src={f.url} aria-label={`Frame ${f.n}`} className="aspect-[9/16] w-full rounded-lg bg-muted object-cover" />
                ) : f.url ? (
                  <button type="button" onClick={() => setZoom(f)} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Frame ${f.n}, full size`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
                    <img src={f.url} alt={`Frame ${f.n}${f.headline ? `: ${f.headline}` : ""}`} className="aspect-[9/16] w-full rounded-lg bg-muted object-cover" />
                  </button>
                ) : (
                  <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground">Frame {f.n}: no picture yet</div>
                )}
                <p className="text-xs text-muted-foreground">
                  {f.n}. {f.headline || "No headline"}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
      {body?.cta && <p className="mt-3 text-sm"><span className="text-muted-foreground">Button: </span>{body.cta}</p>}
      {link && (
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Link: </span>
          <a href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
            {link.hostname} <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Edit on the phone. The frames here are what you approve.</p>
      {/* Radix portals this to the body: the peek is a containing block for fixed children (its translate). */}
      <Dialog open={!!zoom?.url} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent aria-describedby={undefined} className="w-auto max-w-[calc(100%-2rem)] p-3 sm:p-3">
          <DialogTitle className="sr-only">Frame {zoom?.n}</DialogTitle>
          {zoom?.url && (
            // eslint-disable-next-line @next/next/no-img-element -- a signed storage link
            <img src={zoom.url} alt={`Frame ${zoom.n} full size`} className="max-h-[85vh] w-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ContentView({ base, perms, id, reelsOn, brandId, onLoaded }: { base: string; perms: string[]; id: string; reelsOn: boolean; brandId: string; onLoaded?: () => void }) {
  const pick = useCallback((d: { items: ContentItem[] }) => d.items, []);
  const { data, failed, reload } = useBrandData(base, "content", pick as (d: never) => ContentItem[]);
  // A post outside the calendar window (an old one, opened from a link) isn't in the list: ask for it by id, once per id.
  // lookup: loading until answered; "done" with no post is a 404, "failed" shows a retry.
  const [outside, setOutside] = useState<ContentItem | null>(null);
  const [lookup, setLookup] = useState<"loading" | "done" | "failed">("loading");
  const [tries, setTries] = useState(0);
  const listed = data?.find((i) => i.id === id);
  const missing = !!data && !listed;
  useEffect(() => {
    if (!missing) return;
    let live = true;
    setLookup("loading");
    request<{ items: ContentItem[] }>(`${base}/content?id=${encodeURIComponent(id)}`).then(
      (r) => live && (setOutside(r.items[0] ?? null), setLookup("done")),
      (e) => live && (e instanceof ApiError && e.status === 404 ? (setOutside(null), setLookup("done")) : setLookup("failed")),
    );
    return () => {
      live = false;
    };
  }, [missing, base, id, tries]);
  const item = listed ?? (outside?.id === id ? outside : undefined);
  const found = !!item;
  useEffect(() => {
    if (found) onLoaded?.();
  }, [found, onLoaded]);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [id]);
  const locked = item?.status === "SCHEDULED" || item?.status === "PUBLISHED" || item?.status === "REVIEWED";
  const canEdit = perms.includes("content.create") && !locked && !item?.studio;
  // Who can own a post, read once when the person may reassign (a plain fetch: the 6 s poll must not carry it).
  const canAssign = perms.includes("content.create");
  const [owners, setOwners] = useState<{ id: string; name: string | null }[]>([]);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [ownersFailed, setOwnersFailed] = useState(false);
  useEffect(() => {
    if (!canAssign) return;
    setOwnersFailed(false);
    request<{ owners: { id: string; name: string | null }[] }>(`${base}/content/owners`).then((r) => setOwners(r.owners), () => setOwnersFailed(true));
  }, [canAssign, base]);
  const [assigning, setAssigning] = useState(false);
  useEffect(() => setOwnerError(null), [id]);
  const assign = (userId: string | null) => {
    setOwnerError(null);
    setAssigning(true);
    // Refresh the source the post came from: the list, or the by-id lookup for a post outside the window.
    const refresh = () => (listed ? reload() : request<{ items: ContentItem[] }>(`${base}/content?id=${encodeURIComponent(id)}`).then((r) => setOutside(r.items[0] ?? null)));
    request(`${base}/content/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ action: "setOwner", userId }) })
      .then(refresh)
      .catch((e) => setOwnerError(errorMessage(e)))
      .finally(() => setAssigning(false));
  };
  const brief = (item?.brief ?? {}) as { goal?: string; audience?: string; keyMessage?: string; products?: string[]; cta?: string; visual?: string; questions?: string[]; angle?: string };
  const b = item?.latest?.body;
  usePeekTitle(item?.title);

  return (
    <div>
      {!item ? (
        data ? (
          lookup === "done" ? (
            <p className="p-6 text-sm text-muted-foreground">This post no longer exists.</p>
          ) : lookup === "failed" ? (
            <LoadFailed what="this post" onRetry={() => setTries((n) => n + 1)} className="p-6" />
          ) : (
            <div className="min-h-48 p-6"><ListSkeleton label="Loading post" rows={3} /></div>
          )
        ) : failed ? (
          <LoadFailed what="this post" onRetry={reload} className="p-6" />
        ) : (
          <div className="min-h-48 p-6"><ListSkeleton label="Loading post" rows={3} /></div>
        )
      ) : (
        <div className="flex flex-col gap-5 px-5 py-5">
          {/* In the peek's sticky header, under the title: where and when it goes out, and where it stands. */}
          <PeekSlot to="header">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>
                {CHANNEL_LABEL[item.channel]} · {item.scheduledFor ? day(item.scheduledFor) : "no date"}
                {item.latest ? ` · draft v${item.latest.version}` : ""}
              </span>
              <span className={cn("rounded-full border px-2 py-0.5 font-medium", TONE_CLASS[toneOf(item.publishIssue ?? item.status)])}>{statusText(item)}</span>
            </div>
          </PeekSlot>
          <div>
            {item.opportunity && <p className="text-sm text-muted-foreground">From the idea: {item.opportunity.title}</p>}
            {canAssign ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span aria-hidden className="text-muted-foreground">Owner</span>
                {/* The styled dropdown the calendar filters use: its accessible name says "Owner: <who>". */}
                <FilterSelect
                  label="Owner"
                  disabled={assigning}
                  value={item.owner?.id ?? ""}
                  onChange={(v) => assign(v || null)}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...(item.owner && !owners.some((o) => o.id === item.owner!.id) ? [{ value: item.owner.id, label: item.owner.name ?? "Unnamed" }] : []),
                    ...owners.map((o) => ({ value: o.id, label: o.name ?? "Unnamed" })),
                  ]}
                />
                {ownerError && <span role="alert" className="text-xs text-destructive">{ownerError}</span>}
                {ownersFailed && <span className="text-xs text-muted-foreground">Couldn&rsquo;t load owners.</span>}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Owner: {ownerLabel(item.owner)}</p>
            )}
            {item.publishIssue && (
              <p role="status" className={cn("mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm", TONE_CLASS[toneOf(item.publishIssue)])}>
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium">{item.publishIssue === "FAILED" ? "Not posted." : "Check needed: it may or may not have posted."}</span> {item.publishError}
                </span>
              </p>
            )}
          </div>

          {item.studio ? (
            <section aria-label="Made in Reels" className="flex flex-col items-start gap-3 border-t border-border pt-5">
              <p className="text-sm">Made in Reels. Change its plan, video and caption there.</p>
              {reelsOn ? (
                <Button size="sm" asChild>
                  <Link href={reelHref(item.id, brandId)}>Open in Reels</Link>
                </Button>
              ) : null}
            </section>
          ) : (
            !editing && <NextStep base={base} item={item} perms={perms} onEdit={() => setEditing(true)} />
          )}

          {/* The review first: the check's summary, then the brief, the draft and the approval. */}
          {item.latest?.check && (
            <div className="border-t border-border pt-5">
              <QualityCheck check={item.latest.check} />
            </div>
          )}

          <section aria-labelledby="brief-h" className="border-t border-border pt-5">
            <h2 id="brief-h" className="text-sm font-semibold">Brief</h2>
            {brief.keyMessage ? (
              <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
                {(
                  [
                    ["Goal", brief.goal],
                    ["Audience", brief.audience],
                    ["Message", brief.keyMessage],
                    ["Products", brief.products?.length ? brief.products.join(", ") : "None named (team to choose)"],
                    ["Ask", brief.cta],
                    ["Visual", brief.visual],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                {brief.questions?.length ? (
                  <div className="contents">
                    <dt className="text-muted-foreground">Questions</dt>
                    <dd>
                      <ul className="list-disc pl-4">{brief.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Angle: {brief.angle?.trim().replace(/[.\s]+$/, "") || "-"}. The Brief writer hasn&rsquo;t written the brief yet.</p>
            )}
          </section>

          {item.channel === "INSTAGRAM_STORY" ? (
            <StoryFrames base={base} item={item} />
          ) : (
          <section aria-labelledby="draft-h" className="border-t border-border pt-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="draft-h" className="text-sm font-semibold">
                {editing ? "Edit draft" : `Draft ${item.latest ? `v${item.latest.version}` : ""}`}
                {!editing && item.latest?.byPerson && <span className="ml-2 font-normal text-muted-foreground">edited by a person</span>}
              </h2>
              {!editing && b && canEdit && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden /> Edit
                </Button>
              )}
            </div>
            {editing ? (
              <DraftEditor
                url={`${base}/content/${encodeURIComponent(item.id)}`}
                item={item}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  void reload();
                }}
              />
            ) : !b ? (
              <p className="mt-2 text-sm text-muted-foreground">No draft yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3 text-sm">
                {b.pinTitle && <p className="font-medium">{b.pinTitle}</p>}
                {b.hook && item.channel !== "PINTEREST_PIN" && !b.caption.startsWith(b.hook) && <p className="font-medium">{b.hook}</p>}
                <p className="whitespace-pre-wrap">{b.caption}</p>
                {b.hashtags.length > 0 && <p className="text-muted-foreground">{b.hashtags.join(" ")}</p>}
                {b.slides.length > 0 && (
                  <ol className="grid gap-2 sm:grid-cols-2">
                    {b.slides.map((s, i) => (
                      <li key={i} className="rounded-lg bg-muted px-3 py-2">
                        <span className="text-xs text-muted-foreground">Slide {i + 1}</span>
                        <p>{s}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {b.script.length > 0 && (
                  <ol className="list-decimal pl-5">{b.script.map((s, i) => <li key={i}>{s}</li>)}</ol>
                )}
                {b.altText && <p className="text-xs text-muted-foreground">Alt text: {b.altText}</p>}
                {item.channel === "PINTEREST_PIN" && b.pinLink && <p className="break-all text-xs text-muted-foreground">Link: {b.pinLink}</p>}
              </div>
            )}
          </section>
          )}

          <ReleasePanel className="rounded-none border-0 border-t p-0 pt-5" base={base} id={item.id} status={item.status} version={item.latest?.version ?? null} qualityBlocked={item.latest?.check?.overall === "BLOCKER"} perms={perms} onChanged={reload} pinLink={item.channel === "PINTEREST_PIN" ? item.latest?.body.pinLink : null} />
        </div>
      )}
    </div>
  );
}
