import { describe, expect, it, vi } from "vitest";
import { afterCursor, mergeTimeline, type TimelineItem } from "@/server/services/activity";
import { cursorOf, parseCursor, type Cursor } from "@/server/services/platform-admin";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

const item = (kind: TimelineItem["kind"], id: string, at: number): TimelineItem => ({ kind, id, at: new Date(at), workspaceId: null, brandId: null, detail: "" });

/** What the database does with afterCursor's filter: keep the rows it matches, newest first, 51 of them. */
type Where = { createdAt?: { lt?: Date; lte?: Date } | Date; id?: { lt: string }; OR?: Where[] };
const matches = (r: TimelineItem, w: Where): boolean =>
  (w.OR ? w.OR.some((o) => matches(r, o)) : true) &&
  (w.createdAt === undefined || (w.createdAt instanceof Date ? +r.at === +w.createdAt : (w.createdAt.lt ? +r.at < +w.createdAt.lt : true) && (w.createdAt.lte ? +r.at <= +w.createdAt.lte : true))) &&
  (w.id === undefined || r.id < w.id.lt);
const query = (rows: TimelineItem[], before?: Cursor) => rows.filter((r) => matches(r, afterCursor(r.kind, before) as Where)).slice(0, 51);

describe("mergeTimeline", () => {
  it("puts the newest first across sources", () => {
    const { items } = mergeTimeline([[item("visit", "v1", 3), item("visit", "v2", 1)], [item("action", "a1", 2)]]);
    expect(items.map((i) => i.id)).toEqual(["v1", "a1", "v2"]);
  });

  it("hands back the last row shown as the next cursor", () => {
    const visits = Array.from({ length: 60 }, (_, i) => item("visit", `v${String(59 - i).padStart(3, "0")}`, 1000 - i));
    const one = mergeTimeline([visits.slice(0, 51)]);
    expect(one.items).toHaveLength(50);
    expect(one.next).toBe(cursorOf(one.items[49]));
    expect(mergeTimeline([visits.slice(0, 10)]).next).toBeUndefined();
  });

  it("pages through tied timestamps across sources: no row skipped or repeated", () => {
    // As the database returns each source: createdAt desc, id desc.
    const id = (p: string, i: number) => `${p}${String(i).padStart(3, "0")}`;
    const visits = Array.from({ length: 70 }, (_, i) => item("visit", id("v", 69 - i), i < 40 ? 5 : 4));
    const tasks = Array.from({ length: 70 }, (_, i) => item("task", id("t", 69 - i), i < 40 ? 5 : 4));
    const seen: string[] = [];
    let before: Cursor | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = mergeTimeline([query(visits, before), query(tasks, before)]);
      seen.push(...page.items.map((i) => `${i.kind}:${i.id}`));
      if (!page.next) break;
      before = parseCursor(page.next);
    }
    expect(seen).toHaveLength(140);
    expect(new Set(seen).size).toBe(140);
  });
});

describe("afterCursor", () => {
  const c = { at: new Date(5), id: "x", kind: "action" };
  it("a kind shown before the cursor's: strictly older", () => expect(afterCursor("visit", c)).toEqual({ createdAt: { lt: c.at } }));
  it("a kind shown after it: the same moment too", () => expect(afterCursor("task", c)).toEqual({ createdAt: { lte: c.at } }));
  it("the same kind: older, or the same moment and a lower id", () => expect(afterCursor("action", c)).toEqual({ OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: "x" } }] }));
  it("no cursor: everything", () => expect(afterCursor("visit")).toEqual({}));
});

describe("parseCursor", () => {
  it("reads back what cursorOf wrote", () => expect(parseCursor(cursorOf({ at: new Date(1700000000123), id: "ck1", kind: "ai" }))).toEqual({ at: new Date(1700000000123), id: "ck1", kind: "ai" }));
  it.each([undefined, "", "abc", "123", "x~id", "1~a b", "1~" + "a".repeat(65)])("ignores %s", (v) => expect(parseCursor(v)).toBeUndefined());
});
