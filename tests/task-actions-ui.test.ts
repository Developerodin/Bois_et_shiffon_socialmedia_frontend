import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TaskAction, TaskDetailDto } from "@/shared";
import { ACTION_LABEL, TaskActions } from "@/components/tasks/task-actions";
import { changedFields, draftOf } from "@/components/tasks/task-view";

const task = (over: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: "t1",
  title: "Fix the menu",
  description: null,
  status: "IN_REVIEW",
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
  createdAt: "2026-11-23T10:00:00.000Z",
  updatedAt: "2026-11-23T10:00:00.000Z",
  owner: { id: "u1", name: "Ana", gone: false, client: false },
  reviewer: { id: "u2", name: "Ben", gone: false, client: false },
  blockedOn: null,
  project: null,
  post: null,
  checklist: { done: 0, total: 0 },
  actions: [],
  checklistItems: [],
  attachments: [],
  clientVisible: false,
  viewerIsClient: false,
  ...over,
});

const render = (actions: TaskAction[]) => renderToStaticMarkup(createElement(TaskActions, { base: "/api/x", task: task({ actions }), people: [], onChanged: () => {} }));

describe("task actions", () => {
  it("approve button only when actions include approve", () => {
    expect(render(["approve", "requestChanges"])).toContain(">Approve<");
    expect(render(["approve", "requestChanges"])).toContain(">Request changes<");
    expect(render(["start", "block"])).not.toContain(">Approve<");
    expect(render([])).not.toContain(">Approve<");
  });
  it("shows one button per allowed action and nothing else", () => {
    const html = render(["start", "cancel"]);
    expect(html).toContain(`>${ACTION_LABEL.start}<`);
    expect(html).toContain(`>${ACTION_LABEL.cancel}<`);
    expect(html).not.toContain(`>${ACTION_LABEL.markDone}<`);
    expect(html).not.toContain(`>${ACTION_LABEL.reopen}<`);
  });
});

describe("task edits", () => {
  it("sends only the fields that changed", () => {
    const t = task({ title: "A", dueOn: "2026-11-30", areas: ["WEBSITE"] });
    expect(changedFields(t, {})).toEqual({});
    expect(changedFields(t, { title: "A" })).toEqual({});
    expect(changedFields(t, { title: "B", dueOn: "2026-11-30" })).toEqual({ title: "B" });
    expect(changedFields(t, { dueOn: "" })).toEqual({ dueOn: null });
    expect(changedFields(t, { areas: ["WEBSITE"] })).toEqual({});
    expect(changedFields(t, { areas: ["SEO", "WEBSITE"] })).toEqual({ areas: ["SEO", "WEBSITE"] });
    expect(changedFields(t, { ownerId: "u1" })).toEqual({});
    expect(changedFields(t, { ownerId: "" })).toEqual({ ownerId: null });
    expect(changedFields(t, { description: "  " })).toEqual({});
  });
  it("treats blank website fields as cleared", () => {
    const t = task({ url: "https://shop.example/menu" });
    expect(changedFields(t, { url: "https://shop.example/menu", previewUrl: "", changeKind: "" })).toEqual({});
    expect(changedFields(t, { url: "", changeKind: "MENU" })).toEqual({ url: null, changeKind: "MENU" });
  });
  it("reads the editable fields off a task", () => {
    const d = draftOf(task({ description: "x" }));
    expect(d).toMatchObject({ title: "Fix the menu", description: "x", priority: "NORMAL", areas: ["WEBSITE"], dueOn: "", ownerId: "u1", reviewerId: "u2" });
  });
});

describe("person pickers", () => {
  const people = [
    { id: "u1", name: "Ana", gone: false, client: false },
    { id: "c1", name: "Cleo", gone: false, client: true },
  ];
  it("offer staff only for owner, waiting on and project owner", async () => {
    const { personOptions } = await import("@/components/tasks/task-actions");
    expect(personOptions(people, null, false)).toEqual([{ id: "u1", label: "Ana" }]);
  });
  it("offer clients, labelled, for the reviewer", async () => {
    const { personOptions } = await import("@/components/tasks/task-actions");
    expect(personOptions(people, null, true)).toEqual([
      { id: "u1", label: "Ana" },
      { id: "c1", label: "Cleo (client)" },
    ]);
  });
  it("keep the current person pickable", async () => {
    const { personOptions } = await import("@/components/tasks/task-actions");
    expect(personOptions([], { id: "u9", name: "Old", gone: true, client: false }, false)).toEqual([{ id: "u9", label: "Old (no longer on this business)" }]);
  });
});

describe("missing task controls", () => {
  it("a task's project and linked post are edited like its other fields", () => {
    const t = task({ workProjectId: "w1", contentItemId: null });
    expect(draftOf(t)).toMatchObject({ workProjectId: "w1", contentItemId: "" });
    expect(changedFields(t, { workProjectId: "w1" })).toEqual({});
    expect(changedFields(t, { workProjectId: "" })).toEqual({ workProjectId: null });
    expect(changedFields(t, { workProjectId: "w2", contentItemId: "p1" })).toEqual({ workProjectId: "w2", contentItemId: "p1" });
  });
  it("marking an SEO task done offers a recheck in 4 weeks, to a manager", () => {
    const html = (over: Partial<TaskDetailDto>, canManage: boolean) =>
      renderToStaticMarkup(createElement(TaskActions, { base: "/api/x", task: task({ status: "IN_PROGRESS", actions: ["markDone"], ...over }), people: [], canManage, onChanged: () => {} }));
    expect(html({ areas: ["SEO"] }, true)).toMatch(/checked=""[^>]*\/?>When marked done, check again in 4 weeks/);
    expect(html({ areas: ["SEO"] }, false)).not.toContain("check again");
    expect(html({ areas: ["WEBSITE"] }, true)).not.toContain("check again");
  });
  it("the recheck day is 28 days from the person's today", async () => {
    const { recheckDay } = await import("@/components/tasks/task-views");
    expect(recheckDay(new Date(2026, 10, 23, 23, 30))).toBe("2026-12-21");
    expect(recheckDay(new Date(2026, 1, 1))).toBe("2026-03-01");
  });
  it("a task made on a project's page starts in that project", async () => {
    const { projectIdOf } = await import("@/components/shell/quick-create");
    expect(projectIdOf("/projects/w1")).toBe("w1");
    expect(projectIdOf("/projects")).toBeUndefined();
    expect(projectIdOf("/tasks")).toBeUndefined();
    expect(projectIdOf("/projects/%E0%A4")).toBeUndefined();
  });
});
