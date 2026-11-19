import { describe, expect, it } from "vitest";
import { publishCalls } from "@/components/workspace/release";

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
