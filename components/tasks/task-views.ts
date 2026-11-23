/** The /tasks page's vocabulary and rules, kept free of React so they can be tested. */
import { DONE_DAYS, TASK_VIEWS, type TaskAction, type TaskDto, type TaskPersonDto, type TaskView } from "@/shared";
import type { TasksChanged } from "@/lib/tasks-api";

const VIEW_LABEL: Record<TaskView, string> = {
  mine: "Mine",
  approvals: "Approvals",
  "due-today": "Due today",
  overdue: "Overdue",
  blocked: "Blocked",
  open: "All open",
  done: `Done (${DONE_DAYS} days)`,
};
/** The server's list views (shared TASK_VIEWS), in its order. */
export const TASK_LIST_VIEWS = TASK_VIEWS.map((value) => ({ value, label: VIEW_LABEL[value] }));
export type TaskListView = TaskView;

/** The area's name everywhere it shows. The SEO area reads "Performance"; its value stays SEO (`?area=seo`). */
export const AREA_LABEL: Record<string, string> = { CONTENT: "Content", WEBSITE: "Website", SEO: "Performance", GENERAL: "General" };

/** Area tabs; the value is the lower-case `?area=` the nav links use ("" is All). */
export const AREA_TABS = [
  { value: "", label: "All" },
  { value: "content", label: AREA_LABEL.CONTENT },
  { value: "website", label: AREA_LABEL.WEBSITE },
  { value: "seo", label: AREA_LABEL.SEO },
] as const;
export type AreaParam = (typeof AREA_TABS)[number]["value"];

export function areaParam(s: string | null | undefined): AreaParam {
  return AREA_TABS.some((t) => t.value === s) ? (s as AreaParam) : "";
}

/** The Performance tab's filter by the report a task came from; the value is the lower-case `?source=` ("" is All). */
export const SOURCE_TABS = [
  { value: "", label: "All" },
  { value: "seo", label: "SEO" },
  { value: "geo", label: "GEO" },
] as const;
export type SourceParam = (typeof SOURCE_TABS)[number]["value"];

/** `?source=` counts only on the Performance tab; elsewhere it's All. */
export function sourceParam(s: string | null | undefined, area: AreaParam): SourceParam {
  return area === "seo" && SOURCE_TABS.some((t) => t.value === s) ? (s as SourceParam) : "";
}

export type TaskLayout = "list" | "board";

/** The view and layout remembered per browser. Bump the version when the stored shape changes. */
export const TASKS_VIEW_KEY = "tasks.view.v1";

/** `fallback`: the view with no saved choice (TasksPage: "open" with tasks.all, else "mine"). */
export function readSaved(raw: string | null, fallback: TaskListView = "mine"): { view: TaskListView; layout: TaskLayout } {
  let v: { view?: unknown; layout?: unknown } = {};
  try {
    v = raw ? (JSON.parse(raw) as typeof v) ?? {} : {};
  } catch {}
  return {
    view: TASK_LIST_VIEWS.some((o) => o.value === v.view) ? (v.view as TaskListView) : fallback,
    layout: v.layout === "board" ? "board" : "list",
  };
}

/** The GET tasks path (relative to the brand) for a view and its filters. */
export function tasksQuery(q: { view: TaskListView; area?: AreaParam; source?: SourceParam; workProjectId?: string }): string {
  const p = new URLSearchParams({ view: q.view });
  if (q.area) p.set("area", q.area);
  if (q.source) p.set("source", q.source);
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

/** The board's columns: the open statuses and Done. Cancelled tasks aren't on the board. */
export const BOARD_COLUMNS = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type BoardStatus = (typeof BOARD_COLUMNS)[number];

/** A person's name; for a task's owner pass its `ownerRole` too, which names the role ("Creators") when it holds the task. */
export function ownerLabel(owner: TaskPersonDto | null, role?: { name: string } | null): string {
  if (!owner) return role ? role.name : "Unassigned";
  return owner.gone ? "No longer on this business" : owner.name;
}

/** An owner picker's value is a person's id, `role:<id>` for a role, or "" for nobody. */
const ROLE_VALUE = "role:";
export const roleValue = (roleId: string) => `${ROLE_VALUE}${roleId}`;

export function ownerValue(t: { owner: { id: string } | null; ownerRole: { id: string; name: string } | null }): string {
  return t.ownerRole ? roleValue(t.ownerRole.id) : (t.owner?.id ?? "");
}

/** The picker's value as a write takes it: one owner key (the server clears the other when one is set). */
export function ownerFromValue(v: string): { ownerId: string | null } | { ownerRoleId: string } {
  return v.startsWith(ROLE_VALUE) ? { ownerRoleId: v.slice(ROLE_VALUE.length) } : { ownerId: v || null };
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

/**
 * What an open task peek does about a change: show the task the write returned (no second read), read it again, or
 * nothing (a comment, which its comment list handles, or another task).
 */
export function peekReaction(d: TasksChanged, id: string): "show" | "reload" | "skip" {
  if (d.kind === "comment") return "skip";
  if (d.taskId && d.taskId !== id) return "skip";
  return d.task && d.task.id === id ? "show" : "reload";
}

/** A project's progress (done of all but cancelled) as words: "3 of 8 done", or "No tasks yet". */
export function progressLabel(p: { done: number; total: number }): string {
  return p.total ? `${p.done} of ${p.total} done` : "No tasks yet";
}

/** The same as a whole percent for the bar; 0 with no tasks. */
export function progressPercent(p: { done: number; total: number }): number {
  return p.total ? Math.round((p.done / p.total) * 100) : 0;
}

/** "Check again in 4 weeks": the person's own today plus 28 days, as YYYY-MM-DD. */
export function recheckDay(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 28);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const PROJECT_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", DONE: "Done", ARCHIVED: "Archived" };
