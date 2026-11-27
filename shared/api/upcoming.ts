import type { TaskDto } from "./tasks";

/** A project milestone not done yet, due in the window, with the project it belongs to. */
export type UpcomingMilestoneDto = { id: string; title: string; dueOn: string; project: { id: string; name: string } };

/**
 * GET upcoming (tasks.read): the Overview's next 7 days. `from`..`to` are the brand's local days (today through
 * today + 6, inclusive) in `timeZone`. Website tasks: open, WEBSITE among their areas, due in the window, visible to the
 * caller. Milestones: not done, due in the window, of an active project the caller can see. At most 10 of each, soonest
 * first; `count` is the whole window's.
 */
export type UpcomingDto = {
  timeZone: string;
  from: string;
  to: string;
  website: { count: number; tasks: TaskDto[] };
  milestones: { count: number; items: UpcomingMilestoneDto[] };
};
