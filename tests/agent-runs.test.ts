import { describe, expect, it } from "vitest";
import type { AgentSummary, RunStatus } from "@/components/agents/api";
import { baselineOf, finishedRuns, nothingToDo } from "@/lib/agent-runs";

const agent = (key: string, id: string, status: RunStatus, finishedAt: string | null = null, error: string | null = null): AgentSummary => ({
  key,
  name: key.toUpperCase(),
  description: "",
  enabled: true,
  lastRun: { id, status, startedAt: "2026-01-01T10:00:00.000Z", finishedAt, error },
});
const T1 = "2026-01-01T10:05:00.000Z";
const T2 = "2026-01-01T10:10:00.000Z";

describe("nothingToDo", () => {
  it("is a failed run whose reason starts with No or Nothing", () => {
    expect(nothingToDo(agent("a", "1", "FAILED", T1, "No ideas to plan"))).toBe(true);
    expect(nothingToDo(agent("a", "1", "FAILED", T1, "Network down"))).toBe(false);
    expect(nothingToDo(agent("a", "1", "SUCCEEDED", T1))).toBe(false);
    expect(nothingToDo(undefined)).toBe(false);
  });
});

describe("baselineOf", () => {
  it("is the newest finishedAt or startedAt, null with no runs", () => {
    expect(baselineOf([agent("a", "1", "SUCCEEDED", T1), agent("b", "2", "RUNNING")])).toBe(T1);
    expect(baselineOf([])).toBeNull();
  });
});

describe("finishedRuns", () => {
  it("toasts once per finished run: done, failed, idle", () => {
    const prev = [agent("a", "1", "RUNNING"), agent("b", "2", "RUNNING"), agent("c", "3", "QUEUED")];
    const next = [
      agent("a", "1", "SUCCEEDED", T2),
      agent("b", "2", "FAILED", T2, "Rate limit"),
      agent("c", "3", "FAILED", T2, "Nothing to do"),
    ];
    expect(finishedRuns(prev, next, T1)).toEqual([
      { key: "a", name: "A", runId: "1", status: "done" },
      { key: "b", name: "B", runId: "2", status: "failed", error: "Rate limit" },
      { key: "c", name: "C", runId: "3", status: "idle" },
    ]);
  });

  it("does not repeat a run that was already finished", () => {
    const done = [agent("a", "1", "SUCCEEDED", T2)];
    expect(finishedRuns(done, done, T1)).toEqual([]);
  });

  it("ignores runs that finished before the baseline", () => {
    expect(finishedRuns(null, [agent("a", "1", "SUCCEEDED", T1)], T1)).toEqual([]);
    expect(finishedRuns([], [agent("a", "1", "SUCCEEDED", T1)], T1)).toEqual([]);
  });

  it("with no baseline (the first poll had no runs), any run that has finished since is new", () => {
    expect(finishedRuns(null, [agent("a", "1", "SUCCEEDED", T1)], null).map((r) => r.runId)).toEqual(["1"]);
    expect(finishedRuns([{ ...agent("a", "1", "SUCCEEDED"), lastRun: null }], [agent("a", "1", "FAILED", T1, "boom")], null).map((r) => r.status)).toEqual(["failed"]);
    expect(finishedRuns(null, [agent("a", "1", "RUNNING")], null)).toEqual([]);
  });

  it("counts an unseen run that finished after the baseline", () => {
    const prev = [agent("a", "1", "SUCCEEDED", T1)];
    const next = [agent("a", "9", "SUCCEEDED", T2)];
    expect(finishedRuns(prev, next, T1)).toEqual([{ key: "a", name: "A", runId: "9", status: "done" }]);
  });

  it("ignores runs still going and agents without a run", () => {
    const next = [agent("a", "1", "RUNNING"), { ...agent("b", "2", "RUNNING"), lastRun: null }];
    expect(finishedRuns([], next, T1)).toEqual([]);
  });
});
