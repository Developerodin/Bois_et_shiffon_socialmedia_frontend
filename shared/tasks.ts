/** Task vocabulary and status rules. Plain TS (no Prisma) so the web and phone share one copy. */
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;
export const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW"] as const;
export const TASK_AREAS = ["CONTENT", "WEBSITE", "SEO", "GENERAL"] as const;
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const WEBSITE_CHANGE_KINDS = ["PRODUCT_PAGE", "COLLECTION", "MENU", "HOMEPAGE", "LANDING_PAGE", "BUG", "CORRECTION", "OTHER"] as const;

export type TaskAction = "start" | "submitForReview" | "approve" | "requestChanges" | "markDone" | "block" | "unblock" | "checkedLive" | "cancel" | "reopen";
const ACTIONS: readonly TaskAction[] = ["start", "submitForReview", "approve", "requestChanges", "markDone", "block", "unblock", "checkedLive", "cancel", "reopen"];

/** The task fields the rules read and write; dates are ISO strings. */
export type TaskRow = {
  status: string;
  reviewerId: string | null;
  ownerId: string | null;
  url: string | null;
  blockedReason: string | null;
  blockedOnId: string | null;
  completedAt: string | null;
  checkedLiveAt: string | null;
  checkedLiveById: string | null;
  findingClearedAt: string | null;
  recheckOn: string | null;
};

export type ActorRole = { userId: string; isOwner: boolean; isReviewer: boolean; canManage: boolean; soleStaff: boolean };
export type ActionInput = { reviewerId?: string; reason?: string; now: string };
export type ActionResult = { ok: true; patch: Partial<TaskRow> & { status?: string } } | { ok: false; reason: string };

const no = (reason: string): ActionResult => ({ ok: false, reason });
const isOpen = (s: string) => (OPEN_TASK_STATUSES as readonly string[]).includes(s);
const CLEAR_BLOCK = { blockedReason: null, blockedOnId: null } as const;

function run(task: TaskRow, action: TaskAction, actor: ActorRole, input: ActionInput, dry: boolean): ActionResult {
  const mine = actor.isOwner || actor.canManage;
  const reason = input.reason?.trim();
  switch (action) {
    case "start":
      if (!mine) return no("Only the owner or a manager can start this task.");
      return task.status === "TODO" ? { ok: true, patch: { status: "IN_PROGRESS" } } : no("Only a to-do task can be started.");
    case "submitForReview": {
      if (!mine) return no("Only the owner or a manager can send this for review.");
      if (task.status !== "TODO" && task.status !== "IN_PROGRESS") return no("Only a task in progress can be sent for review.");
      const reviewerId = input.reviewerId ?? task.reviewerId;
      if (!reviewerId) return dry ? { ok: true, patch: { status: "IN_REVIEW" } } : no("Pick a reviewer.");
      if (reviewerId === task.ownerId && !actor.soleStaff) return no("The reviewer can't be the owner.");
      return { ok: true, patch: { status: "IN_REVIEW", reviewerId } };
    }
    case "approve":
      if (task.status !== "IN_REVIEW") return no("Only a task in review can be approved.");
      if (!actor.isReviewer) return no("Only the reviewer can approve.");
      return { ok: true, patch: { status: "DONE", completedAt: input.now, ...CLEAR_BLOCK } };
    case "requestChanges":
      if (task.status !== "IN_REVIEW") return no("Only a task in review can have changes requested.");
      if (!actor.isReviewer) return no("Only the reviewer can request changes.");
      if (!dry && !reason) return no("Say what needs to change.");
      return { ok: true, patch: { status: "IN_PROGRESS" } };
    case "markDone":
      if (!mine) return no("Only the owner or a manager can finish this task.");
      if (task.reviewerId) return no("A reviewed task is finished by the reviewer's approval.");
      if (task.status !== "TODO" && task.status !== "IN_PROGRESS") return no("Only an open task can be finished.");
      return { ok: true, patch: { status: "DONE", completedAt: input.now, ...CLEAR_BLOCK } };
    case "block":
      if (!mine) return no("Only the owner or a manager can block this task.");
      if (!isOpen(task.status)) return no("Only an open task can be blocked.");
      if (task.blockedReason) return no("Already blocked.");
      if (!dry && !reason) return no("Say what it is waiting on.");
      return { ok: true, patch: { blockedReason: reason ?? null, blockedOnId: null } };
    case "unblock":
      if (!mine) return no("Only the owner or a manager can unblock this task.");
      return task.blockedReason ? { ok: true, patch: { ...CLEAR_BLOCK } } : no("Not blocked.");
    case "checkedLive":
      if (!mine) return no("Only the owner or a manager can mark this checked live.");
      if (!task.url) return no("Add the page address first.");
      if (task.status === "IN_REVIEW" || task.status === "CANCELLED") return no("Not available in this status.");
      return { ok: true, patch: { checkedLiveAt: input.now, checkedLiveById: actor.userId } };
    case "cancel":
      if (!actor.canManage) return no("Only a manager can cancel a task.");
      return isOpen(task.status) ? { ok: true, patch: { status: "CANCELLED", ...CLEAR_BLOCK } } : no("Only an open task can be cancelled.");
    case "reopen":
      if (!mine) return no("Only the owner or a manager can reopen this task.");
      if (task.status !== "DONE" && task.status !== "CANCELLED") return no("Only a finished task can be reopened.");
      return { ok: true, patch: { status: "TODO", completedAt: null, checkedLiveAt: null, checkedLiveById: null, findingClearedAt: null, recheckOn: null } };
  }
}

/** What happens if `actor` does `action` to `task`: the fields to write, or why not (spec sections 6 and 7). */
export function applyAction(task: TaskRow, action: TaskAction, actor: ActorRole, input: ActionInput): ActionResult {
  return run(task, action, actor, input, false);
}

/** Every action that would work for this actor, ignoring refusals that depend on what they type (reason, reviewer). */
export function allowedActions(task: TaskRow, actor: ActorRole): TaskAction[] {
  return ACTIONS.filter((a) => run(task, a, actor, { now: "" }, true).ok);
}

/** The fields a manager may change through PATCH; everything else (status, completedAt, checkedLive*, finding*) is server-only. */
export const MANAGE_PATCH_FIELDS = [
  "title", "description", "priority", "areas", "ownerId", "reviewerId", "dueOn", "workProjectId",
  "contentItemId", "url", "changeKind", "acceptanceCriteria", "previewUrl", "recheckOn",
] as const;

export function pickPatch(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(MANAGE_PATCH_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
}
