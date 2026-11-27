/**
 * The calls that publish a version, in order. The server accepts an approval only while the status is
 * AWAITING_APPROVAL, so any other status publishes alone (a failed publish followed by a re-read only publishes).
 * `noAutoPublish`: the approval must not book a post of its own; the publish call below it does that.
 */
export function publishCalls(version: number, status: string, body: Record<string, unknown>): Record<string, unknown>[] {
  const publish = { action: "publish", version, ...body };
  return status === "AWAITING_APPROVAL" ? [{ action: "decide", version, verdict: "APPROVED", noAutoPublish: true }, publish] : [publish];
}

/**
 * The board the schedule step should show, or null to keep `current`. It starts on the planned board when the chosen
 * account lists it (else the first board), and moves to a plan that changed since `seen` (the plan last applied), so
 * a plan set while the form is open shows there once; after that the person's own pick stands.
 */
export function boardChoice(boards: readonly { id: string }[], current: string, planned: string | null, seen: string | null): string | null {
  if (!boards.length) return null;
  const plannedListed = planned !== null && boards.some((b) => b.id === planned);
  if (plannedListed && seen !== planned) return planned;
  if (boards.some((b) => b.id === current)) return null;
  return plannedListed ? planned : boards[0].id;
}
