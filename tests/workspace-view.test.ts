import { describe, expect, it } from "vitest";
import { RUN_ID_PATTERN } from "@/shared";
import { viewFromSearch, viewToSearch } from "@/lib/workspace-view";

describe("workspace view URL", () => {
  it("round-trips an agent's run", () => {
    const v = viewFromSearch("?agent=planner&runId=cm_9-x");
    expect(v).toEqual({ kind: "agent", key: "planner", runId: "cm_9-x" });
    expect(viewToSearch(v, "", "/")).toBe("?agent=planner&runId=cm_9-x");
  });
  it("drops a runId the server would refuse", () => {
    expect(viewFromSearch("?agent=planner&runId=a%20b")).toEqual({ kind: "agent", key: "planner" });
    expect(viewFromSearch(`?agent=planner&runId=${"x".repeat(41)}`)).toEqual({ kind: "agent", key: "planner" });
  });
  it("clears runId when the view changes and keeps other parameters", () => {
    expect(viewToSearch({ kind: "content", id: "p1" }, "?agent=planner&runId=r1&panel=content", "/")).toBe("?panel=content&post=p1");
    expect(viewToSearch({ kind: "home" }, "?agent=planner&runId=r1", "/")).toBe("/");
  });
  it("checks runId with the pattern shared with the server", () => {
    expect(viewFromSearch(`?agent=a&runId=${"x".repeat(40)}`)).toEqual({ kind: "agent", key: "a", runId: "x".repeat(40) });
    expect(RUN_ID_PATTERN.test("x".repeat(41))).toBe(false);
    expect(viewFromSearch(`?agent=a&runId=${"x".repeat(41)}`)).toEqual({ kind: "agent", key: "a" });
  });
});
