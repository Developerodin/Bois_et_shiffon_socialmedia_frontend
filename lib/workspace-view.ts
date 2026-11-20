import type { ContextDocKind } from "@/components/context/api";

/** What the Overview has open. `run` starts the agent on open; `runId` shows one finished run's events. */
export type View =
  | { kind: "home" }
  | { kind: "doc"; doc: ContextDocKind }
  | { kind: "agent"; key: string; run?: boolean; runId?: string }
  | { kind: "content"; id: string }
  | { kind: "competitor"; id: string };

/** What the server accepts as a run id (agent-events?runId=). */
export const RUN_ID = /^[A-Za-z0-9_-]{1,40}$/;

/** The open item lives in the URL (?post=, ?doc=, ?agent=[&runId=], ?competitor=). */
export function viewFromSearch(search: string): View {
  const q = new URLSearchParams(search);
  const post = q.get("post"), doc = q.get("doc"), agent = q.get("agent"), competitor = q.get("competitor"), runId = q.get("runId");
  if (post) return { kind: "content", id: post };
  if (doc) return { kind: "doc", doc: doc as ContextDocKind };
  if (agent) return { kind: "agent", key: agent, ...(runId && RUN_ID.test(runId) ? { runId } : {}) };
  if (competitor) return { kind: "competitor", id: competitor };
  return { kind: "home" };
}

/** The URL's search for a view, keeping the parameters that aren't about the view (filters, ?panel=). */
export function viewToSearch(v: View, search: string, pathname: string): string {
  const q = new URLSearchParams(search);
  for (const k of ["post", "doc", "agent", "competitor", "runId"]) q.delete(k);
  if (v.kind === "content") q.set("post", v.id);
  if (v.kind === "doc") q.set("doc", v.doc);
  if (v.kind === "agent") {
    q.set("agent", v.key);
    if (v.runId) q.set("runId", v.runId);
  }
  if (v.kind === "competitor") q.set("competitor", v.id);
  const s = q.toString();
  return s ? `?${s}` : pathname;
}
