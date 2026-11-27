/** Task vocabulary and status rules. Plain TS (no Prisma) so the web and phone share one copy. */
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;
export const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW"] as const;
/** CRM: customer follow-ups and quote reminders, seen only with a CRM_TASK_KEYS key (server/tasks/access.ts). */
export const TASK_AREAS = ["CONTENT", "WEBSITE", "SEO", "GENERAL", "CRM"] as const;
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const WORK_PROJECT_STATUSES = ["ACTIVE", "DONE", "ARCHIVED"] as const;
export const WEBSITE_CHANGE_KINDS = ["PRODUCT_PAGE", "COLLECTION", "MENU", "HOMEPAGE", "LANDING_PAGE", "BUG", "CORRECTION", "OTHER"] as const;

/** The task list's views (GET tasks `view=`); Done shows the last DONE_DAYS days. */
export const TASK_VIEWS = ["mine", "approvals", "due-today", "overdue", "blocked", "open", "done"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];
export const DONE_DAYS = 30;

/**
 * The files a task takes (server/tasks/file-check.ts checks each by its bytes): the announced type, the extension it is
 * stored and downloaded under, and its name on screen. CSV and plain text can't be told apart by bytes, so either is
 * accepted for UTF-8 text. Not legacy Office (macros), HTML, SVG or archives.
 */
export const TASK_FILE_TYPES = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", label: "Word" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", label: "Excel" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", label: "PowerPoint" },
  "text/csv": { ext: "csv", label: "CSV" },
  "text/plain": { ext: "txt", label: "Text" },
  "image/jpeg": { ext: "jpg", label: "JPG" },
  "image/png": { ext: "png", label: "PNG" },
} as const;
export type TaskFileType = keyof typeof TASK_FILE_TYPES;
export const TASK_FILE_MAX_BYTES = 25 * 1024 * 1024;
/** Files on one task, unfinished uploads included. */
export const TASK_FILES_MAX = 20;

/** The announced type for a file name's extension (the browser's own guess is unreliable for CSV and Office), or null. */
export function taskFileType(fileName: string): TaskFileType | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return null;
  if (ext === "jpeg") return "image/jpeg";
  return (Object.keys(TASK_FILE_TYPES) as TaskFileType[]).find((t) => TASK_FILE_TYPES[t].ext === ext) ?? null;
}

/** Top-bar search: shorter (trimmed) answers empty, since trigrams need 3; longer is a 400. */
export const SEARCH_MIN = 3;
export const SEARCH_MAX = 100;

export const TASK_ACTIONS = ["take", "start", "submitForReview", "approve", "requestChanges", "markDone", "block", "unblock", "checkedLive", "cancel", "reopen"] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

/** The task fields the rules read and write; dates are ISO strings. */
export type TaskRow = {
  status: string;
  reviewerId: string | null;
  ownerId: string | null;
  /** The project role that owns the task while nobody has taken it (never set together with ownerId). */
  ownerRoleId: string | null;
  url: string | null;
  blockedReason: string | null;
  blockedOnId: string | null;
  completedAt: string | null;
  checkedLiveAt: string | null;
  checkedLiveById: string | null;
  findingClearedAt: string | null;
  recheckOn: string | null;
};

/**
 * `canManage`: may run the manager actions on this task (tasks.all, or tasks.manage on a task they own or created).
 * `holdsOwnerRole`: the actor holds the project role that owns the task, so they may take it.
 */
export type ActorRole = { userId: string; isOwner: boolean; isReviewer: boolean; canManage: boolean; soleStaff: boolean; isBlockedOn: boolean; holdsOwnerRole: boolean };
export type ActionInput = { reviewerId?: string; reason?: string; blockedOnId?: string; now: string };
/** `code`: the stable code the same refusal carries elsewhere (PATCH), so clients see one shape. */
export type ActionResult = { ok: true; patch: Partial<TaskRow> & { status?: string } } | { ok: false; reason: string; code?: string };

const no = (reason: string, code?: string): ActionResult => ({ ok: false, reason, ...(code ? { code } : {}) });
const isOpen = (s: string) => (OPEN_TASK_STATUSES as readonly string[]).includes(s);
const CLEAR_BLOCK = { blockedReason: null, blockedOnId: null } as const;

function run(task: TaskRow, action: TaskAction, actor: ActorRole, input: ActionInput, dry: boolean): ActionResult {
  const mine = actor.isOwner || actor.canManage;
  const reason = input.reason?.trim();
  switch (action) {
    case "take":
      // A role's task becomes one person's. The reviewer of a task in review can't take it (unless sole staff), as in PATCH.
      if (!task.ownerRoleId || task.ownerId) return no("Someone else has taken this task.", "task.taken");
      if (!actor.holdsOwnerRole) return no("Only someone with this role can take this task.");
      if (!isOpen(task.status)) return no("Only an open task can be taken.");
      if (task.status === "IN_REVIEW" && task.reviewerId === actor.userId && !actor.soleStaff) return no("The reviewer can't be the owner.", "task.reviewerIsOwner");
      return { ok: true, patch: { ownerId: actor.userId, ownerRoleId: null } };
    case "start":
      if (!mine) return no("Only the owner or a manager can start this task.");
      return task.status === "TODO" ? { ok: true, patch: { status: "IN_PROGRESS" } } : no("Only a to-do task can be started.");
    case "submitForReview": {
      if (!mine) return no("Only the owner or a manager can send this for review.");
      if (task.status !== "TODO" && task.status !== "IN_PROGRESS") return no("Only a task in progress can be sent for review.");
      const reviewerId = input.reviewerId ?? task.reviewerId;
      if (!reviewerId) return dry ? { ok: true, patch: { status: "IN_REVIEW" } } : no("Pick a reviewer.");
      if (reviewerId === task.ownerId && !actor.soleStaff) return no("The reviewer can't be the owner.", "task.reviewerIsOwner");
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
      // clearFindings (server/seo/finding-tasks.ts) closes tasks with a raw UPDATE of these same fields: keep the two in step.
      if (!mine) return no("Only the owner or a manager can finish this task.");
      if (task.reviewerId) return no("A reviewed task is finished by the reviewer's approval.");
      if (task.status !== "TODO" && task.status !== "IN_PROGRESS") return no("Only an open task can be finished.");
      return { ok: true, patch: { status: "DONE", completedAt: input.now, ...CLEAR_BLOCK } };
    case "block":
      if (!mine) return no("Only the owner or a manager can block this task.");
      if (!isOpen(task.status)) return no("Only an open task can be blocked.");
      if (task.blockedReason) return no("Already blocked.");
      if (!dry && !reason) return no("Say what it is waiting on.");
      return { ok: true, patch: { blockedReason: reason ?? null, blockedOnId: input.blockedOnId ?? null } };
    case "unblock":
      if (!mine && !actor.isBlockedOn) return no("Only the owner, a manager or the person it waits on can unblock this task.");
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
  return TASK_ACTIONS.filter((a) => run(task, a, actor, { now: "" }, true).ok);
}

/** The fields a manager may change through PATCH; everything else (status, completedAt, checkedLive*, finding*) is server-only. */
export const MANAGE_PATCH_FIELDS = [
  "title", "description", "priority", "areas", "ownerId", "ownerRoleId", "reviewerId", "dueOn", "workProjectId",
  "contentItemId", "url", "changeKind", "acceptanceCriteria", "previewUrl", "recheckOn",
] as const;

export function pickPatch(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(MANAGE_PATCH_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
}
