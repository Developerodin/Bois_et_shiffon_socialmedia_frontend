import { describe, expect, it } from "vitest";
import { boardChoice, publishCalls } from "@/components/workspace/release";

describe("publishCalls", () => {
  const body = { connectionId: "c1" };
  it("approves without booking a post, then publishes, only when awaiting approval", () => {
    expect(publishCalls(4, "AWAITING_APPROVAL", body)).toEqual([
      { action: "decide", version: 4, verdict: "APPROVED", noAutoPublish: true },
      { action: "publish", version: 4, connectionId: "c1" },
    ]);
  });
  it("only publishes once approved", () => {
    expect(publishCalls(4, "APPROVED", body)).toEqual([{ action: "publish", version: 4, connectionId: "c1" }]);
  });
});

describe("boardChoice", () => {
  const boards = [{ id: "b1" }, { id: "b2" }, { id: "b3" }];
  it("starts on the planned board when the account lists it, else the first", () => {
    expect(boardChoice(boards, "", "b2", null)).toBe("b2");
    expect(boardChoice(boards, "", "gone", null)).toBe("b1");
    expect(boardChoice(boards, "", null, null)).toBe("b1");
  });
  it("keeps the person's pick once the plan was applied", () => {
    expect(boardChoice(boards, "b3", "b2", "b2")).toBeNull();
  });
  it("moves to a plan set or changed while the form is open", () => {
    expect(boardChoice(boards, "b1", "b3", "b2")).toBe("b3");
    expect(boardChoice(boards, "b1", "b3", null)).toBe("b3");
  });
  it("on another account, falls back when the current board isn't listed there", () => {
    expect(boardChoice([{ id: "x1" }], "b2", "b2", "b2")).toBe("x1");
    expect(boardChoice([], "b2", "b2", null)).toBeNull();
  });
});
