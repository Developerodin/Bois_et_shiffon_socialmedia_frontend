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
import { usePerms } from "@/components/workspace/content-panels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Poll only while research is in flight; one manager per brand makes 3s cheap.
const RESEARCH_POLL_MS = 3000;
// No docs could be loaded: try again on this interval (the banner says it retries automatically).
const RETRY_MS = 15_000;

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: ContextDocsResponse }
  | { kind: "error" };

const RESEARCH_LABEL = {
  QUEUED: "Research queued",
  RUNNING: "Research agent is reading your site",
  SUCCEEDED: "Research finished",
  FAILED: "Research failed",
} as const;

type Props = { workspaceId: string; brandId: string };

export function ContextBoard({ workspaceId, brandId }: Props) {
  // Hide what this role can't do (the server refuses it anyway); null while loading counts as no.
  const perms = usePerms(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`);
  const can = (p: string) => !!perms?.includes(p);
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
    } catch (err) {
      setRerun({
        pending: false,
        error:
          err instanceof ProblemError && err.status === 403
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
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <section
        aria-labelledby="context-heading"
        className="flex flex-col gap-2"
      >
        <p className="text-xs text-primary">
          Strategy documents
        </p>
        <h1
          id="context-heading"
          className="font-display text-3xl font-medium tracking-tight sm:text-4xl"
        >
          Brand context
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground text-pretty sm:text-base">
          Agents use the latest version of each document as soon as Research
          writes it. Fix anything it got wrong and agents pick up your edit on
          their next run.
        </p>
      </section>

      {state.kind === "loading" ? (
        <div className="grid gap-4 md:grid-cols-[16rem_1fr]" aria-busy="true">
          <div className="h-72 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none" />
          <div className="h-96 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none" />
          <span className="sr-only">Loading brand context</span>
        </div>
      ) : state.kind === "error" ? (
        <ServiceUnavailable onRetry={() => void loadOnce()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
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
            <div className="flex flex-col items-end gap-1">
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
                Re-run research
              </Button>
              ) : null}
              {rerun.error ? (
                <span role="alert" className="text-xs text-destructive">
                  {rerun.error}
                </span>
              ) : null}
            </div>
          </div>

          {researchStatus === "SUCCEEDED" ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                <span className="font-medium">Next: get post ideas.</span>{" "}
                <span className="text-muted-foreground">
                  Your workspace has the ideas, calendar and drafts. Agents already use these documents.
                </span>
              </p>
              <Button asChild size="sm" className="self-start sm:self-auto">
                <Link href="/">
                  Go to workspace <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
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
              <ul className="flex flex-col gap-1.5">
                {docs.map((d) => {
                  const active = d.kind === current?.kind;
                  return (
                    <li key={d.kind}>
                      <button
                        type="button"
                        onClick={() => d.kind !== current?.kind && okToDiscard() && setSelected(d.kind)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full flex-col items-start gap-1.5 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-primary/50 bg-primary/10"
                            : "border-transparent hover:border-border hover:bg-card",
                        )}
                      >
                        <span className="text-sm font-medium text-foreground">
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
