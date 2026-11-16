import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPageView } from "@/components/page-view-tracker";

afterEach(() => vi.unstubAllGlobals());

describe("sendPageView", () => {
  it("sends a plain string (text/plain is always allowed in a beacon)", () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    sendPageView("/chat", "w1", null);
    expect(sendBeacon).toHaveBeenCalledWith("/api/v1/activity/page-views", JSON.stringify({ path: "/chat", platform: "web", workspaceId: "w1" }));
  });

  it("never throws when the browser refuses the beacon", () => {
    vi.stubGlobal("navigator", { sendBeacon: () => { throw new TypeError("blocked"); } });
    expect(() => sendPageView("/chat", null, null)).not.toThrow();
  });
});
