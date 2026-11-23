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
  owner: { id: "u1", name: "Ana", gone: false },
  reviewer: { id: "u2", name: "Ben", gone: false },
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
