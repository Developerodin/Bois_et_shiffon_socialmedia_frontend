import { describe, expect, it } from "vitest";
import type { TaskDto } from "@/shared";
import { AREA_TABS, boardMove, ownerFromValue, ownerLabel, ownerValue, readSaved, sourceParam, tasksQuery } from "@/components/tasks/task-views";

const task = (over: Partial<TaskDto> = {}): TaskDto => ({
  id: "t1",
  title: "Fix the menu",
  description: null,
  status: "IN_PROGRESS",
  priority: "NORMAL",
  areas: ["WEBSITE"],
  dueOn: null,
  blockedReason: null,
  url: null,
  changeKind: null,
  acceptanceCriteria: null,
  previewUrl: null,
  checkedLiveAt: null,
  checkedLiveById: null,
  recheckOn: null,
  completedAt: null,
  workProjectId: null,
  contentItemId: null,
  findingKind: null,
  findingUrls: [],
  findingClearedAt: null,
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:00:00.000Z",
  owner: { id: "u1", name: "Ana", gone: false, client: false },
  ownerRole: null,
  reviewer: null,
  blockedOn: null,
  project: null,
  post: null,
  checklist: { done: 0, total: 0 },
  actions: [],
  ...over,
});

describe("boardMove", () => {
  it("board refuses a move not in actions", () => {
    const r = boardMove(task({ status: "TODO", actions: [] }), "IN_PROGRESS");
    expect(r).toEqual({ refused: expect.stringMatching(/owner or a manager/) });
  });

  it("board asks for a reviewer on In Review", () => {
    expect(boardMove(task({ actions: ["submitForReview", "markDone"] }), "IN_REVIEW")).toEqual({ action: "submitForReview" });
  });

  it("starts a to-do and reopens a finished task when the server allows it", () => {
    expect(boardMove(task({ status: "TODO", actions: ["start"] }), "IN_PROGRESS")).toEqual({ action: "start" });
    expect(boardMove(task({ status: "DONE", actions: ["reopen"] }), "TODO")).toEqual({ action: "reopen" });
  });

  it("refuses moves off In Review with the reason", () => {
    const r = boardMove(task({ status: "IN_REVIEW", actions: ["approve", "requestChanges"] }), "DONE");
    expect(r).toEqual({ refused: expect.stringMatching(/reviewer/) });
  });

  it("refuses Done for a reviewed task with the reason", () => {
    const r = boardMove(task({ reviewer: { id: "u2", name: "Bo", gone: false, client: false }, actions: ["submitForReview"] }), "DONE");
    expect(r).toEqual({ refused: "A reviewed task is finished by the reviewer's approval." });
  });

  it("refuses moving a started task back to To do", () => {
    expect(boardMove(task({ actions: ["markDone"] }), "TODO")).toEqual({ refused: expect.any(String) });
  });
});

describe("ownerLabel", () => {
  it("names the owner, flags one who left, and says Unassigned", () => {
    expect(ownerLabel({ id: "u1", name: "Ana", gone: false, client: false })).toBe("Ana");
    expect(ownerLabel({ id: "u1", name: "Ana", gone: true, client: false })).toBe("No longer on this business");
    expect(ownerLabel(null)).toBe("Unassigned");
  });

  it("names the role when a role holds the task", () => {
    expect(ownerLabel(null, { name: "Creators" })).toBe("Creators");
    expect(ownerLabel(null, null)).toBe("Unassigned");
  });
});

describe("owner picker value", () => {
  const ana = { id: "u1", name: "Ana", gone: false, client: false };
  it("is the person's id, role:<id> for a role, or blank", () => {
    expect(ownerValue({ owner: ana, ownerRole: null })).toBe("u1");
    expect(ownerValue({ owner: null, ownerRole: { id: "r1", name: "Creators" } })).toBe("role:r1");
    expect(ownerValue({ owner: null, ownerRole: null })).toBe("");
  });

  it("goes back as exactly one owner key", () => {
    expect(ownerFromValue("u1")).toEqual({ ownerId: "u1" });
    expect(ownerFromValue("role:r1")).toEqual({ ownerRoleId: "r1" });
    expect(ownerFromValue("")).toEqual({ ownerId: null });
  });

  it("round-trips", () => {
    for (const t of [{ owner: ana, ownerRole: null }, { owner: null, ownerRole: { id: "r1", name: "Creators" } }]) {
      const v = ownerFromValue(ownerValue(t));
      expect("ownerRoleId" in v ? v.ownerRoleId : v.ownerId).toBe(t.ownerRole?.id ?? t.owner?.id);
    }
  });
});

describe("readSaved", () => {
  it("falls back to Mine as a list on junk", () => {
    expect(readSaved(null)).toEqual({ view: "mine", layout: "list" });
    expect(readSaved("{")).toEqual({ view: "mine", layout: "list" });
    expect(readSaved(JSON.stringify({ view: "nope", layout: "grid" }))).toEqual({ view: "mine", layout: "list" });
  });

  it("falls back to the given view: All open with tasks.all", () => {
    expect(readSaved(null, "open")).toEqual({ view: "open", layout: "list" });
    expect(readSaved(JSON.stringify({ layout: "board" }), "open")).toEqual({ view: "open", layout: "board" });
    expect(readSaved(JSON.stringify({ view: "mine" }), "open")).toEqual({ view: "mine", layout: "list" });
  });

  it("keeps a saved view and layout", () => {
    expect(readSaved(JSON.stringify({ view: "overdue", layout: "board" }))).toEqual({ view: "overdue", layout: "board" });
  });
});

describe("tasksQuery", () => {
  it("sends only the filters that are set", () => {
    expect(tasksQuery({ view: "mine" })).toBe("tasks?view=mine");
    expect(tasksQuery({ view: "open", area: "website", workProjectId: "p 1" })).toBe("tasks?view=open&area=website&workProjectId=p+1");
    expect(tasksQuery({ view: "open", area: "seo", source: "geo" })).toBe("tasks?view=open&area=seo&source=geo");
  });
});

describe("Performance area", () => {
  it("names the SEO area Performance on its tab", () => {
    expect(AREA_TABS.find((t) => t.value === "seo")?.label).toBe("Performance");
  });
  it("reads ?source= only on the Performance tab, and only seo or geo", () => {
    expect(sourceParam("geo", "seo")).toBe("geo");
    expect(sourceParam("seo", "seo")).toBe("seo");
    expect(sourceParam("GEO", "seo")).toBe("");
    expect(sourceParam("geo", "website")).toBe("");
    expect(sourceParam(null, "seo")).toBe("");
  });
});
