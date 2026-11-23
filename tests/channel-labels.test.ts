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
