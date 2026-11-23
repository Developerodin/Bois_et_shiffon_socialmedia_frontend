import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listsCare, onTasksChanged, tasksApi, type TasksChanged } from "@/lib/tasks-api";
import { peekReaction } from "@/components/tasks/task-views";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const seen: TasksChanged[] = [];
let off = () => {};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", new EventTarget());
  seen.length = 0;
  off = onTasksChanged((d) => seen.push(d));
});
afterEach(() => {
  off();
  vi.unstubAllGlobals();
});

describe("tasks:changed from the API", () => {
  it("an action announces the task it returned", async () => {
    const task = { id: "t1", title: "x" };
    fetchMock.mockResolvedValueOnce(json({ task }));
    await tasksApi.act("/api/b", "t1", { action: "start" });
    expect(seen).toEqual([{ taskId: "t1", kind: "task", task }]);
  });
  it("a refused write announces nothing", async () => {
    fetchMock.mockResolvedValueOnce(json({ title: "Refused", detail: "No" }, 409));
    await expect(tasksApi.act("/api/b", "t1", { action: "start" })).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(json({ title: "Refused", detail: "No" }, 403));
    await expect(tasksApi.addItem("/api/b", "t1", "Line")).rejects.toThrow();
    expect(seen).toEqual([]);
  });
  it("a checklist reorder announces once, after every line is saved", async () => {
    fetchMock.mockImplementation(async () => json({ item: { id: "i" } }));
    await tasksApi.reorderItems("/api/b", "t1", [
      { itemId: "a", position: 0 },
      { itemId: "b", position: 1 },
      { itemId: "c", position: 2 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([{ taskId: "t1", kind: "checklist" }]);
  });
  it("a comment is announced as a comment, which the lists skip", async () => {
    fetchMock.mockResolvedValueOnce(json({ comment: { id: "c1" } }, 201));
    await tasksApi.comment("/api/b", "t1", "Hi", false);
    expect(seen).toEqual([{ taskId: "t1", kind: "comment" }]);
    expect(listsCare(seen[0])).toBe(false);
    expect(listsCare({ kind: "checklist", taskId: "t1" })).toBe(true);
  });
});

describe("the open peek", () => {
  const task = { id: "t1" } as TasksChanged["task"];
  it("shows the task a write returned instead of reading it again", () => {
    expect(peekReaction({ kind: "task", taskId: "t1", task }, "t1")).toBe("show");
  });
  it("reads again for its own checklist or photos, or a change with no task named", () => {
    expect(peekReaction({ kind: "checklist", taskId: "t1" }, "t1")).toBe("reload");
    expect(peekReaction({ kind: "attachment", taskId: "t1" }, "t1")).toBe("reload");
    expect(peekReaction({ kind: "project" }, "t1")).toBe("reload");
  });
  it("ignores comments and other tasks", () => {
    expect(peekReaction({ kind: "comment", taskId: "t1" }, "t1")).toBe("skip");
    expect(peekReaction({ kind: "task", taskId: "t2", task: { id: "t2" } as TasksChanged["task"] }, "t1")).toBe("skip");
  });
});
