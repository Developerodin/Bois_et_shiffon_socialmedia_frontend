import type { ContentChannel } from "@prisma/client";

/**
 * Posting cadence and slot assignment for the Planner (deterministic; the AI only proposes posts).
 * Weekly cadence per channel family; never two posts on the same channel on the same day.
 * ponytail: fixed cadence; make it a per-brand setting (Settings → mix rules) when a brand asks.
 */
export const WEEKDAYS_BY_CHANNEL: Record<ContentChannel, number[]> = {
  // 0 = Sunday … 6 = Saturday
  INSTAGRAM_POST: [2, 5],
  INSTAGRAM_CAROUSEL: [3],
  INSTAGRAM_REEL: [1, 4],
  FACEBOOK_POST: [2, 6],
  PINTEREST_PIN: [1, 3, 5],
  THREADS_POST: [2, 4],
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Next free day for `channel` on/after `from` (UTC dates), within `horizonDays`. Null if none. */
export function nextSlot(channel: ContentChannel, from: Date, taken: Set<string>, horizonDays = 30): Date | null {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    if (!WEEKDAYS_BY_CHANNEL[channel].includes(d.getUTCDay())) continue;
    const key = `${channel}:${dayKey(d)}`;
    if (taken.has(key)) continue;
    taken.add(key);
    return new Date(d.getTime() + 9 * 3_600_000); // 09:00 UTC (~10:00–11:00 in France)
  }
  return null;
}

export const takenKey = (channel: ContentChannel, date: Date) => `${channel}:${dayKey(date)}`;
