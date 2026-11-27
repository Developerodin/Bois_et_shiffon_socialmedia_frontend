import { describe, expect, it } from "vitest";
import { channelsFor, plannerChainBody, preselectedChannels, stageState, workflowCounts } from "@/lib/agent-workflow";

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
      [{ status: "PLANNED" }, { status: "BRIEF_READY" }, { status: "DRAFT_REVIEW", latest: { check: null } }, { status: "DRAFT_REVIEW", latest: { check: { overall: "BLOCKER" } } }, { status: "AWAITING_APPROVAL" }],
    );
    expect(c).toEqual({ newIdeas: 2, shortlisted: 1, toBrief: 1, toDraft: 1, toCheck: 1, awaitingApproval: 1 });
    expect(workflowCounts(null, null).toBrief).toBeNull();
  });
});
