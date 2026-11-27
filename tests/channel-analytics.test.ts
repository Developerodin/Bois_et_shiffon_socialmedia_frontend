import { describe, expect, it } from "vitest";
import { analyticsFor } from "@/lib/channel-analytics";

describe("analyticsFor", () => {
  it("reads the Facebook Page and Instagram on the Meta calendar, Instagram on its own and its formats", () => {
    expect(analyticsFor("meta")).toEqual(["facebook", "instagram"]);
    expect(analyticsFor("instagram")).toEqual(["instagram"]);
    expect(analyticsFor("INSTAGRAM_REEL")).toEqual(["instagram"]);
    expect(analyticsFor("FACEBOOK_POST")).toEqual(["facebook"]);
  });

  it("says LinkedIn and X are posted by hand, Pinterest and Threads not connected yet", () => {
    expect(analyticsFor("LINKEDIN_POST")).toBe("byHand");
    expect(analyticsFor("X_POST")).toBe("byHand");
    expect(analyticsFor("PINTEREST_PIN")).toBe("notYet");
    expect(analyticsFor("THREADS_POST")).toBe("notYet");
  });
});
