/** Signed links last an hour; an answer holding them is read again once it is 50 minutes old (as the phone does). */
export const SIGNED_LINK_STALE_MS = 50 * 60_000;

/** Whether an answer fetched at `fetchedAtMs` holds links too old to show. */
export function stale(fetchedAtMs: number, now = Date.now()): boolean {
  return now - fetchedAtMs >= SIGNED_LINK_STALE_MS;
}

/**
 * When the links keepLinks returned were fetched: a kept result mixes `prev`'s links with `next`'s (new shots, a
 * download link `prev` lacked), so it is as old as the older of the two answers; otherwise as old as `next`.
 */
export function linksFetchedAt(prevFetchedAt: number | undefined, fetchedAt: number, now = Date.now()): number {
  return prevFetchedAt !== undefined && !stale(prevFetchedAt, now) ? Math.min(prevFetchedAt, fetchedAt) : fetchedAt;
}
