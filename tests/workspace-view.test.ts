import { describe, expect, it } from "vitest";
import { RUN_ID_PATTERN } from "@/shared";
import { entryToView, parseRecent, viewToEntry } from "@/lib/recent";
import { agentLabel, namesItem, parseViewParts, peekCrumb, peekKey, peekTitle, viewFromSearch, viewToSearch, withoutOpenItem } from "@/lib/workspace-view";

describe("workspace view URL", () => {
  it("round-trips an agent's run", () => {
    const v = viewFromSearch("?agent=planner&runId=cm_9-x");
    expect(v).toEqual({ kind: "agent", key: "planner", runId: "cm_9-x" });
    expect(viewToSearch(v, "", "/")).toBe("?agent=planner&runId=cm_9-x");
  });
  it("drops a runId the server would refuse", () => {
    expect(viewFromSearch("?agent=planner&runId=a%20b")).toEqual({ kind: "agent", key: "planner" });
    expect(viewFromSearch(`?agent=planner&runId=${"x".repeat(41)}`)).toEqual({ kind: "agent", key: "planner" });
  });
  it("clears runId when the view changes and keeps other parameters", () => {
    expect(viewToSearch({ kind: "content", id: "p1" }, "?agent=planner&runId=r1&panel=content", "/")).toBe("?panel=content&post=p1");
    expect(viewToSearch({ kind: "home" }, "?agent=planner&runId=r1", "/")).toBe("/");
  });
  it("checks runId with the pattern shared with the server", () => {
    expect(viewFromSearch(`?agent=a&runId=${"x".repeat(40)}`)).toEqual({ kind: "agent", key: "a", runId: "x".repeat(40) });
    expect(RUN_ID_PATTERN.test("x".repeat(41))).toBe(false);
    expect(viewFromSearch(`?agent=a&runId=${"x".repeat(41)}`)).toEqual({ kind: "agent", key: "a" });
  });
});

describe("workspace view validation", () => {
  it("opens known documents and drops unknown ones", () => {
    expect(viewFromSearch("?doc=brand-voice")).toEqual({ kind: "doc", doc: "brand-voice" });
    expect(viewFromSearch("?doc=secrets")).toEqual({ kind: "home" });
    expect(viewFromSearch("?doc=__proto__")).toEqual({ kind: "home" });
  });
  it("drops post and competitor ids the server never makes", () => {
    expect(viewFromSearch("?post=cm_1-a")).toEqual({ kind: "content", id: "cm_1-a" });
    expect(viewFromSearch("?post=a%2Fb")).toEqual({ kind: "home" });
    expect(viewFromSearch(`?post=${"x".repeat(65)}`)).toEqual({ kind: "home" });
    expect(viewFromSearch("?competitor=c1")).toEqual({ kind: "competitor", id: "c1" });
    expect(viewFromSearch("?competitor=%3Cscript%3E")).toEqual({ kind: "home" });
  });
  it("accepts agent keys of the agent shape only", () => {
    expect(viewFromSearch("?agent=seo")).toEqual({ kind: "agent", key: "seo" });
    expect(viewFromSearch("?agent=Planner")).toEqual({ kind: "home" });
    expect(viewFromSearch(`?agent=a${"b".repeat(40)}`)).toEqual({ kind: "home" });
    expect(viewFromSearch("?agent=1x")).toEqual({ kind: "home" });
  });
  it("never starts a run from the URL", () => {
    expect(viewFromSearch("?agent=scout&run=1")).toEqual({ kind: "agent", key: "scout" });
    expect(viewFromSearch("?agent=scout&run=true&runId=r1")).toEqual({ kind: "agent", key: "scout", runId: "r1" });
    expect(viewToSearch({ kind: "agent", key: "scout", run: true }, "", "/")).toBe("?agent=scout");
  });
  it("builds a view from a kind and id, as Recent stores them", () => {
    expect(parseViewParts("post", "p1")).toEqual({ kind: "content", id: "p1" });
    expect(parseViewParts("doc", "brand-voice")).toEqual({ kind: "doc", doc: "brand-voice" });
    expect(parseViewParts("agent", "planner")).toEqual({ kind: "agent", key: "planner" });
    expect(parseViewParts("competitor", "c1")).toEqual({ kind: "competitor", id: "c1" });
    expect(parseViewParts("run", "x")).toEqual({ kind: "home" });
    expect(parseViewParts("post", "")).toEqual({ kind: "home" });
  });
});

describe("peek labels", () => {
  it("names where each item lives", () => {
    expect(peekCrumb({ kind: "content", id: "p1" })).toBe("Content calendar › Post");
    expect(peekCrumb({ kind: "doc", doc: "brand-voice" })).toBe("Context › Document");
    expect(peekCrumb({ kind: "agent", key: "seo" })).toBe("Agents");
    expect(peekCrumb({ kind: "competitor", id: "c1" })).toBe("Competitors");
  });
  it("uses the known title, else a plain fallback", () => {
    expect(peekTitle({ kind: "content", id: "p1" }, "Spring launch")).toBe("Spring launch");
    expect(peekTitle({ kind: "content", id: "p1" }, null)).toBe("Post");
    expect(peekTitle({ kind: "doc", doc: "brand-voice" }, "  ")).toBe("Document");
    expect(peekTitle({ kind: "agent", key: "competitors" }, undefined)).toBe("Competitors agent");
    expect(peekTitle({ kind: "competitor", id: "c1" }, null)).toBe("Competitor");
  });
  it("keys an item by kind and id", () => {
    expect(peekKey({ kind: "content", id: "p1" })).toBe("content:p1");
    expect(peekKey({ kind: "agent", key: "seo", runId: "r1" })).toBe("agent:seo");
    expect(peekKey({ kind: "doc", doc: "brand-voice" })).toBe("doc:brand-voice");
  });
});

describe("agent label", () => {
  it("reads as a name, never the raw key", () => {
    expect(agentLabel("competitors")).toBe("Competitors agent");
    expect(agentLabel("content-ideas")).toBe("Content ideas agent");
    expect(agentLabel("")).toBe("Agent");
  });
});

describe("brand switch", () => {
  it("drops the open item from the Overview's URL and keeps the rest", () => {
    expect(withoutOpenItem("?post=p1&panel=content", "/")).toBe("?panel=content");
    expect(withoutOpenItem("?agent=seo&runId=r1", "/")).toBe("/");
  });
  it("drops the old brand's campaign filter, open item or not, and keeps other filters", () => {
    expect(withoutOpenItem("?cf_campaignId=c1&cf_status=draft", "/")).toBe("?cf_status=draft");
    expect(withoutOpenItem("?post=p1&cf_campaignId=c1", "/")).toBe("/");
  });
  it("leaves the URL alone when nothing is open or the page isn't the Overview", () => {
    expect(withoutOpenItem("?panel=content", "/")).toBeNull();
    expect(withoutOpenItem("", "/")).toBeNull();
    expect(withoutOpenItem("?post=p1", "/reels")).toBeNull();
  });
});

describe("item named in the URL", () => {
  it("tells a bad item link from no item", () => {
    expect(namesItem("?doc=secrets")).toBe(true);
    expect(namesItem("?agent=Bad")).toBe(true);
    expect(namesItem("?panel=content&cf_need=overdue")).toBe(false);
    expect(namesItem("?runId=r1")).toBe(false);
  });
});

describe("panel in the peek (?peek=)", () => {
  it("opens a known panel and drops an unknown one", () => {
    expect(viewFromSearch("?peek=analytics")).toEqual({ kind: "panel", id: "analytics" });
    expect(viewFromSearch("?peek=nope")).toEqual({ kind: "home" });
    expect(namesItem("?peek=nope")).toBe(true);
  });
  it("round-trips and keeps ?panel= apart", () => {
    expect(viewToSearch({ kind: "panel", id: "feed" }, "?panel=content", "/")).toBe("?panel=content&peek=feed");
    expect(viewToSearch({ kind: "home" }, "?peek=feed&panel=content", "/")).toBe("?panel=content");
    expect(viewFromSearch("?panel=content")).toEqual({ kind: "home" });
  });
  it("comes after the other item parameters", () => {
    expect(viewFromSearch("?peek=feed&competitor=c1")).toEqual({ kind: "competitor", id: "c1" });
  });
  it("is dropped with the open item", () => {
    expect(withoutOpenItem("?peek=feed&panel=log", "/")).toBe("?panel=log");
  });
  it("has a crumb, a fallback title and a stable key", () => {
    const v = { kind: "panel", id: "log" } as const;
    expect(peekCrumb(v)).toBe("Panel");
    expect(peekTitle(v, "Activity")).toBe("Activity");
    expect(peekKey(v)).toBe("panel:log");
  });
});

describe("task in the peek (?task=)", () => {
  it("task param parses and survives Recent", () => {
    const v = viewFromSearch("?view=mine&task=cm_t-1");
    expect(v).toEqual({ kind: "task", id: "cm_t-1" });
    expect(viewToSearch(v, "?area=website", "/tasks")).toBe("?area=website&task=cm_t-1");
    expect(viewToSearch({ kind: "home" }, "?area=website&task=cm_t-1", "/tasks")).toBe("?area=website");
    const entry = viewToEntry(v, 1_800_000_000_000);
    expect(entry).toEqual({ kind: "task", id: "cm_t-1", at: 1_800_000_000_000 });
    const [back] = parseRecent([entry], 1_800_000_000_000);
    expect(back).toEqual(entry);
    expect(entryToView(back)).toEqual(v);
    expect(peekKey(v)).toBe("task:cm_t-1");
    expect(peekCrumb(v)).toBe("Tasks › Task");
    expect(peekTitle(v, null)).toBe("Task");
    expect(peekTitle(v, "Fix the menu")).toBe("Fix the menu");
  });
  it("bad task id is a bad link", () => {
    expect(viewFromSearch("?task=a%2Fb")).toEqual({ kind: "home" });
    expect(viewFromSearch(`?task=${"x".repeat(65)}`)).toEqual({ kind: "home" });
    expect(viewFromSearch("?task=")).toEqual({ kind: "home" });
    expect(namesItem("?task=a%2Fb")).toBe(true);
    expect(parseRecent([{ kind: "task", id: "a/b", at: 1 }], 1)).toEqual([]);
    expect(withoutOpenItem("?task=t1&panel=log", "/")).toBe("?panel=log");
  });
  it("a brand switch drops the open task on the task pages too", () => {
    expect(withoutOpenItem("?area=website&task=t1", "/tasks")).toBe("?area=website");
    expect(withoutOpenItem("?task=t1", "/projects/p1")).toBe("/projects/p1");
    expect(withoutOpenItem("?area=seo", "/tasks")).toBeNull();
    expect(withoutOpenItem("?task=t1", "/reels")).toBeNull();
  });
});
