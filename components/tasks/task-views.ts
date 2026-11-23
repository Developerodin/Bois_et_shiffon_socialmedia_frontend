/** The /tasks page's vocabulary and rules, kept free of React so they can be tested. */
import type { TaskAction, TaskDto, TaskPersonDto } from "@/shared";

export const TASK_LIST_VIEWS = [
  { value: "mine", label: "Mine" },
  { value: "approvals", label: "Approvals" },
  { value: "due-today", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "blocked", label: "Blocked" },
  { value: "open", label: "All open" },
  { value: "done", label: "Done (30 days)" },
] as const;
export type TaskListView = (typeof TASK_LIST_VIEWS)[number]["value"];

/** Area tabs; the value is the lower-case `?area=` the nav links use ("" is All). */
export const AREA_TABS = [
  { value: "", label: "All" },
  { value: "content", label: "Content" },
  { value: "website", label: "Website" },
  { value: "seo", label: "SEO" },
] as const;
export type AreaParam = (typeof AREA_TABS)[number]["value"];

export function areaParam(s: string | null | undefined): AreaParam {
  return AREA_TABS.some((t) => t.value === s) ? (s as AreaParam) : "";
}

export type TaskLayout = "list" | "board";

/** The view and layout remembered per browser. Bump the version when the stored shape changes. */
export const TASKS_VIEW_KEY = "tasks.view.v1";

export function readSaved(raw: string | null): { view: TaskListView; layout: TaskLayout } {
  let v: { view?: unknown; layout?: unknown } = {};
  try {
    v = raw ? (JSON.parse(raw) as typeof v) ?? {} : {};
  } catch {}
  return {
    view: TASK_LIST_VIEWS.some((o) => o.value === v.view) ? (v.view as TaskListView) : "mine",
    layout: v.layout === "board" ? "board" : "list",
  };
}

/** The GET tasks path (relative to the brand) for a view and its filters. */
export function tasksQuery(q: { view: TaskListView; area?: AreaParam; workProjectId?: string }): string {
  const p = new URLSearchParams({ view: q.view });
  if (q.area) p.set("area", q.area);
  if (q.workProjectId) p.set("workProjectId", q.workProjectId);
  return `tasks?${p}`;
}

export const STATUS_LABEL: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};
export const PRIORITY_LABEL: Record<string, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
export const AREA_LABEL: Record<string, string> = { CONTENT: "Content", WEBSITE: "Website", SEO: "SEO", GENERAL: "General" };

/** The board's columns: the open statuses and Done. Cancelled tasks aren't on the board. */
export const BOARD_COLUMNS = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type BoardStatus = (typeof BOARD_COLUMNS)[number];

export function ownerLabel(owner: TaskPersonDto | null): string {
  if (!owner) return "Unassigned";
  return owner.gone ? "No longer on this business" : owner.name;
}

/** A due day (YYYY-MM-DD) as "24 Nov", read as a calendar day so no time zone shifts it. */
export function dueLabel(dueOn: string | null): string {
  if (!dueOn) return "No date";
  return new Date(`${dueOn}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

const NOT_YOURS = "Only the task's owner or a manager can move it.";

/**
 * What dragging `task` onto a column does: the action to send, or why not. Reads only `task.actions` (the server's
 * answer for this person); the refusal texts explain, they never grant. Onto In Review the board then asks for a reviewer.
 * The caller skips a drop on the task's own column.
 */
export function boardMove(task: TaskDto, to: BoardStatus): { action: TaskAction } | { refused: string } {
  if (task.status === "IN_REVIEW") return { refused: "A task in review moves on when the reviewer approves it or asks for changes." };
  const finished = task.status === "DONE" || task.status === "CANCELLED";
  if (finished && to !== "TODO") return { refused: "Reopen it first: drag it to To do." };
  const want: Record<BoardStatus, TaskAction | null> = {
    TODO: finished ? "reopen" : null,
    IN_PROGRESS: task.status === "TODO" ? "start" : null,
    IN_REVIEW: "submitForReview",
    DONE: "markDone",
  };
  const action = want[to];
  if (!action) return { refused: "A started task can't go back to To do." };
  if (task.actions.includes(action)) return { action };
  if (action === "markDone" && task.reviewer) return { refused: "A reviewed task is finished by the reviewer's approval." };
  return { refused: NOT_YOURS };
}

/** Fired after a task changes here, so other lists of tasks on the page reload. */
export const TASKS_CHANGED = "tasks:changed";

/** A project's progress (done of all but cancelled) as words: "3 of 8 done", or "No tasks yet". */
export function progressLabel(p: { done: number; total: number }): string {
  return p.total ? `${p.done} of ${p.total} done` : "No tasks yet";
}

/** The same as a whole percent for the bar; 0 with no tasks. */
export function progressPercent(p: { done: number; total: number }): number {
  return p.total ? Math.round((p.done / p.total) * 100) : 0;
}

export const PROJECT_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", DONE: "Done", ARCHIVED: "Archived" };
