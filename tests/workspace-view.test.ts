import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUN_ID_PATTERN } from "@/shared";
import { entryToView, parseRecent, viewToEntry } from "@/lib/recent";
import { agentLabel, calendarRedirect, competitorsRedirect, namesItem, navigate, parseViewParts, peekCrumb, peekKey, peekTitle, shallowClick, viewFromSearch, viewToSearch, withoutOpenItem, PANEL_IDS, type PanelId } from "@/lib/workspace-view";
import { sanitize, type Layout } from "@/components/workspace/panel-layout";

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
    expect(peekCrumb({ kind: "content", id: "p1" })).toBe("Review post");
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
  it("leaves cf_ params on the Overview alone, since only the Content calendar page reads them", () => {
    expect(withoutOpenItem("?cf_campaignId=c1&cf_status=draft", "/")).toBeNull();
    expect(withoutOpenItem("?post=p1&cf_campaignId=c1", "/")).toBe("?cf_campaignId=c1");
  });
  it("drops the open post and the old brand's campaign from the Content calendar page, keeping other filters", () => {
    expect(withoutOpenItem("?cf_need=week&post=p1", "/calendar")).toBe("?cf_need=week");
    expect(withoutOpenItem("?cf_campaignId=c1", "/calendar")).toBe("/calendar");
    expect(withoutOpenItem("?cf_status=draft", "/calendar")).toBeNull();
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
  it("no longer opens Competitors, which is a page now", () => {
    expect(PANEL_IDS).not.toContain("competitors");
    expect(viewFromSearch("?peek=competitors")).toEqual({ kind: "home" });
    expect(namesItem("?peek=competitors")).toBe(true);
  });
  it("sends old Competitors panel links to the page, keeping a well-formed competitor", () => {
    expect(competitorsRedirect("competitors", undefined)).toBe("/competitors");
    expect(competitorsRedirect("competitors", "c_1-x")).toBe("/competitors?competitor=c_1-x");
    // A malformed id or a repeated parameter is dropped, never passed on.
    expect(competitorsRedirect("competitors", "../x?y")).toBe("/competitors");
    expect(competitorsRedirect("competitors", ["c1", "c2"])).toBe("/competitors");
    expect(competitorsRedirect("competitors", "")).toBe("/competitors");
    expect(competitorsRedirect("content", "c1")).toBeNull();
    expect(competitorsRedirect(undefined, "c1")).toBeNull();
    expect(competitorsRedirect(["competitors"], undefined)).toBeNull();
  });
  it("drops the open competitor or agent from /competitors on a brand switch", () => {
    expect(withoutOpenItem("?competitor=c1", "/competitors")).toBe("/competitors");
    expect(withoutOpenItem("?agent=competitors&runId=r1", "/competitors")).toBe("/competitors");
    expect(withoutOpenItem("", "/competitors")).toBeNull();
  });
  it("no longer opens the content calendar, which is a page now", () => {
    expect(PANEL_IDS).not.toContain("content");
    expect(viewFromSearch("?peek=content")).toEqual({ kind: "home" });
  });
  it("sends old content calendar panel links to the page, keeping a well-formed post and the known filters", () => {
    expect(calendarRedirect({ panel: "content" })).toBe("/calendar");
    expect(calendarRedirect({ peek: "content" })).toBe("/calendar");
    expect(calendarRedirect({ panel: "content", post: "cm_1-a" })).toBe("/calendar?post=cm_1-a");
    expect(calendarRedirect({ peek: "content", post: "p1", cf_need: "week", cf_campaignId: "c1" })).toBe("/calendar?cf_campaignId=c1&cf_need=week&post=p1");
    // A malformed or repeated post, an unknown filter value and other parameters are dropped, never passed on.
    expect(calendarRedirect({ panel: "content", post: "../x?y" })).toBe("/calendar");
    expect(calendarRedirect({ panel: "content", post: ["p1", "p2"] })).toBe("/calendar");
    expect(calendarRedirect({ panel: "content", cf_need: "soon", cf_owner: ["me"], doc: "x" })).toBe("/calendar");
    // A status that is only an object property is not a status group.
    expect(calendarRedirect({ panel: "content", cf_status: "toString" })).toBe("/calendar");
    expect(calendarRedirect({ panel: "content", cf_status: "__proto__", cf_need: "week" })).toBe("/calendar?cf_need=week");
    // Not an old calendar link: a bare post stays in the Overview's peek.
    expect(calendarRedirect({ post: "p1" })).toBeNull();
    expect(calendarRedirect({ panel: "competitors" })).toBeNull();
    expect(calendarRedirect({ panel: ["content"] })).toBeNull();
    expect(calendarRedirect({})).toBeNull();
  });
  it("drops the content calendar from a layout saved with it, and the column it leaves empty", () => {
    const saved = { columns: [{ id: "a", size: 1.1, panels: ["ideas"] }, { id: "b", size: 1.8, panels: ["home"] }, { id: "c", size: 1.1, panels: ["content"] }], collapsed: ["content", "ideas"] };
    const fallback: Layout<PanelId> = { columns: [{ id: "x", size: 1, panels: ["home"] }], collapsed: [] };
    const l = sanitize(saved, [...PANEL_IDS], fallback);
    expect(l.columns.map((c) => c.panels)).toEqual([["ideas"], ["home"]]);
    expect(l.collapsed).toEqual(["ideas"]);
  });
  it("drops Competitors from a layout saved with it, and the column it leaves empty", () => {
    const saved = { columns: [{ id: "a", size: 1, panels: ["context"] }, { id: "b", size: 1.3, panels: ["analytics"] }, { id: "c", size: 1.3, panels: ["competitors"] }], collapsed: ["competitors"] };
    const fallback: Layout<PanelId> = { columns: [{ id: "x", size: 1, panels: ["home"] }], collapsed: [] };
    const l = sanitize(saved, [...PANEL_IDS], fallback);
    expect(l.columns.map((c) => c.panels)).toEqual([["context"], ["analytics"]]);
    expect(l.collapsed).toEqual([]);
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
  it("a brand switch leaves a project's page for the projects list", () => {
    expect(withoutOpenItem("", "/projects/p1")).toBe("/projects");
    expect(withoutOpenItem("?view=open", "/projects/p1")).toBe("/projects");
    expect(withoutOpenItem("", "/projects")).toBeNull();
  });
  it("a brand switch drops the open task on the task pages too", () => {
    expect(withoutOpenItem("?area=website&task=t1", "/tasks")).toBe("?area=website");
    expect(withoutOpenItem("?task=t1", "/projects/p1")).toBe("/projects");
    expect(withoutOpenItem("?area=seo", "/tasks")).toBeNull();
    expect(withoutOpenItem("?task=t1", "/reels")).toBeNull();
  });
});

describe("navigate and shallowClick", () => {
  const history = { pushState: vi.fn(), replaceState: vi.fn() };
  const router = { push: vi.fn(), replace: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { history });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("changes only the query through the history, and another page through the router", () => {
    navigate(router, "/tasks?area=seo", "/tasks", "replace");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/tasks?area=seo");
    navigate(router, "/tasks?task=t1", "/tasks");
    expect(history.pushState).toHaveBeenCalledWith(null, "", "/tasks?task=t1");
    navigate(router, "/projects/p1", "/tasks");
    expect(router.push).toHaveBeenCalledWith("/projects/p1", { scroll: false });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("leaves new-tab and other-page clicks to the link", () => {
    const click = (o: Partial<{ button: number; ctrlKey: boolean; metaKey: boolean }> = {}) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...o });
    const plain = click();
    shallowClick(plain, "/tasks?task=t1", "/tasks");
    expect(plain.preventDefault).toHaveBeenCalled();
    expect(history.pushState).toHaveBeenCalledWith(null, "", "/tasks?task=t1");
    for (const e of [click({ ctrlKey: true }), click({ metaKey: true }), click({ button: 1 })]) {
      shallowClick(e, "/tasks?task=t1", "/tasks");
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    const away = click();
    shallowClick(away, "/projects?task=t1", "/tasks");
    expect(away.preventDefault).not.toHaveBeenCalled();
  });
});
