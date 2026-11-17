import { describe, expect, it } from "vitest";
import { progressText, stepAnnouncement, type JobStep } from "@/components/ui/job-progress";

const steps = (...states: JobStep["state"][]): JobStep[] => states.map((state, i) => ({ label: "abc"[i], state }));

describe("progressText", () => {
  const s = steps("done", "active", "waiting");
  it("names the active step, with the value when there is one", () => {
    expect(progressText(s, 40)).toBe("Step 2 of 3, b, 40 %");
    expect(progressText(s, null)).toBe("Step 2 of 3, b");
  });
  it("says Done when every step is done", () => {
    expect(progressText(steps("done", "done", "done"), 100)).toBe("Done");
  });
  it("names a failed step", () => {
    expect(progressText(steps("done", "failed", "waiting"), 40)).toBe("Failed: b");
  });
});

describe("stepAnnouncement", () => {
  it("stays quiet on mount and for unchanged steps in new objects", () => {
    expect(stepAnnouncement(null, steps("done", "active", "waiting"))).toBeNull();
    expect(stepAnnouncement(steps("done", "active", "waiting"), steps("done", "active", "waiting"))).toBeNull();
  });
  it("announces when the active step moves, then when all are done, once", () => {
    expect(stepAnnouncement(steps("done", "active", "waiting"), steps("done", "done", "active"))).toBe("Step 3 of 3, c");
    expect(stepAnnouncement(steps("done", "done", "active"), steps("done", "done", "done"))).toBe("Done");
    expect(stepAnnouncement(steps("done", "done", "done"), steps("done", "done", "done"))).toBeNull();
  });
  it("announces a failure once", () => {
    expect(stepAnnouncement(steps("done", "active", "waiting"), steps("done", "failed", "waiting"))).toBe("Failed: b");
    expect(stepAnnouncement(steps("done", "failed", "waiting"), steps("done", "failed", "waiting"))).toBeNull();
  });
});
