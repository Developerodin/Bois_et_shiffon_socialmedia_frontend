import { describe, expect, it, vi } from "vitest";
import { mergeActivityCounts, sortActivity } from "@/server/services/activity";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

const at = (d: number) => new Date(Date.UTC(2026, 9, d));
const none = { visits: [], actions: [], tasks: [], ai: [], api: [] };

describe("mergeActivityCounts", () => {
  it("merges one person-workspace across sources", () => {
    const rows = mergeActivityCounts({
      ...none,
      visits: [{ userId: "u1", workspaceId: "w1", n: 5, last: at(3) }],
      actions: [{ userId: "u1", workspaceId: "w1", n: 2, last: at(5) }],
      tasks: [{ userId: "u1", workspaceId: "w1", n: 1, last: at(4) }],
    });
    expect(rows).toEqual([{ userId: "u1", workspaceId: "w1", last: at(5), visits: 5, actions: 2, tasks: 1, usd: 0 }]);
  });

  it("adds AI and other API spend", () => {
    const [row] = mergeActivityCounts({
      ...none,
      ai: [{ userId: "u1", workspaceId: "w1", usd: 1.5, last: at(1) }],
      api: [{ userId: "u1", workspaceId: "w1", usd: 0.25, last: at(2) }],
    });
    expect(row.usd).toBe(1.75);
    expect(row.last).toEqual(at(2));
  });

  it("sorts most recently active first", () => {
    const rows = mergeActivityCounts({
      ...none,
      visits: [
        { userId: "u1", workspaceId: "w1", n: 1, last: at(1) },
        { userId: "u2", workspaceId: "w1", n: 1, last: at(9) },
      ],
    });
    expect(rows.map((r) => r.userId)).toEqual(["u2", "u1"]);
  });

  it("keeps rows with no workspace", () => {
    const rows = mergeActivityCounts({
      ...none,
      visits: [{ userId: "u1", workspaceId: "w1", n: 1, last: at(2) }],
      actions: [{ userId: "u1", workspaceId: null, n: 3, last: at(1) }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ workspaceId: null, actions: 3, visits: 0 });
  });

  it("keeps unattributed activity as its own row per workspace", () => {
    const rows = mergeActivityCounts({
      ...none,
      ai: [
        { userId: "u1", workspaceId: "w1", usd: 0.5, last: at(2) },
        { userId: null, workspaceId: "w1", usd: 2, last: at(1) },
      ],
      tasks: [{ userId: null, workspaceId: "w1", n: 3, last: at(1) }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ userId: null, workspaceId: "w1", usd: 2, tasks: 3 });
  });
});

describe("sortActivity", () => {
  const row = (userId: string, last: number, usd: number) => ({ userId, workspaceId: "w1", last: at(last), visits: 0, actions: 0, tasks: 0, usd });
  it("biggest first, ties most recently active first", () => {
    const rows = [row("a", 1, 2), row("b", 3, 5), row("c", 2, 2)];
    expect(sortActivity(rows, "spend").map((r) => r.userId)).toEqual(["b", "c", "a"]);
    expect(sortActivity(rows, "active").map((r) => r.userId)).toEqual(["b", "c", "a"]);
  });
});
