import { describe, expect, it } from "vitest";
import { filterIdeas, ideaCounts, ideaNoun, ideasToPlan, qualityCounts, qualityGroups, selectable, toShortlist } from "@/components/agents/drawer/drawer-lists";

type S = "NEW" | "SHORTLISTED" | "DISMISSED" | "PLANNED";
type D = "RECOMMEND" | "HOLD" | "REJECT";
const idea = (id: string, status: S, decision: D = "RECOMMEND") => ({ id, status, decision });
const ideas = [idea("a", "NEW"), idea("b", "NEW", "HOLD"), idea("c", "SHORTLISTED"), idea("d", "DISMISSED", "REJECT"), idea("e", "PLANNED")];

describe("Scout drawer lists", () => {
  it("counts the person's statuses and Scout's advice apart", () => {
    expect(ideaCounts(ideas)).toEqual({ all: 5, recommended: 3, toReview: 2, shortlisted: 1, planned: 1, advisedHold: 1, dismissed: 1 });
    expect(ideaCounts([])).toMatchObject({ all: 0, toReview: 0 });
  });

  it("filters by tab", () => {
    expect(filterIdeas(ideas, "review").map((o) => o.id)).toEqual(["a", "b"]);
    expect(filterIdeas(ideas, "shortlisted").map((o) => o.id)).toEqual(["c"]);
    expect(filterIdeas(ideas, "dismissed").map((o) => o.id)).toEqual(["d"]);
    expect(filterIdeas(ideas, "all")).toHaveLength(5);
  });

  it("selects only new and shortlisted ideas", () => {
    expect(ideas.filter(selectable).map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("plans the selected new ideas plus every shortlisted one", () => {
    expect(ideasToPlan(ideas, new Set())).toBe(1);
    expect(ideasToPlan(ideas, new Set(["a", "c", "d", "e"]))).toBe(2);
    expect(toShortlist(ideas, new Set(["a", "c", "d"]))).toEqual(["a"]);
    expect(ideaNoun(1)).toBe("idea");
    expect(ideaNoun(2)).toBe("ideas");
  });
});

const post = (id: string, status: string, overall?: "PASS" | "WARN" | "BLOCKER") => ({ id, status, latest: overall ? { check: { overall } } : { check: null } });
const posts = [
  post("blocked", "DRAFT_REVIEW", "BLOCKER"),
  post("unchecked", "DRAFT_REVIEW"),
  post("pass", "AWAITING_APPROVAL", "PASS"),
  post("warn", "AWAITING_APPROVAL", "WARN"),
  post("approved", "APPROVED", "PASS"),
  post("planned", "PLANNED"),
];

describe("Quality drawer lists", () => {
  it("groups blocked, passed and passed-with-notes without overlap", () => {
    const g = qualityGroups(posts);
    expect(g.blocked.map((p) => p.id)).toEqual(["blocked"]);
    expect(g.passed.map((p) => p.id)).toEqual(["pass"]);
    expect(g.warnings.map((p) => p.id)).toEqual(["warn"]);
  });

  it("gives empty groups for no posts", () => {
    expect(qualityGroups([])).toEqual({ blocked: [], passed: [], warnings: [] });
  });

  it("counts the check state across the posts", () => {
    expect(qualityCounts(posts)).toEqual({ checked: 4, passed: 3, warnings: 1, blocked: 1, awaitingApproval: 2, toCheck: 1 });
  });
});
