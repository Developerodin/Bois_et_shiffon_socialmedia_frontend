import type { NotificationPageDto, PostRow, SearchResultsDto, TaskAction, TaskAttachmentDto, TaskChecklistItemDto, TaskCommentDto, TaskDetailDto, TaskDto, TaskPersonDto, TaskProposalDto, TaskProposalsDto, WorkProjectDetailDto, WorkProjectDto, WorkProjectMilestoneDto } from "@/shared";
import { ApiError, request } from "@/components/settings/api";
import { SLOW_MS } from "@/lib/net";

const enc = encodeURIComponent;

/** The brand's API root the task calls hang off. */
export const brandBase = (w: string, b: string) => `/api/v1/workspaces/${enc(w)}/brands/${enc(b)}`;

/** GET tasks?view=…: a page of 50; `posts` only on page 1 of view=mine for content work. */
export type TaskPage = { tasks: TaskDto[]; posts?: PostRow[]; nextCursor: string | null };

/** POST tasks/:id. `reason` goes with requestChanges and block, `note` with approve. */
export type TaskActionBody = { action: TaskAction; reviewerId?: string; reason?: string; note?: string; blockedOnId?: string };

/** Fired after a task write here succeeds, so other lists of tasks on the page (and the bell) read again. */
export const TASKS_CHANGED = "tasks:changed";
export type TasksChangedKind = "task" | "comment" | "checklist" | "attachment" | "project";
/** `task` is the task as the write returned it, when it returned one: a peek on that task shows it instead of reading again. */
export type TasksChanged = { taskId?: string; kind: TasksChangedKind; task?: TaskDetailDto };

function tasksChanged(detail: TasksChanged) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<TasksChanged>(TASKS_CHANGED, { detail }));
}
/** `p`, announcing the change once it succeeds; a failed write changed nothing, so it announces nothing. */
const announce = <T>(p: Promise<T>, detail: (v: T) => TasksChanged) =>
  p.then((v) => {
    tasksChanged(detail(v));
    return v;
  });

/** Listen for task changes here; returns the unsubscribe. An event without a detail counts as a task change. */
export function onTasksChanged(fn: (d: TasksChanged) => void): () => void {
  const listener = (e: Event) => fn((e as CustomEvent<TasksChanged | null>).detail ?? { kind: "task" });
  window.addEventListener(TASKS_CHANGED, listener);
  return () => window.removeEventListener(TASKS_CHANGED, listener);
}

/** Lists, the board, Today and the bell skip a new comment: it changes none of what they show. */
export const listsCare = (d: TasksChanged) => d.kind !== "comment";

const patchItem = (base: string, id: string, itemId: string, body: { text?: string; done?: boolean; position?: number }) =>
  request<{ item: TaskChecklistItemDto }>(`${base}/tasks/${enc(id)}/checklist/${enc(itemId)}`, { method: "PATCH", body: JSON.stringify(body) }).then((d) => d.item);

export const tasksApi = {
  /** `query` from tasksQuery(); the next page of the same query with `cursor`. */
  page: (base: string, query: string, cursor: string) => request<TaskPage>(`${base}/${query}&cursor=${enc(cursor)}`),
  /** A refusal is a 409 whose message says why; the caller shows it. */
  act: (base: string, id: string, body: TaskActionBody) =>
    announce(
      request<{ task: TaskDetailDto }>(`${base}/tasks/${enc(id)}`, { method: "POST", body: JSON.stringify(body) }).then((d) => d.task),
      (task) => ({ taskId: id, kind: "task", task }),
    ),
  /** One task with its checklist lines and photos; 404 when it is gone or hidden from this person. */
  get: (base: string, id: string) => request<{ task: TaskDetailDto }>(`${base}/tasks/${enc(id)}`).then((d) => d.task),
  /** tasks.manage. Send only the fields that changed: two people editing one task overwrite per field, last write wins. */
  patch: (base: string, id: string, fields: Record<string, unknown>) =>
    announce(
      request<{ task: TaskDetailDto }>(`${base}/tasks/${enc(id)}`, { method: "PATCH", body: JSON.stringify(fields) }).then((d) => d.task),
      (task) => ({ taskId: id, kind: "task", task }),
    ),
  /**
   * People who read the brand's tasks (tasks.read), `client` marking client reviewers: the reviewer pickers offer them,
   * the owner, "waiting on" and project owner pickers don't. A client reviewer asking gets 403.
   */
  people: (base: string) => request<{ people: TaskPersonDto[] }>(`${base}/tasks/people`).then((d) => d.people),
  /** Checklist lines: the task's owner or tasks.manage. */
  addItem: (base: string, id: string, text: string) =>
    announce(
      request<{ item: TaskChecklistItemDto }>(`${base}/tasks/${enc(id)}/checklist`, { method: "POST", body: JSON.stringify({ text }) }).then((d) => d.item),
      () => ({ taskId: id, kind: "checklist" }),
    ),
  patchItem: (base: string, id: string, itemId: string, body: { text?: string; done?: boolean; position?: number }) =>
    announce(patchItem(base, id, itemId, body), () => ({ taskId: id, kind: "checklist" })),
  /** New positions for several lines, announced once when all are saved. */
  reorderItems: (base: string, id: string, positions: { itemId: string; position: number }[]) =>
    announce(Promise.all(positions.map((p) => patchItem(base, id, p.itemId, { position: p.position }))), () => ({ taskId: id, kind: "checklist" })),
  removeItem: (base: string, id: string, itemId: string) =>
    announce(request<void>(`${base}/tasks/${enc(id)}/checklist/${enc(itemId)}`, { method: "DELETE" }), () => ({ taskId: id, kind: "checklist" })),
  /** Takes a photo off the task; the upload itself stays in the library. */
  removeAttachment: (base: string, id: string, attachmentId: string) =>
    announce(request<void>(`${base}/tasks/${enc(id)}/attachments/${enc(attachmentId)}`, { method: "DELETE" }), () => ({ taskId: id, kind: "attachment" })),
  /** Oldest first, the newest 200; a client never gets internal ones. */
  comments: (base: string, id: string) => request<{ comments: TaskCommentDto[] }>(`${base}/tasks/${enc(id)}/comments`).then((d) => d.comments),
  /** Append-only. A staff comment stays internal unless `shareWithClient`; a client's never is. */
  comment: (base: string, id: string, body: string, shareWithClient: boolean) =>
    announce(
      request<{ comment: TaskCommentDto }>(`${base}/tasks/${enc(id)}/comments`, { method: "POST", body: JSON.stringify({ body, shareWithClient }) }).then((d) => d.comment),
      () => ({ taskId: id, kind: "comment" }),
    ),
  uploadScreenshot: (...a: Parameters<typeof uploadScreenshot>) => announce(uploadScreenshot(...a), () => ({ taskId: a[1], kind: "attachment" })),
  /** tasks.manage. With a requestId (one per dialog opening), a retry returns the task the first request made. */
  create: (base: string, body: Record<string, unknown> & { requestId: string }) =>
    announce(
      request<{ task: TaskDto }>(`${base}/tasks`, { method: "POST", body: JSON.stringify(body) }).then((d) => d.task),
      (task) => ({ taskId: task.id, kind: "task" }),
    ),
  /** tasks.manage. Proposals only, nothing stored; 502/503 carry a message for the person. Slow: the model reads the note. */
  fromNote: (base: string, text: string) =>
    request<TaskProposalsDto>(`${base}/tasks/from-note`, { method: "POST", body: JSON.stringify({ text }), timeoutMs: SLOW_MS }).then((d) => d.proposals),
  /** tasks.manage. Up to 20, all or nothing; the same requestId again returns the first rows instead of making more. */
  batch: (base: string, body: { requestId: string; tasks: TaskProposalDto[] }) =>
    announce(
      request<{ tasks: TaskDto[] }>(`${base}/tasks/batch`, { method: "POST", body: JSON.stringify(body) }).then((d) => d.tasks),
      () => ({ kind: "task" }),
    ),
};

/** Top-bar search (brand.read): 3–100 characters, 5 per kind; 30 a minute per person (429 past that). */
export const searchBrand = (base: string, q: string, signal?: AbortSignal) => request<SearchResultsDto>(`${base}/search?q=${enc(q)}`, { signal });

/** The person's notifications in the current workspace: the /me routes read it from X-Workspace-Id. */
const inWorkspace = (workspaceId: string) => ({ "X-Workspace-Id": workspaceId });
export const notificationsApi = {
  /** Newest first, 20 a page. */
  page: (workspaceId: string, cursor?: string) =>
    request<NotificationPageDto>(`/api/v1/me/notifications${cursor ? `?cursor=${enc(cursor)}` : ""}`, { headers: inWorkspace(workspaceId) }),
  /** Unread, counted up to 100. */
  count: (workspaceId: string) => request<{ count: number }>("/api/v1/me/notifications/count", { headers: inWorkspace(workspaceId) }).then((d) => d.count),
  read: (workspaceId: string, which: { ids: string[] } | { all: true }) =>
    request<{ updated: number }>("/api/v1/me/notifications/read", { method: "POST", body: JSON.stringify(which), headers: inWorkspace(workspaceId) }),
};

/** GET work-projects: 30 a page, soonest due first; archived ones only with status=ARCHIVED. */
export type ProjectPage = { projects: WorkProjectDto[]; nextCursor: string | null };

/** The GET work-projects path (relative to the brand) for a status filter ("" = all but archived). */
export const projectsQuery = (status: string) => (status ? `work-projects?status=${enc(status)}` : "work-projects");

/** Work projects and their milestones. Every write needs tasks.manage; a refusal throws with the server's message. */
export const projectsApi = {
  /** The first page (30, soonest due first): the task's Project picker. */
  first: (base: string) => request<ProjectPage>(`${base}/work-projects`),
  page: (base: string, query: string, cursor: string) => request<ProjectPage>(`${base}/${query}${query.includes("?") ? "&" : "?"}cursor=${enc(cursor)}`),
  /** With a requestId, a retry returns the project the first request made. */
  create: (base: string, body: { name: string; requestId: string }) =>
    announce(
      request<{ project: WorkProjectDetailDto }>(`${base}/work-projects`, { method: "POST", body: JSON.stringify(body) }).then((d) => d.project),
      () => ({ kind: "project" }),
    ),
  /** Send only the fields that change. Unsharing (clientVisible false) is a 409 while a client reviews a task in it. */
  /** Announced: sharing or unsharing changes whether a client can see its tasks, and the peek says so. */
  patch: (base: string, id: string, fields: Record<string, unknown>) =>
    announce(
      request<{ project: WorkProjectDetailDto }>(`${base}/work-projects/${enc(id)}`, { method: "PATCH", body: JSON.stringify(fields) }).then((d) => d.project),
      () => ({ kind: "project" }),
    ),
  addMilestone: (base: string, id: string, body: { title: string; dueOn: string }) =>
    request<{ milestone: WorkProjectMilestoneDto }>(`${base}/work-projects/${enc(id)}/milestones`, { method: "POST", body: JSON.stringify(body) }).then((d) => d.milestone),
  patchMilestone: (base: string, id: string, milestoneId: string, body: { title?: string; dueOn?: string; done?: boolean; position?: number }) =>
    request<{ milestone: WorkProjectMilestoneDto }>(`${base}/work-projects/${enc(id)}/milestones/${enc(milestoneId)}`, { method: "PATCH", body: JSON.stringify(body) }).then((d) => d.milestone),
  removeMilestone: (base: string, id: string, milestoneId: string) => request<void>(`${base}/work-projects/${enc(id)}/milestones/${enc(milestoneId)}`, { method: "DELETE" }),
};

const UPLOAD_FAILED = "Couldn't upload the photo. Try again.";

/**
 * A screenshot onto a task through the story upload flow, the one that makes VERIFIED photo uploads: a slot
 * (content.create; `rightsConfirmed` is the person's own tick that they may use the photo), the browser PUTs the file straight to
 * storage, the server reads it back and checks it, then it is attached (the owner with content.create, or tasks.manage).
 * A refusal at any step throws with the server's message. ponytail: an upload that fails after the slot leaves a
 * PENDING row; the daily purge removes those after 7 days.
 */
async function uploadScreenshot(base: string, taskId: string, file: File, role: "BEFORE" | "AFTER" | "OTHER", rightsConfirmed: boolean): Promise<TaskAttachmentDto> {
  const slot = await request<{ uploadId: string; url: string; headers: Record<string, string> }>(`${base}/stories/uploads`, {
    method: "POST",
    body: JSON.stringify({ kind: "photo", contentType: file.type, bytes: file.size, rightsConfirmed }),
  });
  let put: Response;
  try {
    put = await fetch(slot.url, { method: "PUT", body: file, headers: slot.headers });
  } catch {
    throw new ApiError(0, UPLOAD_FAILED); // offline, or storage refused the browser (CORS)
  }
  if (!put.ok) throw new ApiError(put.status, UPLOAD_FAILED);
  const checked = await request<{ status: "VERIFIED" } | { status: "REJECTED"; reason: string }>(`${base}/stories/uploads/${enc(slot.uploadId)}`, { method: "POST" });
  if (checked.status !== "VERIFIED") throw new ApiError(400, checked.reason);
  const d = await request<{ attachment: TaskAttachmentDto }>(`${base}/tasks/${enc(taskId)}/attachments`, {
    method: "POST",
    body: JSON.stringify({ mediaUploadId: slot.uploadId, role }),
  });
  return d.attachment;
}
