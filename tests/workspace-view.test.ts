import { describe, expect, it } from "vitest";
import { RUN_ID_PATTERN } from "@/shared";
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
    expect(peekCrumb({ kind: "content", id: "p1" })).toBe("Calendar › Post");
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
