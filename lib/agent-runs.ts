import type { AgentSummary } from "@/components/agents/api";

/** A run that failed only because there was nothing to work on ("No ideas…", "Nothing to…"): not a problem. */
export const nothingToDo = (a: AgentSummary | undefined) => a?.lastRun?.status === "FAILED" && /^(No |Nothing )/.test(a.lastRun.error ?? "");

export type FinishedRun = { key: string; name: string; runId: string; status: "done" | "failed" | "idle"; error?: string };

/** The newest finishedAt/startedAt among the runs: server time, so the browser's clock never decides what is new. */
export function baselineOf(agents: readonly AgentSummary[]): string | null {
  let best: string | null = null;
  for (const a of agents) {
    for (const t of [a.lastRun?.finishedAt, a.lastRun?.startedAt]) if (t && (!best || t > best)) best = t;
  }
  return best;
}

const going = (s: string) => s === "QUEUED" || s === "RUNNING";

/**
 * The runs that finished between two polls, each once: one seen going that has now finished, or one never seen that
 * finished after `baseline` (the first poll's newest time). A run already finished in `prev` is not repeated.
 */
export function finishedRuns(prev: readonly AgentSummary[] | null, next: readonly AgentSummary[], baseline: string | null): FinishedRun[] {
  const out: FinishedRun[] = [];
  for (const a of next) {
    const run = a.lastRun;
    if (!run || going(run.status)) continue;
    const before = prev?.find((p) => p.key === a.key)?.lastRun;
    if (before?.id === run.id) {
      if (!going(before.status)) continue;
    } else if (!(run.finishedAt && baseline && run.finishedAt > baseline)) continue;
    const status = run.status === "SUCCEEDED" ? "done" : nothingToDo(a) ? "idle" : "failed";
    out.push({ key: a.key, name: a.name, runId: run.id, status, ...(status === "failed" && run.error ? { error: run.error } : {}) });
  }
  return out;
}
