import { STATUS_GROUPS } from "./content-status";

/** The parts of a calendar post the needs-action rule reads; ContentItem satisfies it. */
export type NeedsActionItem = {
  status: string;
  scheduledFor: string | null;
  publishIssue: "FAILED" | "CHECK" | null;
  byHand?: boolean;
  latest: { check?: { overall: string } | null } | null;
};

const PIPELINE: readonly string[] = [...STATUS_GROUPS.toWrite, ...STATUS_GROUPS.awaiting, ...STATUS_GROUPS.approved];
const PUBLISHED: readonly string[] = STATUS_GROUPS.published;

/** Date passed while still in the pipeline; a by-hand story is overdue whatever its status. */
export function isOverdue(i: Pick<NeedsActionItem, "status" | "scheduledFor" | "byHand">, now: Date): boolean {
  if (!i.scheduledFor || new Date(i.scheduledFor).getTime() >= now.getTime()) return false;
  return !!i.byHand || PIPELINE.includes(i.status);
}

export function isBlocked(i: Pick<NeedsActionItem, "status" | "publishIssue" | "latest">): boolean {
  if (PUBLISHED.includes(i.status)) return false;
  return i.status === "BLOCKED" || i.latest?.check?.overall === "BLOCKER" || !!i.publishIssue;
}
