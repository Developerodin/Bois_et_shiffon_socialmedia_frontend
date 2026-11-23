import { describe, expect, it } from "vitest";
import { findingTaskLink } from "@/components/performance/audit-board";

describe("make a task on an audit finding", () => {
  it("label switches to Open task when the finding has an open task", () => {
    expect(findingTaskLink(null)).toEqual({ label: "Make a task", href: null });
    expect(findingTaskLink({ taskId: "t1", existed: true })).toEqual({ label: "Open task", href: "/tasks?task=t1" });
    // A task just made is open too.
    expect(findingTaskLink({ taskId: "t 2", existed: false })).toEqual({ label: "Open task", href: "/tasks?task=t%202" });
  });
});
