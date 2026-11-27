import { describe, expect, it } from "vitest";
import { defaultRange } from "@/lib/data-api";
import { mergeUpcoming, type WeekPost } from "@/lib/upcoming";
import type { TaskDto, UpcomingDto } from "@/shared";

const post = (id: string, scheduledFor: string): WeekPost => ({ id, title: id, channel: "INSTAGRAM_POST", scheduledFor });
const task = (id: string, dueOn: string) => ({ id, title: id, dueOn }) as TaskDto;
const route = (p: Partial<UpcomingDto> = {}): UpcomingDto => ({
  timeZone: "Europe/Paris",
  from: "2026-11-28",
  to: "2026-12-04",
  website: { count: 0, tasks: [] },
  milestones: { count: 0, items: [] },
  ...p,
});

describe("mergeUpcoming", () => {
  it("orders posts, website tasks and milestones by brand-local day", () => {
    const { rows } = mergeUpcoming(
      [post("late post", "2026-11-30T09:00:00Z"), post("early post", "2026-11-28T08:00:00Z")],
      route({
        website: { count: 1, tasks: [task("site", "2026-11-29")] },
        milestones: { count: 1, items: [{ id: "m", title: "launch", dueOn: "2026-11-28", project: { id: "p", name: "P" } }] },
      }),
    );
    expect(rows.map((r) => `${r.day} ${r.kind} ${r.title}`)).toEqual([
      "2026-11-28 post early post",
      "2026-11-28 milestone launch",
      "2026-11-29 website site",
      "2026-11-30 post late post",
    ]);
  });

  it("puts a post on the brand's day, not UTC's, at the day boundary", () => {
    // 23:30 UTC on the 28th is the 29th in Paris: after the task due the 28th, before the one due the 29th (posts first).
    const { rows } = mergeUpcoming([post("night", "2026-11-28T23:30:00Z")], route({ website: { count: 2, tasks: [task("b", "2026-11-29"), task("a", "2026-11-28")] } }));
    expect(rows.map((r) => `${r.day} ${r.title}`)).toEqual(["2026-11-28 a", "2026-11-29 night", "2026-11-29 b"]);
  });

  it("leaves out posts past the window's last day and doesn't count them", () => {
    const { rows, more } = mergeUpcoming([post("in", "2026-12-04T10:00:00Z"), post("eighth day", "2026-12-05T08:00:00Z")], route());
    expect(rows.map((r) => r.title)).toEqual(["in"]);
    expect(more.post).toBe(0);
  });

  it("caps the rows and counts what is left out per kind", () => {
    const posts = Array.from({ length: 6 }, (_, i) => post(`p${i}`, `2026-11-28T0${i}:00:00Z`));
    const { rows, more } = mergeUpcoming(posts, route({ website: { count: 14, tasks: Array.from({ length: 10 }, (_, i) => task(`t${i}`, "2026-12-01")) } }));
    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r.kind === "post")).toHaveLength(6);
    expect(more).toEqual({ post: 0, website: 12, milestone: 0 });
  });

  it("lists posts alone when the route isn't there (tasks off)", () => {
    const { rows, more } = mergeUpcoming([post("b", "2026-11-29T10:00:00Z"), post("a", "2026-11-29T09:00:00Z")], null);
    expect(rows.map((r) => r.title)).toEqual(["a", "b"]);
    expect(more).toEqual({ post: 0, website: 0, milestone: 0 });
  });

  it("is empty with nothing coming up", () => {
    expect(mergeUpcoming([], route())).toEqual({ rows: [], more: { post: 0, website: 0, milestone: 0 } });
  });
});

describe("defaultRange", () => {
  it("is the 28 days ending yesterday in the brand's zone", () => {
    // 23:30 UTC on the 27th is already the 28th in Paris, so yesterday is the 27th there.
    expect(defaultRange("Europe/Paris", null, new Date("2026-11-27T23:30:00Z"))).toEqual({ from: "2026-10-31", to: "2026-11-27" });
    expect(defaultRange("UTC", null, new Date("2026-11-27T23:30:00Z"))).toEqual({ from: "2026-10-30", to: "2026-11-26" });
  });
});
