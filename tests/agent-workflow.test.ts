import { describe, expect, it } from "vitest";
import { channelsFor, nextAction, plannerChainBody, preselectedChannels, stageFlag, stageState, workflowCounts, type WorkflowCounts } from "@/lib/agent-workflow";

describe("the web's posts chain", () => {
  it("starts the Planner with the chain on, in the runs route's input", () => {
    expect(JSON.parse(plannerChainBody())).toEqual({ input: { chain: true } });
    expect(JSON.parse(plannerChainBody([]))).toEqual({ input: { chain: true } });
  });

  it("passes the chosen channels, deduped", () => {
    expect(JSON.parse(plannerChainBody(["PINTEREST_PIN", "PINTEREST_PIN", "FACEBOOK_POST"]))).toEqual({ input: { chain: true, channels: ["PINTEREST_PIN", "FACEBOOK_POST"] } });
  });
});

describe("Plan with agents channels", () => {
  it("preselects a channel filter's channels, a group's members, or all but the hand ones", () => {
    expect(preselectedChannels("PINTEREST_PIN")).toEqual(["pinterest"]);
    expect(preselectedChannels("meta")).toEqual(["instagram", "facebook"]);
    expect(preselectedChannels("instagram")).toEqual(["instagram"]);
    expect(preselectedChannels()).toEqual(["instagram", "facebook", "pinterest", "threads"]);
    expect(preselectedChannels("LINKEDIN_POST")).toEqual([]);
    expect(preselectedChannels("LINKEDIN_POST", true)).toEqual(["linkedin"]);
  });

  it("maps ticked options to the content channels the Planner plans (no Reels)", () => {
    expect(channelsFor(["instagram", "x"])).toEqual(["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL", "INSTAGRAM_STORY", "X_POST"]);
  });
});

describe("workflow strip", () => {
  it("maps a last run to its state", () => {
    expect(stageState(null)).toBe("idle");
    expect(stageState({ status: "QUEUED" })).toBe("queued");
    expect(stageState({ status: "RUNNING" })).toBe("running");
    expect(stageState({ status: "SUCCEEDED" })).toBe("completed");
    expect(stageState({ status: "FAILED" })).toBe("failed");
    expect(stageState({ status: "FAILED", nothingToDo: true })).toBe("idle");
  });

  it("counts what waits at each stage, and nothing for a list not read", () => {
    const c = workflowCounts(
      [{ status: "NEW" }, { status: "SHORTLISTED" }, { status: "NEW" }],
      [
        { status: "PLANNED", latest: null },
        { status: "PLANNED", studio: true, latest: null },
        { status: "BRIEF_READY" },
        { status: "BRIEF_READY", studio: true },
        { status: "DRAFT_REVIEW", latest: { check: null } },
        { status: "DRAFT_REVIEW", latest: { check: { overall: "BLOCKER" } } },
        { status: "DRAFT_REVIEW", latest: { check: { overall: "WARN" } } },
        { status: "AWAITING_APPROVAL" },
      ],
    );
    expect(c).toEqual({ newIdeas: 2, shortlisted: 1, toBrief: 1, toDraft: 1, toCheck: 1, blocked: 1, awaitingApproval: 1 });
    expect(workflowCounts(null, null).toBrief).toBeNull();
  });
});

const queues = (q: Partial<WorkflowCounts>): WorkflowCounts => ({ newIdeas: 0, shortlisted: 0, toBrief: 0, toDraft: 0, toCheck: 0, blocked: 0, awaitingApproval: 0, ...q });

describe("workflow next action", () => {
  it("is the first open dependency, in order", () => {
    const all = { newIdeas: 57, shortlisted: 3, toBrief: 2, toDraft: 5, blocked: 1, awaitingApproval: 7 };
    expect(nextAction(queues(all), false)).toEqual({ kind: "blocked", count: 1 });
    expect(nextAction(queues({ ...all, blocked: 0 }), false)).toEqual({ kind: "chain", agent: "brief", toBrief: 2, toDraft: 5 });
    expect(nextAction(queues({ ...all, blocked: 0, toBrief: 0, toDraft: 0 }), false)).toEqual({ kind: "plan", count: 3 });
    expect(nextAction(queues({ newIdeas: 57, awaitingApproval: 7 }), false)).toEqual({ kind: "review-ideas", count: 57 });
    expect(nextAction(queues({ awaitingApproval: 7 }), false)).toEqual({ kind: "approvals", count: 7 });
    expect(nextAction(queues({}), false)).toEqual({ kind: "create" });
  });

  it("starts the chain from the Creator when only drafts wait (the Brief writer would have nothing to do)", () => {
    expect(nextAction(queues({ toDraft: 5, awaitingApproval: 7 }), false)).toEqual({ kind: "chain", agent: "creator", toBrief: 0, toDraft: 5 });
  });

  it("never offers a second start while the chain is going", () => {
    expect(nextAction(queues({ toBrief: 2, toDraft: 3, shortlisted: 4 }), true)).toEqual({ kind: "working", count: 5 });
  });

  it("gives none while a list is unread", () => {
    expect(nextAction(workflowCounts(null, []), false)).toBeNull();
    expect(nextAction(workflowCounts([], null), false)).toBeNull();
  });
});

describe("workflow stage flags", () => {
  it("has the Planner wait for you while ideas are new and none shortlisted", () => {
    expect(stageFlag("planner", queues({ newIdeas: 57 }))).toBe("waiting");
    expect(stageFlag("planner", queues({ newIdeas: 57, shortlisted: 1 }))).toBeNull();
    expect(stageFlag("planner", queues({}))).toBeNull();
  });

  it("has Quality need attention for blocked drafts or approvals waiting", () => {
    expect(stageFlag("quality", queues({ blocked: 1 }))).toBe("attention");
    expect(stageFlag("quality", queues({ awaitingApproval: 2 }))).toBe("attention");
    expect(stageFlag("quality", queues({ toCheck: 3 }))).toBeNull();
    expect(stageFlag("scout", queues({ newIdeas: 5 }))).toBeNull();
    expect(stageFlag("quality", workflowCounts(null, null))).toBeNull();
  });
});
