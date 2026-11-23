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

export type NotificationDto = {
  id: string;
  kind: string;
  taskId: string | null;
  taskTitle: string | null;
  actor: TaskPersonDto | null;
  readAt: string | null;
  createdAt: string;
};

export type SearchResultDto = {
  kind: "task" | "project" | "post" | "product" | "campaign";
  id: string;
  title: string;
};
