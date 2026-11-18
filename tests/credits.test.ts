import { describe, expect, it } from "vitest";
import { paywallCopy } from "@/components/shell/paywall-dialog";
import { agentRunPrice, creditsLabel, creditsText, shootPrice, shootPriceBlocker, withPrice, workspaceIdOf, type Subscription } from "@/lib/plan-credits";

const bare: Subscription = { plan: null, unlimited: false, plans: [] };
const prices = { manualRun: 5, siteAudit: 10, storyWrite: 2, reelPerSecond: 1, presenterPerSecond: 3 };

describe("agentRunPrice", () => {
  it("shows no price without a subscription, without prices, or on an unlimited workspace", () => {
    expect(agentRunPrice(null, "scout")).toBeNull();
    expect(agentRunPrice(bare, "scout")).toBeNull();
    expect(agentRunPrice({ ...bare, unlimited: true, prices, freeAgents: ["quality"] }, "scout")).toBeNull();
  });
  it("charges a manual run unless the agent is free", () => {
    const sub = { ...bare, prices, freeAgents: ["quality"] };
    expect(agentRunPrice(sub, "scout")).toBe(5);
    expect(agentRunPrice(sub, "quality")).toBe(0);
  });
});

describe("shootPrice", () => {
  it("shows no price without a subscription or on an unlimited workspace", () => {
    expect(shootPrice(null, "base")).toBeNull();
    expect(shootPrice({ ...bare, unlimited: true }, "ultra")).toBeNull();
  });
  it("charges the tier's credits, even from a server without prices", () => {
    expect(shootPrice(bare, "base")).toBe(4);
    expect(shootPrice({ ...bare, prices }, "ultra")).toBe(24);
  });
});

describe("creditsText", () => {
  it("counts credits", () => {
    expect(creditsText(1)).toBe("1 credit");
    expect(creditsText(24)).toBe("24 credits");
  });
});

describe("withPrice", () => {
  it("appends the price after the visible words", () => {
    expect(withPrice("Run now", 5)).toBe("Run now · 5 credits");
    expect(withPrice("Run now", 1)).toBe("Run now · 1 credit");
    expect(withPrice("Run now", 0)).toBe("Run now");
    expect(withPrice("Run now", null)).toBe("Run now");
  });
});

describe("creditsLabel", () => {
  it("names the balance", () => {
    expect(creditsLabel(null, false)).toBe("Credits");
    expect(creditsLabel(120, false)).toBe("120 credits");
    expect(creditsLabel(1, false)).toBe("1 credit");
    expect(creditsLabel(0, false)).toBe("0 credits");
    expect(creditsLabel(5, true)).toBe("Unlimited credits");
  });
});

describe("workspaceIdOf", () => {
  it("reads the workspace out of a brand base", () => {
    expect(workspaceIdOf("/api/v1/workspaces/w%201/brands/b1")).toBe("w 1");
    expect(workspaceIdOf("/x")).toBeNull();
  });
});

describe("paywallCopy", () => {
  it("explains a credits refusal with the server's numbers", () => {
    const c = paywallCopy({ insufficientCredits: true, balance: 3, needed: 10 });
    expect(c.title).toBe("Not enough credits");
    expect(c.body).toContain("needs 10 credits");
    expect(c.body).toContain("has 3");
    expect(c.body).toContain("shared by every business");
    expect(paywallCopy({ insufficientCredits: true, balance: 0, needed: 1 }).body).toContain("needs 1 credit.");
  });
  it("uses the plan refusal's title", () => {
    expect(paywallCopy({ planRequired: true, title: "Reels need a plan" }).title).toBe("Reels need a plan");
  });
});

describe("shootPriceBlocker", () => {
  it("holds a paid press until the plan is read, so its button always shows the price", () => {
    expect(shootPriceBlocker(null, false)).toBe("Reading your plan's prices…");
    expect(shootPriceBlocker(null, true)).toBe("Couldn't read your plan's prices.");
    expect(shootPriceBlocker(bare, false)).toBeNull();
    // Unlimited: no price to show, and nothing to wait for.
    expect(shootPriceBlocker({ ...bare, unlimited: true }, true)).toBeNull();
  });
});
