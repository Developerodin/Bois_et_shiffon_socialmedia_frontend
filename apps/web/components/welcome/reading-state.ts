/**
 * When the welcome Reading screen stops waiting. The SEO and GEO rows come from log events, and a check that never
 * logs its end (still queued, or the worker restarted) would otherwise show "Waiting" and keep the page polling.
 * Past CHECKS_BOUND_S an unfinished check shows as still running in the background; past POLL_LIMIT_S the page
 * stops polling altogether (reading carries on server side, and Context shows the drafts).
 */
export type CheckState = "waiting" | "running" | "done" | "failed" | "late";

export const CHECKS_BOUND_S = 10 * 60;
export const POLL_LIMIT_S = 20 * 60;
/** Once research has finished, a check that still hasn't logged anything gets this long before it shows as late. */
export const AFTER_FINISH_S = 2 * 60;

export function settleCheck(state: CheckState, elapsedS: number, sinceFinishedS = 0): CheckState {
  const open = state === "waiting" || state === "running";
  return open && (elapsedS >= CHECKS_BOUND_S || sinceFinishedS >= AFTER_FINISH_S) ? "late" : state;
}

const settled = (s: CheckState) => s === "done" || s === "failed" || s === "late";

/** Keep polling while research or a check is still moving, up to the time limit. */
export function keepPolling({ finished, checks, elapsedS }: { finished: boolean; checks: CheckState[]; elapsedS: number }) {
  if (elapsedS >= POLL_LIMIT_S) return false;
  return !(finished && checks.every(settled));
}
