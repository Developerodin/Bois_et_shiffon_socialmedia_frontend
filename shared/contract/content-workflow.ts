/**
 * Content workflows ("create posts with agents"): POST/GET .../content-workflows and GET/PATCH .../content-workflows/[id].
 * The client sends ids only; the server checks every one against the workspace and brand (server/content/workflow.ts).
 * Every field beyond these is refused, so a later phase adds fields (schedule, reviewPlan, a Scout start) without
 * breaking older clients.
 */
export const WORKFLOW_SOURCES = ["web-ideas", "web-wizard", "mobile", "automation"] as const;
/** manual: the posts feature only the chosen products. catalogue: the Brief writer picks from the catalogue, as today.
 * none: brand posts with no product. ("scout", products recommended by Scout, comes with the Scout step.) */
export const WORKFLOW_PRODUCT_MODES = ["manual", "catalogue", "none"] as const;
/** The stages a workflow runs, in order. Only the Planner is paid. A workflow stops after the Planner and after the Brief
 * writer for one approval of that stage's output (the batch, not each post); the Creator and Quality then run through to
 * the usual approval of each post. */
export const WORKFLOW_STAGES = ["planner", "brief", "creator", "quality"] as const;
export const WORKFLOW_STATUSES = ["DRAFT", "SCOUTING", "REVIEW_IDEAS", "PLANNING", "REVIEW_PLAN", "REVIEW_BRIEFS", "RUNNING", "DONE", "NEEDS_ATTENTION", "FAILED", "CANCELLED"] as const;
export const MAX_WORKFLOW_IDEAS = 5;
export const MAX_WORKFLOW_PRODUCTS = 10;
export const MAX_WORKFLOW_TARGETS = 9;

export type WorkflowSource = (typeof WORKFLOW_SOURCES)[number];
export type WorkflowProductMode = (typeof WORKFLOW_PRODUCT_MODES)[number];
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

/** Where posts go: a channel (format) and the connected account to post from; null = draft only or posted by hand.
 * One target per channel for now. */
export type WorkflowTarget = { channel: string; connectionId: string | null };

export type StartWorkflowRequest = {
  /** A fresh id per press of Start: a repeat of the same id gets the same workflow back (200), never a second charge. */
  requestId: string;
  source: WorkflowSource;
  /** Only "planner" for now. */
  start?: "planner";
  targets: WorkflowTarget[];
  productMode: WorkflowProductMode;
  /** Required (at least one) in manual mode; refused in the other modes. */
  productIds?: string[];
  campaignId?: string;
  /** Ideas to plan; absent = the shortlisted ideas, as the Planner always did. */
  ideaIds?: string[];
};

/** The review gates: "plan" (REVIEW_PLAN, approving starts the Brief writer), "briefs" (REVIEW_BRIEFS, the Creator). */
export const WORKFLOW_GATES = ["plan", "briefs"] as const;
export type WorkflowGate = (typeof WORKFLOW_GATES)[number];

export type PatchWorkflowRequest = { action: "cancel" } | { action: "retry"; stage: WorkflowStage } | { action: "approve"; stage: WorkflowGate };

/** A stage's latest run in the workflow. nothing-to-do: it ended with no work (not a failure). */
export type WorkflowStageView = {
  stage: WorkflowStage;
  state: "idle" | "queued" | "running" | "completed" | "nothing-to-do" | "failed";
  runId: string | null;
};

export type WorkflowView = {
  id: string;
  status: WorkflowStatus;
  source: WorkflowSource;
  createdAt: string;
  input: StartWorkflowRequest;
  stages: WorkflowStageView[];
  /** The workflow's posts, counted per ContentStatus. */
  posts: Record<string, number>;
};
