/** A local date as YYYY-MM-DD: the calendar's day key (the viewer's day, not the UTC one). */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The days of a month's grid, in weeks starting Monday: the Monday on or before the 1st through the Sunday on or after
 * the last day (4 to 6 weeks). Built with local dates (new Date(y, m, d)), so a DST change never shifts a day.
 */
export function monthGrid(year: number, month: number): Date[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const last = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((lead + last) / 7);
  return Array.from({ length: weeks * 7 }, (_, n) => new Date(year, month, 1 - lead + n));
}

/** The grid's dates as the content list's ?from&to: the first day's midnight to the midnight after the last day. */
export function gridRange(grid: Date[]): { from: string; to: string } {
  const last = grid[grid.length - 1];
  return { from: grid[0].toISOString(), to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).toISOString() };
}

/** Posts by local day key, in their order; undated ones under "unscheduled". */
export function groupByDay<T extends { scheduledFor: string | null }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const i of items) {
    const k = i.scheduledFor ? dayKey(new Date(i.scheduledFor)) : "unscheduled";
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return groups;
}

/** Where an arrow key moves focus in a 7-wide day grid of `length` cells: the new index, or null at an edge or for another key. */
export function gridStep(i: number, key: string, length: number): number | null {
  const by = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -7 : key === "ArrowDown" ? 7 : 0;
  return by && i + by >= 0 && i + by < length ? i + by : null;
}

/** A day popover's left edge: under its cell, moved left as needed to stay inside the container, never past its left edge. */
export const popoverLeft = (cellLeft: number, width: number, containerWidth: number) => Math.max(0, Math.min(cellLeft, containerWidth - width));

/** A compact 24-hour time ("14:30") for a month cell, or null at midnight (a date with no time). */
export function shortTime(iso: string): string | null {
  const at = new Date(iso);
  return at.getHours() || at.getMinutes() ? at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : null;
}
