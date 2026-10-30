import { describe, expect, it, vi } from "vitest";
import { mergeTimeline, type TimelineItem } from "@/server/services/activity";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

const item = (kind: TimelineItem["kind"], id: string, at: number): TimelineItem => ({ kind, id, at: new Date(at), workspaceId: null, brandId: null });

describe("mergeTimeline", () => {
  it("puts the newest first across sources", () => {
    const { items } = mergeTimeline([[item("visit", "v1", 3), item("visit", "v2", 1)], [item("action", "a1", 2)]], 1);
    expect(items.map((i) => i.id)).toEqual(["v1", "a1", "v2"]);
  });

  it("starts page 2 where page 1 ended", () => {
    const visits = Array.from({ length: 60 }, (_, i) => item("visit", `v${i}`, 1000 - i));
    const one = mergeTimeline([visits], 1);
    const two = mergeTimeline([visits], 2);
    expect(one.items).toHaveLength(50);
    expect(one.hasMore).toBe(true);
    expect(two.items[0].id).toBe("v50");
    expect(two.items).toHaveLength(10);
    expect(two.hasMore).toBe(false);
  });

  it("ties across pages: same timestamp, no row skipped or repeated", () => {
    // Each source comes back as the queries return it (createdAt desc, id desc), and each page reads the newest
    // page*50+1 of each, as personTimeline does.
    const visits = Array.from({ length: 60 }, (_, i) => item("visit", `v${String(59 - i).padStart(3, "0")}`, 5));
    const tasks = Array.from({ length: 60 }, (_, i) => item("task", `t${String(59 - i).padStart(3, "0")}`, 5));
    const seen = [1, 2, 3].flatMap((p) => mergeTimeline([visits.slice(0, p * 50 + 1), tasks.slice(0, p * 50 + 1)], p).items.map((i) => `${i.kind}:${i.id}`));
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
  });
});
