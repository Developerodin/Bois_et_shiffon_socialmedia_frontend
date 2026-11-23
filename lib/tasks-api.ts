import type { PostRow, TaskAction, TaskDetailDto, TaskDto, TaskPersonDto } from "@/shared";
import { request } from "@/components/settings/api";

const enc = encodeURIComponent;

/** The brand's API root the task calls hang off. */
export const brandBase = (w: string, b: string) => `/api/v1/workspaces/${enc(w)}/brands/${enc(b)}`;

/** GET tasks?view=…: a page of 50; `posts` only on page 1 of view=mine for content work. */
export type TaskPage = { tasks: TaskDto[]; posts?: PostRow[]; nextCursor: string | null };

/** POST tasks/:id. `reason` goes with requestChanges and block, `note` with approve. */
export type TaskActionBody = { action: TaskAction; reviewerId?: string; reason?: string; note?: string; blockedOnId?: string };

export const tasksApi = {
  /** `query` from tasksQuery(); the next page of the same query with `cursor`. */
  page: (base: string, query: string, cursor: string) => request<TaskPage>(`${base}/${query}&cursor=${enc(cursor)}`),
  /** A refusal is a 409 whose message says why; the caller shows it. */
  act: (base: string, id: string, body: TaskActionBody) =>
    request<{ task: TaskDetailDto }>(`${base}/tasks/${enc(id)}`, { method: "POST", body: JSON.stringify(body) }).then((d) => d.task),
  /** One task with its checklist lines and photos; 404 when it is gone or hidden from this person. */
  get: (base: string, id: string) => request<{ task: TaskDetailDto }>(`${base}/tasks/${enc(id)}`).then((d) => d.task),
  /** tasks.manage. Send only the fields that changed: two people editing one task overwrite per field, last write wins. */
  patch: (base: string, id: string, fields: Record<string, unknown>) =>
    request<{ task: TaskDetailDto }>(`${base}/tasks/${enc(id)}`, { method: "PATCH", body: JSON.stringify(fields) }).then((d) => d.task),
  /** People who read the brand's tasks (tasks.read): the owner, reviewer and "waiting on" pickers. */
  people: (base: string) => request<{ people: TaskPersonDto[] }>(`${base}/tasks/people`).then((d) => d.people),
};
