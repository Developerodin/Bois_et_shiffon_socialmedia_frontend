import { stageQueue, workflowCounts } from "@/lib/agent-workflow";

/* Pure list helpers for the Scout and Quality drawers (type-only imports, so they load in node tests). */

type Idea = { id: string; status: "NEW" | "SHORTLISTED" | "DISMISSED" | "PLANNED"; decision: "RECOMMEND" | "HOLD" | "REJECT" };

export type IdeaFilter = "review" | "shortlisted" | "dismissed" | "all";

/**
 * Scout's counts over the ideas list the server returns (its 100 best and newest, so "latest ideas", not all-time).
 * `advisedHold` is Scout's own recommendation (decision HOLD); `dismissed` is the person's decision (status).
 */
export function ideaCounts(ideas: readonly Idea[]) {
  const n = (test: (o: Idea) => boolean) => ideas.filter(test).length;
  return {
    all: ideas.length,
    recommended: n((o) => o.decision === "RECOMMEND"),
    toReview: n((o) => o.status === "NEW"),
    shortlisted: n((o) => o.status === "SHORTLISTED"),
    planned: n((o) => o.status === "PLANNED"),
    advisedHold: n((o) => o.decision === "HOLD"),
    dismissed: n((o) => o.status === "DISMISSED"),
  };
}

export function filterIdeas<T extends Idea>(ideas: readonly T[], filter: IdeaFilter): T[] {
  if (filter === "all") return [...ideas];
  const status = filter === "review" ? "NEW" : filter === "shortlisted" ? "SHORTLISTED" : "DISMISSED";
  return ideas.filter((o) => o.status === status);
}

/** Only ideas the Planner can still take: a planned one is locked (404), a dismissed one would be revived silently. */
export const selectable = (o: Idea) => o.status === "NEW" || o.status === "SHORTLISTED";

/**
 * How many ideas one Planner run takes after "Plan selected": it plans every shortlisted idea (its input can't name
 * ideas), so the selected ones still to shortlist plus those already shortlisted.
 */
export function ideasToPlan(ideas: readonly Idea[], selected: ReadonlySet<string>): number {
  return ideas.filter((o) => o.status === "SHORTLISTED" || (o.status === "NEW" && selected.has(o.id))).length;
}

/** Selected ids still to shortlist before planning (still NEW in the list). */
export function toShortlist(ideas: readonly Idea[], selected: ReadonlySet<string>): string[] {
  return ideas.filter((o) => o.status === "NEW" && selected.has(o.id)).map((o) => o.id);
}

export const ideaNoun = (n: number) => (n === 1 ? "idea" : "ideas");

type Post = { id: string; status: string; studio?: boolean; latest?: { check?: { overall?: string } | null } | null };

/**
 * Quality's groups, from the same queue the workflow strip counts (stageQueue("quality")): blocked drafts, then the
 * posts awaiting approval split into clean passes and passes with notes (WARN), so the two never overlap.
 */
export function qualityGroups<P extends Post>(posts: readonly P[]) {
  const q = stageQueue("quality", posts);
  const blocked = q.find((g) => g.posts[0]?.status === "DRAFT_REVIEW")?.posts ?? [];
  const awaiting = q.find((g) => g.posts[0]?.status === "AWAITING_APPROVAL")?.posts ?? [];
  return {
    blocked,
    passed: awaiting.filter((p) => p.latest?.check?.overall !== "WARN"),
    warnings: awaiting.filter((p) => p.latest?.check?.overall === "WARN"),
  };
}

/**
 * Quality's counts across the posts list now (the calendar's open posts plus 30 days). `checked`: posts whose latest
 * version has a check (approved and published ones too); `passed`: of those, PASS or WARN; `warnings`: WARN.
 */
export function qualityCounts(posts: readonly Post[]) {
  const c = workflowCounts(null, posts);
  const overall = (p: Post) => p.latest?.check?.overall;
  return {
    checked: posts.filter((p) => !!overall(p)).length,
    passed: posts.filter((p) => overall(p) === "PASS" || overall(p) === "WARN").length,
    warnings: posts.filter((p) => overall(p) === "WARN").length,
    blocked: c.blocked ?? 0,
    awaitingApproval: c.awaitingApproval ?? 0,
    toCheck: c.toCheck ?? 0,
  };
}
