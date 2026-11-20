"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { ServiceUnavailable } from "@/components/agents/service-unavailable";
import {
  fetchContextDocs,
  ProblemError,
  startResearch,
  type ContextDocEntry,
  type ContextDocKind,
  type ContextDocsResponse,
} from "@/components/context/api";
import { DocPane } from "@/components/context/doc-pane";
import { docState, DocStateBadge } from "@/components/context/doc-state";
import { okToDiscard } from "@/components/context/unsaved";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { loadPlanCredits, withPrice } from "@/lib/plan-credits";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { isRunCancelled } from "@/components/languages/languages";

// Poll only while research is in flight; one manager per brand makes 3s cheap.
const RESEARCH_POLL_MS = 3000;
// No docs could be loaded: try again on this interval (the banner says it retries automatically).
const RETRY_MS = 15_000;

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: ContextDocsResponse }
  | { kind: "forbidden" }
  | { kind: "error" };

const RESEARCH_LABEL = {
  QUEUED: "Research queued",
  RUNNING: "Research agent is reading your site",
  SUCCEEDED: "Research finished",
  FAILED: "Research failed",
} as const;

/** `perms`: the person's permissions on this brand, from the shell. */
type Props = { workspaceId: string; brandId: string; perms: string[] };

export function ContextBoard({ workspaceId, brandId, perms }: Props) {
  // Hide what this role can't do (the server refuses it anyway).
  const can = (p: string) => perms.includes(p);
  const researchPrice = useRunPrice(workspaceId, "research");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<ContextDocKind>(
    "product-information",
  );
  const [rerun, setRerun] = useState<{
    pending: boolean;
    error: string | null;
  }>({
    pending: false,
    error: null,
  });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await fetchContextDocs(workspaceId, brandId, signal);
        setState({ kind: "ready", data });
      } catch (err) {
        if (signal?.aborted) return;
        // A 403 is the role, not an outage: no retry banner, no polling.
        if (err instanceof ProblemError && err.status === 403) {
          setState({ kind: "forbidden" });
          return;
        }
        console.error("[context] failed to load docs", err);
        // Keep showing stale data if a background poll fails.
        setState((prev) => (prev.kind === "ready" ? prev : { kind: "error" }));
      }
    },
    [workspaceId, brandId],
  );

  const researchStatus =
    state.kind === "ready" ? state.data.research?.status : undefined;
  const researchActive =
    researchStatus === "QUEUED" || researchStatus === "RUNNING";

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // One load at a time from the poll and Retry now: a tick is skipped while one is still running.
  const inFlight = useRef(false);
  const loadOnce = useCallback(
    async (signal?: AbortSignal) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await load(signal);
      } finally {
        inFlight.current = false;
      }
    },
    [load],
  );

  // Poll while research runs, and keep retrying while the docs couldn't be loaded at all.
  const pollMs = researchActive ? RESEARCH_POLL_MS : state.kind === "error" ? RETRY_MS : null;
  useEffect(() => {
    if (!pollMs) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await loadOnce(controller.signal);
      if (!controller.signal.aborted)
        timer = setTimeout(tick, pollMs);
    };
    timer = setTimeout(tick, pollMs);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [pollMs, loadOnce]);

  async function onRerun() {
    setRerun({ pending: true, error: null });
    try {
      const { run } = await startResearch(workspaceId, brandId);
      setState((prev) =>
        prev.kind === "ready"
          ? {
              kind: "ready",
              data: {
                ...prev.data,
                research: { runId: run.id, status: run.status },
              },
            }
          : prev,
      );
      setRerun({ pending: false, error: null });
      void loadPlanCredits(workspaceId, true);
    } catch (err) {
      setRerun({
        pending: false,
        error: isRunCancelled(err)
          ? null
          : err instanceof ProblemError && err.status === 403
            ? "You do not have permission to run research for this brand."
            : err instanceof ProblemError
              ? err.message
              : "Could not start research.",
      });
    }
  }

  function onDocChanged(entry: ContextDocEntry) {
    setState((prev) =>
      prev.kind === "ready"
        ? {
            kind: "ready",
            data: {
              ...prev.data,
              docs: prev.data.docs.map((d) =>
                d.kind === entry.kind ? entry : d,
              ),
            },
          }
        : prev,
    );
  }

  const docs = state.kind === "ready" ? state.data.docs : [];
  const confirmedCount = docs.filter((d) => d.confirmed).length;
  const current = docs.find((d) => d.kind === selected) ?? docs[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader eyebrow="Strategy documents" title="Brand context">
        Agents work from the latest version of each document. Fix anything
        Research got wrong; agents use your edit on their next run.
      </PageHeader>

      {state.kind === "loading" ? (
        // The loaded layout's shape in grey: the status row, five document rows, the document.
        <div role="status" aria-busy="true" className="flex flex-col gap-5">
          <span className="sr-only">Loading brand context</span>
          <div className="h-12 rounded-2xl bg-border motion-safe:animate-pulse" />
          <div className="grid gap-5 md:grid-cols-[15rem_1fr]">
            <div className="hidden flex-col gap-1 md:flex">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="h-3.5 w-28 rounded bg-border motion-safe:animate-pulse" />
                  <div className="h-4 w-12 rounded-full bg-border motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
              <div className="h-6 w-48 rounded bg-border motion-safe:animate-pulse" />
              <div className="h-3 w-64 rounded bg-border motion-safe:animate-pulse" />
              {[100, 92, 96, 70, 100, 88, 60].map((w, i) => (
                <div key={i} className="mt-2 h-3 rounded bg-border motion-safe:animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        </div>
      ) : state.kind === "forbidden" ? (
        <p role="status" className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Your role doesn&rsquo;t include the business context.
        </p>
      ) : state.kind === "error" ? (
        <ServiceUnavailable onRetry={() => void loadOnce()} />
      ) : (
        <>
          {/* One row: where Research is, how much is reviewed, and the next step. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="flex items-center gap-2" aria-live="polite">
                {researchActive ? (
                  <Loader2
                    className="size-4 animate-spin text-primary motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      researchStatus === "FAILED"
                        ? "bg-destructive"
                        : researchStatus === "SUCCEEDED"
                          ? "bg-success"
                          : "bg-muted-foreground",
                    )}
                  />
                )}
                {researchStatus
                  ? RESEARCH_LABEL[researchStatus]
                  : "Research has not run yet"}
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="text-foreground">{confirmedCount}</span> of{" "}
                {docs.length || 5} reviewed
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {can("agents.run") ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onRerun()}
                disabled={rerun.pending || researchActive}
              >
                <RefreshCw
                  className={cn(
                    rerun.pending && "animate-spin motion-reduce:animate-none",
                  )}
                />
                {withPrice("Re-run research", researchPrice)}
              </Button>
              ) : null}
              {researchStatus === "SUCCEEDED" ? (
                <Button asChild size="sm">
                  <Link href="/">
                    Get post ideas <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>
            {rerun.error ? (
              <span role="alert" className="w-full text-right text-xs text-destructive">
                {rerun.error}
              </span>
            ) : null}
          </div>

          <div className="grid gap-5 md:grid-cols-[15rem_1fr]">
            {/* Mobile: compact select */}
            <label className="flex flex-col gap-1.5 text-sm md:hidden">
              <span className="text-xs text-muted-foreground">Document</span>
              <select
                value={current?.kind}
                onChange={(e) => okToDiscard() && setSelected(e.target.value as ContextDocKind)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {docs.map((d) => (
                  <option key={d.kind} value={d.kind}>
                    {d.title} ({docState(d).label})
                  </option>
                ))}
              </select>
            </label>

            {/* Desktop: list */}
            <nav aria-label="Context documents" className="hidden md:block">
              <ul className="flex flex-col gap-1">
                {docs.map((d) => {
                  const active = d.kind === current?.kind;
                  return (
                    <li key={d.kind}>
                      <button
                        type="button"
                        onClick={() => d.kind !== current?.kind && okToDiscard() && setSelected(d.kind)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-primary/50 bg-primary/10"
                            : "border-transparent hover:border-border hover:bg-card",
                        )}
                      >
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {d.title}
                        </span>
                        <DocStateBadge entry={d} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {current ? (
              <DocPane
                key={current.kind}
                entry={current}
                workspaceId={workspaceId}
                brandId={brandId}
                researchActive={researchActive}
                canEdit={can("context.edit")}
                canConfirm={can("context.confirm")}
                onChanged={onDocChanged}
                onStale={() => void load()}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
