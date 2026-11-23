import { describe, expect, it } from "vitest";
import type { SearchResultsDto } from "@/shared";
import { groupResults, resultHref } from "@/components/shell/search-box";

const empty: SearchResultsDto = { tasks: [], projects: [], posts: [], products: [], campaigns: [] };

describe("search results", () => {
  it("results grouped in kind order and empty kinds hidden", () => {
    const r: SearchResultsDto = {
      ...empty,
      campaigns: [{ kind: "campaign", id: "c1", title: "Spring" }],
      tasks: [{ kind: "task", id: "t1", title: "Fix menu" }, { kind: "task", id: "t2", title: "Fix footer" }],
      posts: [{ kind: "post", id: "p1", title: "New arrivals" }],
    };
    const groups = groupResults(r);
    expect(groups.map((g) => g.label)).toEqual(["Tasks", "Posts", "Campaigns"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["t1", "t2"]);
    expect(groupResults(empty)).toEqual([]);
  });

  it("each kind opens where it lives", () => {
    expect(resultHref({ kind: "task", id: "t1", title: "" }, "/library", "")).toBe("/tasks?task=t1");
    expect(resultHref({ kind: "task", id: "t1", title: "" }, "/", "?panel=content")).toBe("/?panel=content&task=t1");
    expect(resultHref({ kind: "project", id: "w1", title: "" }, "/", "")).toBe("/projects/w1");
    expect(resultHref({ kind: "post", id: "p1", title: "" }, "/library", "")).toBe("/?post=p1");
    expect(resultHref({ kind: "post", id: "p1", title: "" }, "/", "?task=t1")).toBe("/?post=p1");
    expect(resultHref({ kind: "product", id: "x", title: "Silk scarf" }, "/", "")).toBe("/products?q=Silk+scarf");
    expect(resultHref({ kind: "campaign", id: "c1", title: "" }, "/library", "")).toBe("/?panel=content&cf_campaignId=c1");
  });
});

describe("quick create", () => {
  it("offers each item only with its permission", async () => {
    const { quickCreateItems } = await import("@/components/shell/quick-create");
    expect(quickCreateItems(["tasks.read"])).toEqual([]);
    expect(quickCreateItems(["content.create"]).map((i) => i.label)).toEqual(["Post from a brief"]);
    expect(quickCreateItems(["tasks.manage", "content.create"]).map((i) => i.label)).toEqual(["Task", "Post from a brief", "Project", "Tasks from a note"]);
  });
});

describe("search's empty answer", () => {
  it("names the term it answers, and says Searching… once the typing has moved on", async () => {
    const { noMatchText } = await import("@/components/shell/search-box");
    expect(noMatchText("silk", " silk ")).toBe("Nothing matches “silk”.");
    expect(noMatchText("silk", "silk s")).toBe("Searching…");
  });
});
