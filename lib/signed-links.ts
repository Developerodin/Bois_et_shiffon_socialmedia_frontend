/** Signed links last an hour; an answer holding them is read again once it is 50 minutes old (as the phone does). */
export const SIGNED_LINK_STALE_MS = 50 * 60_000;

/** Whether an answer fetched at `fetchedAtMs` holds links too old to show. */
export function stale(fetchedAtMs: number, now = Date.now()): boolean {
  return now - fetchedAtMs >= SIGNED_LINK_STALE_MS;
}
