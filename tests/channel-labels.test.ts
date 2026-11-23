import { describe, expect, it } from "vitest";
import { CHANNEL_LABEL } from "@/components/workspace/content-panels";
import { CAPTION_LIMITS } from "@/shared";

describe("LinkedIn and X", () => {
  it("are named in the calendar, its channel filter and the task list", () => {
    expect(CHANNEL_LABEL.LINKEDIN_POST).toBe("LinkedIn");
    expect(CHANNEL_LABEL.X_POST).toBe("X");
  });
  it("have the writer's limits", () => {
    expect(CAPTION_LIMITS).toMatchObject({ linkedinMax: 3000, xMax: 280 });
  });
});

describe("post labels", () => {
  it("live in lib, and content-panels passes the same ones on", async () => {
    const lib = await import("@/lib/post-labels");
    const panels = await import("@/components/workspace/content-panels");
    expect(panels.CHANNEL_LABEL).toBe(lib.CHANNEL_LABEL);
    expect(panels.STATUS_LABEL).toBe(lib.STATUS_LABEL);
  });
  it("keep the task pages off the Overview's panels", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["components/tasks/task-list.tsx", "components/tasks/project-view.tsx"]) {
      expect(readFileSync(f, "utf8")).not.toContain("@/components/workspace/content-panels");
    }
  });
});
