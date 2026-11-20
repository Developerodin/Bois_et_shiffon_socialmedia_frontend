import { describe, expect, it } from "vitest";
import { filterFromSearch, filterItems, filterToSearch, isBlocked, isOverdue, isThisWeek, ownerLabel, withFilter, type CalendarItem } from "@/lib/calendar-filter";

const now = new Date("2026-11-20T12:00:00Z");
const past = "2026-11-19T12:00:00Z";
const soon = "2026-11-22T12:00:00Z";
const far = "2026-12-30T12:00:00Z";
function item(p: Partial<CalendarItem> = {}): CalendarItem {
  return { id: "a", channel: "INSTAGRAM_POST", status: "PLANNED", scheduledFor: null, publishIssue: null, latest: null, ...p };
}

describe("isOverdue", () => {
  it("is a post in the pipeline whose date has passed", () => {
    for (const status of ["PLANNED", "BRIEF_READY", "DRAFT_REVIEW", "AWAITING_APPROVAL", "APPROVED"]) expect(isOverdue(item({ status, scheduledFor: past }), now)).toBe(true);
  });
  it("is not a future, undated, scheduled or published post", () => {
    expect(isOverdue(item({ scheduledFor: soon }), now)).toBe(false);
    expect(isOverdue(item(), now)).toBe(false);
    expect(isOverdue(item({ status: "SCHEDULED", scheduledFor: past }), now)).toBe(false);
    expect(isOverdue(item({ status: "PUBLISHED", scheduledFor: past }), now)).toBe(false);
  });
  it("is a by-hand story past its time, in any status", () => {
    expect(isOverdue(item({ status: "SCHEDULED", byHand: true, scheduledFor: past }), now)).toBe(true);
    expect(isOverdue(item({ status: "SCHEDULED", byHand: true, scheduledFor: soon }), now)).toBe(false);
  });
});

describe("isBlocked", () => {
  it("is BLOCKED, a blocker check or a publish issue", () => {
    expect(isBlocked(item({ status: "BLOCKED" }))).toBe(true);
    expect(isBlocked(item({ latest: { check: { overall: "BLOCKER" } } }))).toBe(true);
    expect(isBlocked(item({ publishIssue: "FAILED" }))).toBe(true);
    expect(isBlocked(item({ latest: { check: { overall: "WARN" } } }))).toBe(false);
    expect(isBlocked(item())).toBe(false);
  });
  it("ignores finished posts", () => {
    expect(isBlocked(item({ status: "PUBLISHED", latest: { check: { overall: "BLOCKER" } } }))).toBe(false);
    expect(isBlocked(item({ status: "REVIEWED", publishIssue: "CHECK" }))).toBe(false);
  });
});

describe("isThisWeek", () => {
  it("is an unfinished post due within seven days", () => {
    expect(isThisWeek(item({ scheduledFor: soon }), now)).toBe(true);
    expect(isThisWeek(item({ status: "PUBLISHED", scheduledFor: soon }), now)).toBe(false);
    expect(isThisWeek(item({ scheduledFor: far }), now)).toBe(false);
    expect(isThisWeek(item({ scheduledFor: past }), now)).toBe(false);
  });
});

describe("filterItems", () => {
  const items = [
    item({ id: "1", channel: "INSTAGRAM_POST", status: "AWAITING_APPROVAL", scheduledFor: soon, owner: { id: "me", name: "Me" }, campaignId: "c1" }),
    item({ id: "2", channel: "FACEBOOK_POST", status: "PUBLISHED", scheduledFor: soon, owner: null }),
    item({ id: "3", channel: "INSTAGRAM_POST", status: "PLANNED", scheduledFor: far, campaignId: "c2" }),
    item({ id: "4", status: "BLOCKED", scheduledFor: past, owner: { id: "other", name: null } }),
    item({ id: "5", status: "APPROVED", scheduledFor: past, owner: { id: "me", name: "Me" } }),
  ];
  const ids = (f: Parameters<typeof filterItems>[1]) => filterItems(items, f, "me", now).map((i) => i.id);
  it("keeps everything with no filter", () => expect(ids({})).toEqual(["1", "2", "3", "4", "5"]));
  it("filters by channel, status group and campaign", () => {
    expect(ids({ channel: "FACEBOOK_POST" })).toEqual(["2"]);
    expect(ids({ status: "awaiting" })).toEqual(["1"]);
    expect(ids({ campaignId: "c2" })).toEqual(["3"]);
  });
  it("filters by owner, treating a missing owner as unassigned", () => {
    expect(ids({ owner: "me" })).toEqual(["1", "5"]);
    expect(ids({ owner: "none" })).toEqual(["2", "3"]);
  });
  it("filters by need", () => {
    expect(ids({ need: "overdue" })).toEqual(["5"]);
    expect(ids({ need: "blocked" })).toEqual(["4"]);
    expect(ids({ need: "week" })).toEqual(["1"]);
  });
  it("keeps everything for owner me when me is unknown", () => expect(filterItems(items, { owner: "me" }, null, now).map((i) => i.id)).toEqual(["1", "2", "3", "4", "5"]));
  it("combines filters", () => expect(ids({ channel: "INSTAGRAM_POST", owner: "none" })).toEqual(["3"]));
});

describe("ownerLabel", () => {
  it("says Unassigned only for posts the Unassigned filter keeps", () => {
    expect(ownerLabel(null)).toBe("Unassigned");
    expect(ownerLabel(undefined)).toBe("Unassigned");
    expect(ownerLabel({ id: "u1", name: "Ann" })).toBe("Ann");
    expect(ownerLabel({ id: "u2", name: null })).toBe("A team member");
    expect(ownerLabel({ id: "u2", name: "" })).toBe("A team member");
  });
});

describe("URL", () => {
  it("round trips", () => {
    const f = { channel: "INSTAGRAM_POST", status: "awaiting", campaignId: "c1", owner: "me", need: "week" } as const;
    expect(filterFromSearch(new URLSearchParams(filterToSearch(f)))).toEqual(f);
  });
  it("withFilter keeps post= and panel= and replaces cf_ params", () => {
    const q = new URLSearchParams(withFilter("?post=p1&panel=content&cf_need=week", { owner: "me" }));
    expect(q.get("post")).toBe("p1");
    expect(q.get("panel")).toBe("content");
    expect(q.get("cf_need")).toBeNull();
    expect(q.get("cf_owner")).toBe("me");
  });
  it("writes nothing for an empty filter and drops unknown values", () => {
    expect(filterToSearch({})).toBe("");
    expect(filterFromSearch(new URLSearchParams("cf_status=nope&cf_owner=x&cf_need=y&cf_channel="))).toEqual({});
  });
});
