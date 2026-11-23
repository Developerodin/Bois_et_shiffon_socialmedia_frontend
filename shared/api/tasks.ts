import type { TaskAction } from "../tasks";

/** A person on a task; `gone` when the account no longer exists or can't see it. */
export type TaskPersonDto = { id: string; name: string; gone: boolean };

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  areas: string[];
  dueOn: string | null;
  blockedReason: string | null;
  url: string | null;
  changeKind: string | null;
  acceptanceCriteria: string | null;
  previewUrl: string | null;
  checkedLiveAt: string | null;
  checkedLiveById: string | null;
  recheckOn: string | null;
  completedAt: string | null;
  workProjectId: string | null;
  contentItemId: string | null;
  /** The audit finding this task came from (SEO), its pages when made, and when an audit stopped finding it. */
  findingKind: string | null;
  findingUrls: string[];
  findingClearedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: TaskPersonDto | null;
  reviewer: TaskPersonDto | null;
  blockedOn: TaskPersonDto | null;
  project: { id: string; name: string } | null;
  post: { id: string; title: string } | null;
  checklist: { done: number; total: number };
  actions: TaskAction[];
};

/** A post of yours that needs action, listed with GET tasks?view=mine (first page, content work only). */
export type PostRow = { id: string; title: string; channel: string; status: string; scheduledFor: string | null };

/** GET tasks?view=today: counts and the first few of each list. */
export type TodayDto = {
  mine: { count: number; tasks: TaskDto[] };
  approvals: { count: number; tasks: TaskDto[] };
  blockers: { count: number; tasks: TaskDto[] };
};

export type WorkProjectDto = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startsOn: string | null;
  dueOn: string | null;
  campaignId: string | null;
  clientVisible: boolean;
  owner: TaskPersonDto | null;
  progress: { done: number; total: number };
};

/** A dated step of a work project; done when `doneAt` is set. */
export type WorkProjectMilestoneDto = { id: string; title: string; dueOn: string; doneAt: string | null; position: number };

/**
 * GET work-projects/:id: milestones, the viewer's visible tasks counted by status, and the linked campaign with its posts
 * in the calendar window.
 */
export type WorkProjectDetailDto = WorkProjectDto & {
  campaign: { id: string; name: string } | null;
  milestones: WorkProjectMilestoneDto[];
  taskCounts: Record<string, number>;
  posts: PostRow[];
};

export type NotificationDto = {
  id: string;
  kind: string;
  /** The task's brand: opening it may switch brand. */
  brandId: string;
  taskId: string | null;
  taskTitle: string | null;
  actor: TaskPersonDto | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPageDto = { notifications: NotificationDto[]; nextCursor: string | null };

export type SearchResultDto = {
  kind: "task" | "project" | "post" | "product" | "campaign";
  id: string;
  title: string;
};

/** GET search: up to 5 hits per kind, best match first; a kind the viewer can't read is always empty. */
export type SearchResultsDto = { tasks: SearchResultDto[]; projects: SearchResultDto[]; posts: SearchResultDto[]; products: SearchResultDto[]; campaigns: SearchResultDto[] };

/** One checklist line of a task; done when `doneAt` is set. */
export type TaskChecklistItemDto = { id: string; text: string; position: number; doneAt: string | null; doneById: string | null };

/** A comment as the viewer may read it (a client never gets `internal` ones). `author` is null for SYSTEM comments. */
export type TaskCommentDto = { id: string; kind: string; body: string; author: TaskPersonDto | null; byClient: boolean; internal: boolean; createdAt: string };

/** A brand photo on a task: a before/after screenshot or other. `url` is a signed link, valid for an hour. */
export type TaskAttachmentDto = { id: string; mediaUploadId: string; role: string; createdById: string; createdAt: string; url: string };

/** GET tasks/:id (and the task an action or edit returns): the list row plus its checklist lines and photos. */
export type TaskDetailDto = TaskDto & { checklistItems: TaskChecklistItemDto[]; attachments: TaskAttachmentDto[] };
