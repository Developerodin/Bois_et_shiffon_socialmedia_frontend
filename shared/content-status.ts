/**
 * Post statuses the apps group the same way. OPEN_STATUSES are the posts still in play (the calendar always lists
 * them); STATUS_GROUPS are the pipeline buckets Today counts and the lists filter by.
 */
export const OPEN_STATUSES = ["PLANNED", "BRIEF_READY", "DRAFT_REVIEW", "AWAITING_APPROVAL", "APPROVED", "SCHEDULED", "BLOCKED"] as const;

export const STATUS_GROUPS = {
  toWrite: ["PLANNED", "BRIEF_READY", "DRAFT_REVIEW"],
  awaiting: ["AWAITING_APPROVAL"],
  approved: ["APPROVED"],
  scheduled: ["SCHEDULED"],
  published: ["PUBLISHED", "REVIEWED"],
} as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** True when the date falls from now up to, but not including, seven days ahead. */
export function inNextWeek(scheduledFor: string | Date | null, now: Date): boolean {
  if (!scheduledFor) return false;
  const t = new Date(scheduledFor).getTime();
  return t >= now.getTime() && t < now.getTime() + WEEK_MS;
}
