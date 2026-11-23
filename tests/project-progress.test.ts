import { describe, expect, it } from "vitest";
import { progressLabel, progressPercent } from "@/components/tasks/task-views";

describe("project progress", () => {
  it('progress label "3 of 8 done" and 0 of 0 reads "No tasks yet"', () => {
    expect(progressLabel({ done: 3, total: 8 })).toBe("3 of 8 done");
    expect(progressLabel({ done: 0, total: 0 })).toBe("No tasks yet");
  });
  it("percent is done over total, 0 with no tasks", () => {
    expect(progressPercent({ done: 3, total: 8 })).toBe(38);
    expect(progressPercent({ done: 0, total: 0 })).toBe(0);
    expect(progressPercent({ done: 5, total: 5 })).toBe(100);
  });
});
