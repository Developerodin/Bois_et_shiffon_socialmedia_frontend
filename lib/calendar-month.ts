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

/**
 * How a month cell fits its posts: all of them when there are `max` or fewer, else `max - 1` and a "+N more" line, so a
 * busy day takes no more lines than a full one. `max` comes from cardsThatFit, so a taller cell shows more posts.
 */
export function cellFit(count: number, max: number): { shown: number; more: number } {
  return count <= max ? { shown: count, more: 0 } : { shown: max - 1, more: count - (max - 1) };
}

/**
 * A wide month's day cell, in px, as MonthView draws it: 28 px of frame (a 1 px border top and bottom, 4 px padding
 * on top and 2 px below, the 20 px date) and then one 20 px post card per line, each with 2 px above it. Change these with the
 * classes on the cell and on PostCard, or the cards will overrun the cell or leave a line empty.
 */
export const CELL_FRAME = 28;
export const CARD_STEP = 22;
/**
 * The shortest a wide month's week row may be (px): two lines of cards. A short window keeps this height and the page
 * scrolls under the calendar instead of squeezing the days (1280 x 720 with a six-week month is about at the edge).
 */
export const CELL_FLOOR = CELL_FRAME + 2 * CARD_STEP;

/** How many lines of post cards (cards, or cards and "+N more") a day cell of this height holds: at least one. */
export function cardsThatFit(cellHeight: number): number {
  return Math.max(1, Math.floor((cellHeight - CELL_FRAME) / CARD_STEP));
}

/**
 * Whether a day popover opens below its cell or above it, and how tall it may be. It goes below when it fits there in
 * full or when there is at least as much room below as above, else above; either way it is capped to the room on that
 * side (less an 8 px margin) so the scrolling page around the calendar never clips it, down to a 120 px minimum.
 */
export function popoverSide(spaceBelow: number, spaceAbove: number, want: number): { side: "below" | "above"; maxHeight: number } {
  const side = spaceBelow >= want || spaceBelow >= spaceAbove ? "below" : "above";
  return { side, maxHeight: Math.max(120, Math.min(want, (side === "below" ? spaceBelow : spaceAbove) - 8)) };
}

/**
 * How far (px) the calendar's right edge moves in while a post's side peek is open, so the peek sits beside the calendar
 * instead of over it: the part of the main area (left to right edge, in window px) the peek covers from `peekLeft`. None
 * when that would leave the calendar under `minWidth` (a phone or tablet, where the peek is the whole width and covers it).
 */
export function peekInset(mainLeft: number, mainRight: number, peekLeft: number, minWidth = 360): number {
  const inset = Math.max(0, mainRight - peekLeft);
  return mainRight - inset - mainLeft >= minWidth ? inset : 0;
}

/**
 * A month cell's accessible name: the day, its post count and each post's time, title and status, since the chips show
 * titles cut short and colour the status.
 */
export function dayCellLabel(day: string, posts: { title: string; time: string | null; status: string }[]): string {
  const count = posts.length === 1 ? "1 post" : `${posts.length} posts`;
  if (!posts.length) return `${day}, ${count}`;
  return `${day}, ${count}: ${posts.map((p) => `${p.time ? `${p.time} ` : ""}${p.title} (${p.status})`).join("; ")}`;
}

/**
 * Under this width (px) the month is a grid of day numbers with status dots, and a tapped day lists its posts below the
 * grid instead of in a popover. The month view's `@min-[640px]/month` classes use the same number.
 */
export const AGENDA_BELOW = 640;
