"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink, LoaderCircle, Pencil, Sparkles, TriangleAlert, X } from "lucide-react";
import { errorMessage, request } from "@/components/settings/api";
import { ListSkeleton } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { DraftEditor } from "@/components/workspace/draft-editor";
import { ReleasePanel } from "@/components/workspace/release-panel";
import { dayTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { safeHttpUrl } from "@espanda/shared";

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
type Check = { check: string; status: "pass" | "warn" | "blocker"; note: string };
export type ContentItem = {
  id: string;
  title: string;
  channel: string;
  status: string;
  scheduledFor: string | null;
  pillar: string | null;
  brief: Record<string, unknown> | null;
  opportunity: { title: string } | null;
  /** The last publish went wrong: FAILED = not posted (reason in publishError), CHECK = may have posted. */
  publishIssue: "FAILED" | "CHECK" | null;
  publishError: string | null;
  /** Stories: planned to be posted by hand at `scheduledFor`, and the first rendered frame (signed link). */
  byHand?: boolean;
  firstFrameUrl?: string | null;
  latest: {
    version: number;
    body: { hook: string; caption: string; hashtags: string[]; slides: string[]; script: string[]; pinTitle: string; altText: string };
    byPerson: boolean;
    check: { overall: "PASS" | "WARN" | "BLOCKER"; results: Check[] } | null;
    review: { verdict: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; note: string | null } | null;
  } | null;
};

const POLL_MS = 6000;

// Last response per URL, shared by every panel on the page: a post opened from the calendar shows at once,
// and a fresh response (e.g. after an edit) updates every panel showing that URL, not just the one that asked.
const lastResponse = new Map<string, unknown>();
const listeners = new Map<string, Set<(d: unknown) => void>>();
const fetchedAt = new Map<string, number>();

/** Poll a brand API path; `reload` refetches now. Starts from the last response any panel got. */
export function useBrandData<T>(base: string, path: string, pick: (d: never) => T) {
  const url = `${base}/${path}`;
  const [data, setData] = useState<T | null>(() => (lastResponse.has(url) ? pick(lastResponse.get(url) as never) : null));
  const [failed, setFailed] = useState(false);
  const load = useCallback(
    () =>
      request<never>(url).then(
        (d) => {
          fetchedAt.set(url, Date.now());
          lastResponse.set(url, d);
          listeners.get(url)?.forEach((fn) => fn(d));
        },
        () => setFailed(true),
      ),
    [url],
  );
  useEffect(() => {
    const fn = (d: unknown) => {
      setData(pick(d as never));
      setFailed(false);
    };
    const set = listeners.get(url) ?? new Set();
    listeners.set(url, set.add(fn));
    return () => void set.delete(fn);
  }, [url, pick]);
  useEffect(() => {
    void load();
    // Pause while the tab is hidden; catch up as soon as it's visible again.
    // Several panels watch the same URL; one fetch per interval feeds them all.
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - (fetchedAt.get(url) ?? 0) > POLL_MS / 2) void load();
    }, POLL_MS);
    const onShow = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [load, url]);
  return { data, failed, reload: load };
}

/** The signed-in person's permissions on this brand; [] if they couldn't be loaded. */
export function usePerms(base: string) {
  const [perms, setPerms] = useState<string[] | null>(null);
  useEffect(() => {
    request<{ permissions: string[] }>(`${base.split("/brands/")[0]}/my-permissions?brandId=${base.split("/brands/")[1]}`).then((p) => setPerms(p.permissions), () => setPerms([]));
  }, [base]);
  return perms;
}

/** A load failed with nothing to show. No padding of its own: callers place it. `message` replaces the default line. */
export function LoadFailed({ what, onRetry, message, className }: { what: string; onRetry: () => void; message?: string; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm text-muted-foreground", className)}>
      {message ?? <>Couldn&rsquo;t load {what}. Try again.</>}
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

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

export const CHANNEL_LABEL: Record<string, string> = {
  INSTAGRAM_POST: "Instagram post",
  INSTAGRAM_CAROUSEL: "Instagram carousel",
  INSTAGRAM_REEL: "Instagram Reel",
  INSTAGRAM_STORY: "Instagram story",
  FACEBOOK_POST: "Facebook",
  PINTEREST_PIN: "Pinterest",
  THREADS_POST: "Threads",
};
export const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  BRIEF_READY: "Brief ready",
  DRAFT_REVIEW: "Draft in review",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  REVIEWED: "Reviewed",
  REJECTED: "Rejected",
  BLOCKED: "Blocked",
};
const STATUS_TONE: Record<string, string> = {
  AWAITING_APPROVAL: "bg-primary/15 text-primary",
  APPROVED: "bg-success/15 text-success",
  PUBLISHED: "bg-success/15 text-success",
  BLOCKED: "bg-destructive/15 text-destructive",
  REJECTED: "bg-destructive/15 text-destructive",
  SCHEDULED: "bg-primary/15 text-primary",
};
const PUBLISH_ISSUE = {
  FAILED: { label: "Not posted", tone: "bg-destructive/15 text-destructive" },
  CHECK: { label: "Check needed", tone: "bg-warning/15 text-warning" },
};
const DECISION: Record<Opportunity["decision"], { label: string; tone: string }> = {
  RECOMMEND: { label: "Recommend", tone: "bg-success/15 text-success" },
  HOLD: { label: "Hold", tone: "bg-warning/15 text-warning" },
  REJECT: { label: "Reject", tone: "bg-muted text-muted-foreground" },
};
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/* ───────────── Ideas panel ───────────── */

export function IdeasPanel({ base, onRunScout, onOpenPosts }: { base: string; onRunScout: () => void; onOpenPosts?: () => void }) {
  const pick = useCallback((d: { opportunities: Opportunity[] }) => d.opportunities, []);
  const { data, failed, reload } = useBrandData(base, "opportunities", pick as (d: never) => Opportunity[]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [error, setError] = useState<string | null>(null);
  const perms = usePerms(base);
  const canDecide = perms?.includes("content.create");
  const [planning, setPlanning] = useState<string | null>(null);
  const [planned, setPlanned] = useState(false);
  // The idea being updated and the status it is moving to, so its button can say so.
  const [deciding, setDeciding] = useState<{ id: string; status: Opportunity["status"] } | null>(null);
  // The Planner may already be running (started here before a reload, or from another panel): read it from the agents list.
  const pickPlanner = useCallback((d: { agents: { key: string; lastRun: { status: string } | null }[] }) => {
    const s = d.agents.find((a) => a.key === "planner")?.lastRun?.status;
    return s === "RUNNING" || s === "QUEUED";
  }, []);
  const plannerRunning = useBrandData(base, "agents", pickPlanner as (d: never) => boolean).data === true;
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
      const { run } = await request<{ run: { id: string } }>(`${base}/agents/planner/runs`, { method: "POST", body: "{}" });
      setPlanning(run.id);
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the Planner. Try again."));
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

  if (!data) return failed ? <LoadFailed what="ideas" onRetry={reload} className="p-4" /> : <p className="p-4 text-sm text-muted-foreground">Loading ideas…</p>;
  const shown = data.filter((o) => (filter === "all" ? true : o.status === "NEW" || o.status === "SHORTLISTED"));
  const shortlisted = data.filter((o) => o.status === "SHORTLISTED").length;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
        <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {shortlisted} shortlisted
          {shortlisted > 0 && perms?.includes("agents.run") ? (
            <Button size="sm" onClick={() => void plan()} disabled={!!planning || plannerRunning}>
              {planning || plannerRunning ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
              {planning || plannerRunning ? "Planning posts…" : `Plan posts from ${shortlisted === 1 ? "this idea" : `these ${shortlisted} ideas`}`}
            </Button>
          ) : (
            <span>· shortlist the ideas you like, then plan them into posts</span>
          )}
          {planning && <RunWatch base={base} runId={planning} onFailed={planFailed} onDone={planDone} />}
        </span>
        <div role="tablist" aria-label="Filter ideas" className="flex rounded-md bg-muted p-0.5">
          {(["open", "all"] as const).map((f) => (
            <button key={f} role="tab" type="button" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("rounded px-2 py-1", filter === f ? "bg-background text-foreground" : "text-muted-foreground")}>
              {f === "open" ? "To decide" : "All"}
            </button>
          ))}
        </div>
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
          {perms?.includes("agents.run") && (
            <Button size="sm" variant="secondary" onClick={onRunScout}>
              Find ideas
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((o) => (
            <li key={o.id} className={cn("flex flex-col gap-2 px-4 py-3.5", o.status === "DISMISSED" && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={cn("rounded-full px-2 py-0.5 font-medium", DECISION[o.decision].tone)}>{DECISION[o.decision].label}</span>
                {o.timing && <span className="text-muted-foreground">{o.timing}</span>}
                {o.status !== "NEW" && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{o.status === "SHORTLISTED" ? "Shortlisted" : o.status === "PLANNED" ? "Planned" : "Dismissed"}</span>}
              </div>
              <p className="text-sm font-medium">{o.title}</p>
              <p className="text-sm text-muted-foreground">{o.summary}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Why: </span>
                {o.reason}
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
              {o.status !== "PLANNED" && canDecide && (
                <div className="flex gap-2 pt-1">
                  {o.status === "SHORTLISTED" ? (
                    <Button size="sm" variant="secondary" onClick={() => set(o.id, "NEW")} disabled={!!deciding}>
                      {deciding?.id === o.id ? "Removing…" : "Remove from shortlist"}
                    </Button>
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

export function ContentPanel({ base, onOpen, onRunPlanner }: { base: string; onOpen: (id: string) => void; onRunPlanner: () => void }) {
  const pick = useCallback((d: { items: ContentItem[] }) => d.items, []);
  const { data, failed, reload } = useBrandData(base, "content", pick as (d: never) => ContentItem[]);
  if (!data) return failed ? <LoadFailed what="the calendar" onRetry={reload} className="p-4" /> : <p className="p-4 text-sm text-muted-foreground">Loading calendar…</p>;
  if (!data.length) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-muted-foreground">Nothing planned yet. Shortlist ideas, then run the Planner to fill your calendar.</p>
        <Button size="sm" variant="secondary" onClick={onRunPlanner}>
          Plan posts
        </Button>
      </div>
    );
  }
  const groups = new Map<string, ContentItem[]>();
  for (const i of data) {
    // Group by the viewer's local date ("en-CA" is YYYY-MM-DD), not the UTC one.
    const k = i.scheduledFor ? new Date(i.scheduledFor).toLocaleDateString("en-CA") : "unscheduled";
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return (
    <ol className="flex flex-col">
      {[...groups].map(([k, list]) => (
        <li key={k}>
          <p className="sticky top-0 z-[1] bg-background/95 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">{k === "unscheduled" ? "No date" : day(list[0].scheduledFor!)}</p>
          <ul className="divide-y divide-border">
            {list.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onOpen(i.id)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  {i.channel === "INSTAGRAM_STORY" && (
                    // eslint-disable-next-line @next/next/no-img-element -- a signed storage link
                    i.firstFrameUrl ? <img src={i.firstFrameUrl} alt="" className="aspect-[9/16] w-9 shrink-0 rounded bg-muted object-cover" /> : <span aria-hidden className="aspect-[9/16] w-9 shrink-0 rounded bg-muted" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground">{CHANNEL_LABEL[i.channel] ?? i.channel}</span>
                    {i.publishIssue ? (
                      <span className={cn("rounded-full px-2 py-0.5 font-medium", PUBLISH_ISSUE[i.publishIssue].tone)}>{PUBLISH_ISSUE[i.publishIssue].label}</span>
                    ) : (
                      <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_TONE[i.status] ?? "bg-muted text-muted-foreground")}>
                        {i.latest?.check?.overall === "BLOCKER" && i.status === "DRAFT_REVIEW" ? "Needs fixes" : (STATUS_LABEL[i.status] ?? i.status)}
                      </span>
                    )}
                  </span>
                  <span className="text-sm">{i.title}</span>
                  {i.byHand && i.scheduledFor && <span className="text-[11px] font-medium text-primary">Post by hand &middot; {dayTime(i.scheduledFor)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
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

function NextStep({ base, item, perms, onEdit }: { base: string; item: ContentItem; perms: string[] | null; onEdit: () => void }) {
  const step = nextStep(item);
  // The agent we started, until the post moves on (status, version or check changes).
  const at = `${item.status}:${item.latest?.version ?? 0}:${item.latest?.check ? 1 : 0}`;
  const [started, setStarted] = useState<{ key: string; runId: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The run finished and the post may look the same: say so, until the post changes or another run starts.
  const [ranOut, setRanOut] = useState(false);
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
  const canRun = perms?.includes("agents.run");
  const story = item.channel === "INSTAGRAM_STORY";
  const canEdit = perms?.includes("content.create") && !story;

  async function run(key: string) {
    setPending(true);
    setError(null);
    setRanOut(false);
    try {
      const { run } = await request<{ run: { id: string } }>(`${base}/agents/${encodeURIComponent(key)}/runs`, { method: "POST", body: "{}" });
      setStarted({ key, runId: run.id });
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the agent. Try again."));
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
              <Sparkles aria-hidden /> {pending ? "Starting…" : step.agent.label}
            </Button>
          )}
          {step.edit && canEdit && (
            <Button size="sm" variant={step.agent && canRun ? "outline" : "default"} onClick={onEdit}>
              <Pencil aria-hidden /> {step.edit}
            </Button>
          )}
          {story && step.edit && <p className="text-sm text-muted-foreground">Edit it on the phone.</p>}
          {perms && !(step.agent && canRun) && !(step.edit && canEdit) && !(story && step.edit) && (
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

/** A story's rendered frames, read-only: 9:16 thumbnails (click for full size), clips play in place. Stories are edited on the phone. */
function StoryFrames({ base, item }: { base: string; item: ContentItem }) {
  // Fetched when the version changes and polled only while rendering: each response signs new links, so polling always would reload every picture.
  const [data, setData] = useState<StoryView | null>(null);
  const [failed, setFailed] = useState(false);
  const url = `${base}/content/${encodeURIComponent(item.id)}`;
  const version = item.latest?.version;
  const reload = useCallback(
    () =>
      request<Partial<StoryView>>(url).then(
        (d) => {
          setData({ rendering: d.rendering ?? false, renderError: d.renderError ?? null, frames: d.frames ?? [] });
          setFailed(false);
        },
        () => setFailed(true),
      ),
    [url],
  );
  useEffect(() => void reload(), [reload, version]);
  const rendering = data?.rendering;
  useEffect(() => {
    if (!rendering) return;
    const t = setInterval(() => void reload(), 3000);
    return () => clearInterval(t);
  }, [rendering, reload]);
  const [zoom, setZoom] = useState<StoryFrameView | null>(null);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);
  const body = item.latest?.body as unknown as { frames?: { label?: string; headline?: string; body?: string }[]; cta?: string; link?: string } | undefined;
  const link = body?.link ? safeHttpUrl(body.link) : null;
  return (
    <section aria-label="Story frames" className="rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold">
        Story {item.latest ? `v${item.latest.version}` : ""}
        {item.latest?.byPerson && <span className="ml-2 font-normal text-muted-foreground">edited by a person</span>}
      </h2>
      {!data ? (
        failed ? <LoadFailed what="the frames" onRetry={reload} className="mt-2" /> : <p className="mt-2 text-sm text-muted-foreground">Loading frames…</p>
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
      {zoom?.url && (
        <div role="dialog" aria-modal="true" aria-label={`Frame ${zoom.n}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          <div className="relative max-h-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
            <img src={zoom.url} alt={`Frame ${zoom.n} full size`} className="max-h-[90vh] w-auto rounded-lg" />
            <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => setZoom(null)} autoFocus>
              <X aria-hidden /> Close
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ContentView({ base, id, onBack }: { base: string; id: string; onBack: () => void }) {
  const pick = useCallback((d: { items: ContentItem[] }) => d.items, []);
  const { data, failed, reload } = useBrandData(base, "content", pick as (d: never) => ContentItem[]);
  const item = data?.find((i) => i.id === id);
  const [editing, setEditing] = useState(false);
  const perms = usePerms(base);
  useEffect(() => setEditing(false), [id]);
  const locked = item?.status === "SCHEDULED" || item?.status === "PUBLISHED" || item?.status === "REVIEWED";
  const canEdit = perms?.includes("content.create") && !locked;
  const brief = (item?.brief ?? {}) as { goal?: string; audience?: string; keyMessage?: string; products?: string[]; cta?: string; visual?: string; questions?: string[]; angle?: string };
  const b = item?.latest?.body;

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Workspace
        </Button>
        <span className="truncate text-sm text-muted-foreground">/ {item?.title ?? "Post"}</span>
      </div>
      {!item ? (
        data ? (
          <p className="p-6 text-sm text-muted-foreground">This post no longer exists.</p>
        ) : failed ? (
          <LoadFailed what="this post" onRetry={reload} className="p-6" />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        )
      ) : (
        <div className="flex flex-col gap-6 px-6 py-6">
          <div>
            <p className="text-xs text-muted-foreground">
              {CHANNEL_LABEL[item.channel]} · {item.scheduledFor ? day(item.scheduledFor) : "no date"} · {STATUS_LABEL[item.status] ?? item.status}
              {item.latest ? ` · draft v${item.latest.version}` : ""}
            </p>
            <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">{item.title}</h1>
            {item.opportunity && <p className="mt-1 text-sm text-muted-foreground">From the idea: {item.opportunity.title}</p>}
            {item.publishIssue && (
              <p role="status" className={cn("mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm", PUBLISH_ISSUE[item.publishIssue].tone)}>
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium">{item.publishIssue === "FAILED" ? "Not posted." : "Check needed: it may or may not have posted."}</span> {item.publishError}
                </span>
              </p>
            )}
          </div>

          <section aria-labelledby="brief-h" className="rounded-xl border border-border p-4">
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

          {!editing && <NextStep base={base} item={item} perms={perms} onEdit={() => setEditing(true)} />}

          {item.channel === "INSTAGRAM_STORY" ? (
            <StoryFrames base={base} item={item} />
          ) : (
          <section aria-labelledby="draft-h" className="rounded-xl border border-border p-4">
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
              </div>
            )}
          </section>
          )}

          {item.latest?.check && (
            <section aria-labelledby="qc-h" className="rounded-xl border border-border p-4">
              <h2 id="qc-h" className="text-sm font-semibold">
                Quality check · {item.latest.check.overall === "PASS" ? "passed" : item.latest.check.overall === "WARN" ? "passed with notes" : "needs fixes"}
              </h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {item.latest.check.results.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    {r.status === "pass" ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Pass" />
                    ) : (
                      <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", r.status === "blocker" ? "text-destructive" : "text-warning")} aria-label={r.status === "blocker" ? "Blocker" : "Warning"} />
                    )}
                    <span>
                      <span className="font-medium">{r.check}: </span>
                      <span className="text-muted-foreground">{r.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ReleasePanel base={base} id={item.id} status={item.status} version={item.latest?.version ?? null} qualityBlocked={item.latest?.check?.overall === "BLOCKER"} perms={perms} onChanged={reload} />
        </div>
      )}
    </div>
  );
}
