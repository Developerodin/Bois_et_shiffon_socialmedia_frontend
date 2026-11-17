import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JobProgress, progressText, stepAnnouncement, type JobStep } from "@/components/ui/job-progress";

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

const html = (job: { slow: boolean; failed: boolean }, value: number | null = null) =>
  renderToStaticMarkup(createElement(JobProgress, { title: "Shoot", steps: steps("active"), value, job: { ...job, reload: async () => {} } }));

describe("JobProgress notices", () => {
  it("keeps both live regions mounted while quiet", () => {
    const h = html({ slow: false, failed: false });
    expect(h).toContain('role="status"');
    expect(h).toContain('role="alert"');
    expect(h).not.toContain("Couldn");
  });
  it("puts the failure inside the alert region", () => {
    expect(html({ slow: false, failed: true })).toMatch(/role="alert"[^>]*>[^]*Couldn/);
  });
  it("clamps aria-valuenow", () => {
    expect(html({ slow: false, failed: false }, 140)).toContain('aria-valuenow="100"');
    expect(html({ slow: false, failed: false }, -5)).toContain('aria-valuenow="0"');
  });
});
