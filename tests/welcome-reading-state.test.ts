import { describe, expect, it } from "vitest";
import { AFTER_FINISH_S, CHECKS_BOUND_S, keepPolling, POLL_LIMIT_S, settleCheck } from "@/components/welcome/reading-state";

describe("settleCheck", () => {
  it("leaves a check alone before the bound", () => {
    expect(settleCheck("waiting", CHECKS_BOUND_S - 1)).toBe("waiting");
    expect(settleCheck("running", 0)).toBe("running");
  });
  it("marks an unfinished check late at the bound", () => {
    expect(settleCheck("waiting", CHECKS_BOUND_S)).toBe("late");
    expect(settleCheck("running", CHECKS_BOUND_S + 60)).toBe("late");
  });
  it("marks a silent check late shortly after research finished", () => {
    expect(settleCheck("waiting", 60, AFTER_FINISH_S - 1)).toBe("waiting");
    expect(settleCheck("waiting", 60, AFTER_FINISH_S)).toBe("late");
  });
  it("never changes a finished check", () => {
    expect(settleCheck("done", POLL_LIMIT_S)).toBe("done");
    expect(settleCheck("failed", POLL_LIMIT_S)).toBe("failed");
  });
});

describe("keepPolling", () => {
  it("polls while research runs", () => {
    expect(keepPolling({ finished: false, checks: ["done", "done"], elapsedS: 30 })).toBe(true);
  });
  it("polls while a check is still moving after research finished", () => {
    expect(keepPolling({ finished: true, checks: ["done", "running"], elapsedS: 30 })).toBe(true);
  });
  it("stops once research finished and every check settled, late included", () => {
    expect(keepPolling({ finished: true, checks: ["done", "failed"], elapsedS: 30 })).toBe(false);
    expect(keepPolling({ finished: true, checks: ["done", "late"], elapsedS: CHECKS_BOUND_S })).toBe(false);
  });
  it("stops at the time limit even if research never finished", () => {
    expect(keepPolling({ finished: false, checks: ["waiting", "waiting"], elapsedS: POLL_LIMIT_S })).toBe(false);
  });
});
