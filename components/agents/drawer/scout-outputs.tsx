"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, ExternalLink, LoaderCircle, MoreHorizontal, Undo2, X } from "lucide-react";
import type { AgentSummary } from "@/components/agents/api";
import { ensureWorkLanguage, isRunCancelled, translateIdeas, type TranslatedIdea } from "@/components/languages/languages";
import { errorMessage, request } from "@/components/settings/api";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { StatusBadge } from "@/components/ui/status-badge";
import { CHANNEL_LABEL, LoadGate, pickPostByIdea, useBrandData, type Opportunity } from "@/components/workspace/content-panels";
import { filterIdeas, ideaCounts, ideaNoun, ideasToPlan, selectable, toShortlist, type IdeaFilter } from "@/components/agents/drawer/drawer-lists";
import { plannerChainBody, STAGE_LABEL, stageState } from "@/lib/agent-workflow";
import { loadPlanCredits, withPrice } from "@/lib/plan-credits";
import { dayTime } from "@/lib/time";
import { safeHttpUrl } from "@/shared";

export type DrawerOutputsProps = { base: string; workspaceId: string; brandId: string; perms: string[]; agent: AgentSummary | null; onOpenPost: (id: string) => void; onRan: () => void };

// Module-level picks: useBrandData restarts its polling when `pick` changes.
const pickIdeas = (d: { opportunities: Opportunity[] }) => d.opportunities;
const pickPlannerBusy = (d: { agents: { key: string; lastRun: { status: string } | null }[] }) => {
  const s = d.agents.find((a) => a.key === "planner")?.lastRun?.status;
  return s === "RUNNING" || s === "QUEUED";
};

const DECISION: Record<Opportunity["decision"], string> = { RECOMMEND: "Recommended", HOLD: "Scout advises hold", REJECT: "Scout advises skip" };
const STATUS: Partial<Record<Opportunity["status"], string>> = { SHORTLISTED: "Shortlisted", DISMISSED: "Dismissed", PLANNED: "Planned" };
const FILTERS: readonly { value: IdeaFilter; label: string }[] = [
  { value: "review", label: "To review" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];
const EMPTY: Record<IdeaFilter, string> = {
  review: "No new ideas to review.",
  shortlisted: "Nothing shortlisted. Shortlist the ideas you like, then plan them into posts.",
  dismissed: "No dismissed ideas.",
  all: "No ideas yet. Run Scout to find what to post about.",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** The agent's last run, apart from the ideas' state. Nothing when the agent isn't known. */
function LastRun({ agent }: { agent: AgentSummary | null }) {
  if (!agent) return null;
  const run = agent.lastRun;
  const at = run?.finishedAt ?? run?.startedAt;
  return (
    <p className="text-xs text-muted-foreground">
      Last run: {STAGE_LABEL[stageState(run)]}
      {at ? ` · ${dayTime(at)}` : run ? "" : " · never run"}
    </p>
  );
}

/** Scout's Overview: what its ideas list holds now (counts over the ideas the server returns), then its last run. */
export function ScoutOverview({ base, agent }: DrawerOutputsProps) {
  const { data, failed, reload } = useBrandData(base, "opportunities", pickIdeas as (d: never) => Opportunity[]);
  const c = useMemo(() => (data ? ideaCounts(data) : null), [data]);
  return (
    <div className="flex flex-col gap-4 p-4">
      <LoadGate ready={!!c} failed={failed} what="ideas" onRetry={() => void reload()} rows={3}>
        {c && (
          <section aria-labelledby="scout-ov-h" className="flex flex-col gap-2">
            <h3 id="scout-ov-h" className="text-sm font-semibold">Ideas now</h3>
            <p className="text-xs text-muted-foreground">Current totals across Scout&rsquo;s latest ideas (up to 100), not one run.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Ideas found" value={c.all} />
              <Stat label="Recommended by Scout" value={c.recommended} />
              <Stat label="To review" value={c.toReview} />
              <Stat label="Shortlisted" value={c.shortlisted} />
              <Stat label="Planned into posts" value={c.planned} />
              <Stat label="Scout advised hold" value={c.advisedHold} />
              <Stat label="Dismissed by you" value={c.dismissed} />
            </div>
            <p className="text-sm">
              {c.shortlisted
                ? `Next: plan the ${c.shortlisted} shortlisted ${ideaNoun(c.shortlisted)} into posts (Outputs).`
                : c.toReview
                  ? `Next: review ${c.toReview} new ${ideaNoun(c.toReview)} and shortlist the ones you like (Outputs).`
                  : "Nothing waiting. Run Scout for new ideas."}
            </p>
          </section>
        )}
      </LoadGate>
      <LastRun agent={agent} />
    </div>
  );
}

/**
 * Reports when the run we started ends; polls the agents list it shares with the drawer.
 * ponytail: reads each agent's latest run only; a newer run of the same agent hides ours, and then nothing is reported.
 */
export function RunWatch({ base, runId, onFailed, onDone }: { base: string; runId: string; onFailed: (why: string) => void; onDone: () => void }) {
  type Run = { id: string; status: string; error?: string | null };
  const pick = useCallback((d: { agents: { lastRun: Run | null }[] }) => d.agents.find((a) => a.lastRun?.id === runId)?.lastRun ?? null, [runId]);
  const run = useBrandData(base, "agents", pick as (d: never) => Run | null).data;
  useEffect(() => {
    if (run?.status === "FAILED") onFailed(run.error || "The agent stopped before finishing. Try again.");
    if (run?.status === "SUCCEEDED") onDone();
  }, [run, onFailed, onDone]);
  return null;
}

/**
 * Scout's Outputs: its ideas to review, with Shortlist / Dismiss / Back to review, a More menu (Translate), and
 * multi-select. "Plan" shortlists the selected ideas, then starts the Planner with the posts chain, which plans every
 * shortlisted idea (its input can't name ideas), so the label counts those too.
 * There is no Hold action: the server's idea statuses are New, Shortlisted and Dismissed (Hold is Scout's advice only).
 */
export function ScoutOutputs({ base, workspaceId, perms, onOpenPost, onRan }: DrawerOutputsProps) {
  const { data, failed, reload } = useBrandData(base, "opportunities", pickIdeas as (d: never) => Opportunity[]);
  const postByIdea = useBrandData(base, "content", pickPostByIdea as (d: never) => Map<string, string>).data;
  const canDecide = perms.includes("content.create");
  const canPlan = perms.includes("agents.run");
  const canRead = perms.includes("agents.read");
  // Selecting only leads to Plan, which needs both shortlisting and running the Planner.
  const canSelect = canDecide && canPlan;
  const plannerBusy = useBrandData(base, "agents", pickPlannerBusy as (d: never) => boolean, canRead).data === true;
  const planPrice = useRunPrice(workspaceId, "planner");
  const [filter, setFilter] = useState<IdeaFilter>("review");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planning, setPlanning] = useState<string | null>(null);
  const [planned, setPlanned] = useState(false);
  const [translations, setTranslations] = useState<Map<string, TranslatedIdea>>(new Map());
  const [shownTranslated, setShownTranslated] = useState<Set<string>>(new Set());
  const [translating, setTranslating] = useState<string | null>(null);

  // A picked idea that was planned or dismissed since (another tab, a run) drops out of the selection.
  const selected = useMemo(() => new Set((data ?? []).filter((o) => selectable(o) && picked.has(o.id)).map((o) => o.id)), [data, picked]);
  const counts = useMemo(() => (data ? ideaCounts(data) : null), [data]);
  const toPlan = data ? ideasToPlan(data, selected) : 0;

  const planFailed = useCallback((why: string) => {
    setPlanning(null);
    setError(why);
  }, []);
  const planDone = useCallback(() => {
    setPlanning(null);
    setPlanned(true);
    void reload();
  }, [reload]);

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function set(id: string, status: "NEW" | "SHORTLISTED" | "DISMISSED") {
    setError(null);
    setPlanned(false);
    setDeciding(`${id}:${status}`);
    try {
      await request(`${base}/opportunities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await reload();
    } catch {
      setError("Couldn't update that idea. Your role may not allow it.");
    } finally {
      setDeciding(null);
    }
  }

  async function plan() {
    if (!data) return;
    setError(null);
    setPlanned(false);
    setPlanBusy(true);
    try {
      // Shortlist the picked ideas first; if any fails, don't start: the Planner would plan a different set.
      const ids = toShortlist(data, selected);
      const results = await Promise.allSettled(
        ids.map((id) => request(`${base}/opportunities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: "SHORTLISTED" }) })),
      );
      await reload();
      const bad = results.filter((r) => r.status === "rejected").length;
      if (bad) {
        setError(`Couldn't shortlist ${bad} of the selected ${ideaNoun(ids.length)}, so the Planner wasn't started. Try again.`);
        return;
      }
      await ensureWorkLanguage(base);
      const { run } = await request<{ run: { id: string } }>(`${base}/agents/planner/runs`, { method: "POST", body: plannerChainBody() });
      setPicked(new Set());
      setPlanning(run.id);
      if (workspaceId) void loadPlanCredits(workspaceId, true);
      onRan();
    } catch (e) {
      if (!isRunCancelled(e)) setError(errorMessage(e, "Couldn't start the Planner. Try again."));
    } finally {
      setPlanBusy(false);
    }
  }

  async function translate(id: string) {
    setError(null);
    setTranslating(id);
    try {
      const m = await translateIdeas(base, [id]);
      setTranslations((t) => new Map([...t, ...m]));
      setShownTranslated((s) => new Set(s).add(id));
    } catch (e) {
      setError(errorMessage(e, "Couldn't translate the idea. Try again."));
    } finally {
      setTranslating(null);
    }
  }

  const shown = data ? filterIdeas(data, filter) : [];
  const working = planBusy || !!planning || plannerBusy;
  const showBar = canPlan && (selected.size > 0 || toPlan > 0 || working);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-3 p-4 pb-2">
        <SegmentedRadios label="Show ideas" name="scout-drawer-filter" size="sm" value={filter} onChange={setFilter} options={FILTERS} />
        {counts && (
          <p className="text-xs text-muted-foreground">
            {counts.toReview} to review · {counts.shortlisted} shortlisted · {counts.dismissed} dismissed · {counts.all} in all (Scout&rsquo;s latest ideas)
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {planned && (
          <p role="status" className="text-sm">
            Posts planned. The Brief writer, Creator and Quality now prepare each one for approval.{" "}
            <button type="button" className="text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setPlanned(false)}>
              Dismiss
            </button>
          </p>
        )}
        {planning && <RunWatch base={base} runId={planning} onFailed={planFailed} onDone={planDone} />}
      </div>
      <div className="flex-1">
        <LoadGate ready={!!data} failed={failed} what="ideas" onRetry={() => void reload()} rows={3} className="px-4">
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{EMPTY[filter]}</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {shown.map((o) => {
                const t = shownTranslated.has(o.id) ? translations.get(o.id) : undefined;
                const title = t?.title ?? o.title;
                const sources = o.sources.flatMap((s) => {
                  const u = safeHttpUrl(s.url);
                  return u ? [{ ...s, u }] : [];
                });
                const postId = o.status === "PLANNED" ? postByIdea?.get(o.id) : undefined;
                const busy = (s: string) => deciding === `${o.id}:${s}`;
                return (
                  <li key={o.id} className="flex gap-3 px-4 py-3">
                    {canSelect && selectable(o) ? (
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                        aria-label={`Select ${title}`}
                        className="mt-1 size-4 shrink-0 accent-primary"
                      />
                    ) : canSelect ? (
                      <span aria-hidden className="w-4 shrink-0" />
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <StatusBadge status={o.decision}>{DECISION[o.decision]}</StatusBadge>
                        {STATUS[o.status] && <StatusBadge quiet status={o.status === "DISMISSED" ? "REJECTED" : o.status === "PLANNED" ? "APPROVED" : "AWAITING_APPROVAL"}>{STATUS[o.status]}</StatusBadge>}
                        {o.timing && <span className="text-muted-foreground">{o.timing}</span>}
                      </div>
                      <p className="break-words text-sm font-medium">{title}</p>
                      <p className="line-clamp-2 break-words text-sm text-muted-foreground">{t?.summary ?? o.summary}</p>
                      {o.channels.length > 0 && (
                        <ul aria-label="Platforms" className="flex flex-wrap gap-1">
                          {o.channels.map((c) => (
                            <li key={c} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                              {CHANNEL_LABEL[c] ?? c}
                            </li>
                          ))}
                        </ul>
                      )}
                      {t && <p className="text-xs text-muted-foreground">Machine translation</p>}
                      <details className="group text-xs">
                        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded py-0.5 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                          <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                          Why
                        </summary>
                        <div className="flex flex-col gap-1.5 pl-4 pt-1 text-muted-foreground">
                          <p className="break-words">{t?.reason ?? o.reason}</p>
                          {o.angle && (
                            <p className="break-words">
                              <span className="font-medium text-foreground">Angle: </span>
                              {o.angle}
                            </p>
                          )}
                          {sources.length > 0 && (
                            <ul className="flex flex-col gap-0.5">
                              {sources.slice(0, 5).map((s) => (
                                <li key={s.u.href} className="min-w-0">
                                  <a href={s.u.href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 underline-offset-2 hover:text-foreground hover:underline">
                                    <span className="truncate">{s.title || s.u.hostname}</span>
                                    <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </details>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {o.status === "PLANNED" ? (
                          postId ? (
                            <Button size="sm" onClick={() => onOpenPost(postId)}>Open post</Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Planned: its posts are on the calendar.</span>
                          )
                        ) : canDecide && o.status === "NEW" ? (
                          <>
                            <Button size="sm" onClick={() => void set(o.id, "SHORTLISTED")} disabled={!!deciding}>
                              {busy("SHORTLISTED") ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Check aria-hidden />}
                              {busy("SHORTLISTED") ? "Shortlisting…" : "Shortlist"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void set(o.id, "DISMISSED")} disabled={!!deciding}>
                              {busy("DISMISSED") ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <X aria-hidden />}
                              {busy("DISMISSED") ? "Dismissing…" : "Dismiss"}
                            </Button>
                          </>
                        ) : canDecide ? (
                          <Button size="sm" variant={o.status === "SHORTLISTED" ? "secondary" : "ghost"} onClick={() => void set(o.id, "NEW")} disabled={!!deciding}>
                            <Undo2 aria-hidden /> {busy("NEW") ? "Moving…" : "Back to review"}
                          </Button>
                        ) : null}
                        {/* Translate is an AI call behind agents.read: a client reviewer doesn't get it. */}
                        {canRead && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" aria-label={`More for ${title}`} disabled={translating === o.id}>
                                {translating === o.id ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <MoreHorizontal aria-hidden />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {t ? (
                                <DropdownMenuItem onSelect={() => setShownTranslated((s) => { const n = new Set(s); n.delete(o.id); return n; })}>Show original</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => void translate(o.id)}>Translate</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </LoadGate>
      </div>
      {showBar && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
          <span className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            {selected.size > 0 ? `${selected.size} selected` : `${toPlan} shortlisted`}
            {selected.size > 0 && (
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            )}
          </span>
          <Button size="sm" onClick={() => void plan()} disabled={working || toPlan === 0}>
            {working && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}
            {working ? "Planning posts…" : withPrice(`Plan ${toPlan} ${selected.size > 0 && toPlan > selected.size ? "shortlisted and selected " : selected.size > 0 ? "selected " : ""}${ideaNoun(toPlan)}`, planPrice)}
          </Button>
        </div>
      )}
    </div>
  );
}
