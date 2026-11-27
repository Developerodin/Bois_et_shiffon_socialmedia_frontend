import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@/components/agents/api";
import { briefFields, briefProducts, groupBy, hasBrief, levelCounts, logText, milestones, plannerSummary, runPosts } from "@/lib/agent-drawer";

const ev = (id: string, over: Partial<AgentEvent> = {}): AgentEvent => ({ id, runId: "r1", agentKey: "planner", createdAt: `2026-11-27T10:00:0${id}.000Z`, level: "INFO", message: `line ${id}`, entityType: null, entityId: null, ...over });

describe("agent drawer: a run's posts", () => {
  it("lists each post once, newest first, named by its latest line; other entities are skipped", () => {
    const events = [
      ev("1", { entityType: "ContentItem", entityId: "a", message: "planned a" }),
      ev("2", { entityType: "ContentItem", entityId: "b", message: "planned b" }),
      ev("3", { entityType: "ContentItem", entityId: "a", message: "dated a" }),
      ev("4", { entityType: "Opportunity", entityId: "o" }),
    ];
    expect(runPosts(events)).toEqual([
      { id: "a", line: "dated a" },
      { id: "b", line: "planned b" },
    ]);
    expect(runPosts([])).toEqual([]);
  });
});

describe("agent drawer: planner summary", () => {
  it("counts posts, distinct channels, named products and the date range", () => {
    const s = plannerSummary([
      { channel: "INSTAGRAM_POST", scheduledFor: "2026-12-03T09:00:00Z", brief: { angle: "x", products: ["Mug", "Plate"] } },
      { channel: "INSTAGRAM_POST", scheduledFor: "2026-12-01T09:00:00Z", brief: { products: ["Mug"] } },
      { channel: "PINTEREST_PIN", scheduledFor: null, brief: null },
    ]);
    expect(s).toEqual({ posts: 3, channels: ["INSTAGRAM_POST", "PINTEREST_PIN"], products: 2, from: "2026-12-01T09:00:00Z", to: "2026-12-03T09:00:00Z" });
  });

  it("gives no product count or dates when nothing names them, never a guessed 0", () => {
    const s = plannerSummary([{ channel: "X_POST", scheduledFor: null, brief: { angle: "a" } }]);
    expect(s.products).toBeNull();
    expect(s.from).toBeNull();
    expect(plannerSummary([])).toEqual({ posts: 0, channels: [], products: null, from: null, to: null });
  });
});

describe("agent drawer: brief fields", () => {
  it("reads known fields in order, skipping empty and malformed ones", () => {
    expect(briefFields({ cta: "Shop now", goal: "sales", audience: " ", products: ["Mug", 3, ""], questions: [], extra: "x", keyMessage: 5 })).toEqual([
      { key: "goal", label: "Objective", value: "Sales" },
      { key: "products", label: "Products", value: ["Mug"] },
      { key: "cta", label: "Call to action", value: "Shop now" },
    ]);
    expect(briefFields(null)).toEqual([]);
  });

  it("tells a written brief from the Planner's angle alone", () => {
    expect(hasBrief({ angle: "a" })).toBe(false);
    expect(hasBrief({ angle: "a", keyMessage: "m" })).toBe(true);
    expect(hasBrief(null)).toBe(false);
  });

  it("reads product names only from a string list", () => {
    expect(briefProducts({ products: "Mug" })).toEqual([]);
    expect(briefProducts({ products: ["Mug", null] })).toEqual(["Mug"]);
  });
});

describe("agent drawer: log helpers", () => {
  const events = [ev("1"), ev("2", { level: "WARN", message: "slow" }), ev("3", { level: "ERROR", message: "boom", entityType: "ContentItem", entityId: "p" })];

  it("counts levels and keeps only non-INFO lines as milestones", () => {
    expect(levelCounts(events)).toEqual({ INFO: 1, SUCCESS: 0, WARN: 1, ERROR: 1 });
    expect(milestones(events).map((e) => e.id)).toEqual(["2", "3"]);
  });

  it("copies one plain line per event", () => {
    expect(logText(events).split("\n")).toEqual([
      "2026-11-27T10:00:01.000Z INFO [planner] line 1",
      "2026-11-27T10:00:02.000Z WARN [planner] slow",
      "2026-11-27T10:00:03.000Z ERROR [planner] boom -> ContentItem p",
    ]);
  });

  it("groups in first-seen order", () => {
    expect(groupBy(["a1", "b1", "a2"], (s) => s[0]!)).toEqual([
      { key: "a", items: ["a1", "a2"] },
      { key: "b", items: ["b1"] },
    ]);
  });
});
