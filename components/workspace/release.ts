/**
 * The calls that publish a version, in order. The server accepts an approval only while the status is
 * AWAITING_APPROVAL, so any other status publishes alone (a failed publish followed by a re-read only publishes).
 * `noAutoPublish`: the approval must not book a post of its own; the publish call below it does that.
 */
export function publishCalls(version: number, status: string, body: Record<string, unknown>): Record<string, unknown>[] {
  const publish = { action: "publish", version, ...body };
  return status === "AWAITING_APPROVAL" ? [{ action: "decide", version, verdict: "APPROVED", noAutoPublish: true }, publish] : [publish];
}
