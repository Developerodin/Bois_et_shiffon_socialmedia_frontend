/**
 * Which of Approve and Download a reel shows. Both go through the route's one `send` action, which APPROVES a reel
 * that is AWAITING_APPROVAL and otherwise only returns the signed links. So Download is offered only once the status is
 * already APPROVED, SCHEDULED or PUBLISHED, and is never called while AWAITING_APPROVAL.
 * The server stays the gate (the route needs content.approve). Accepted risk until the server has a download mode that
 * never approves: a call to `send` at the wrong moment would approve.
 * Ceiling: one permission (content.approve) covers both buttons; a role that may download but not approve needs that server mode.
 */
const DOWNLOADABLE = ["APPROVED", "SCHEDULED", "PUBLISHED"];

export function reelActions(status: string, canApprove: boolean): { approve: boolean; download: boolean; downloadWhy: string | null } {
  if (!canApprove) {
    return { approve: false, download: false, downloadWhy: status === "AWAITING_APPROVAL" ? "Someone who can approve reels approves it first." : "Your role can't download reels." };
  }
  if (status === "AWAITING_APPROVAL") return { approve: true, download: false, downloadWhy: "Approve it first to download." };
  return { approve: false, download: DOWNLOADABLE.includes(status), downloadWhy: null };
}

/**
 * Download after a fresh status read: `send` is called only when the read shows an approved reel, so it can't approve.
 * Returns what `send` returned, or null when the reel isn't approved yet.
 */
export async function downloadIfApproved<T>(readStatus: () => Promise<string>, send: () => Promise<T>): Promise<T | null> {
  return reelActions(await readStatus(), true).download ? send() : null;
}
