"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { selectClass } from "@/components/settings/shared";
import { navFor } from "@/lib/nav";
import { recentKey } from "@/lib/recent";
import { brandBase } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";
import { NewTaskButton, useTaskPeople } from "@/components/tasks/new-task-dialog";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { TaskPeek } from "@/components/tasks/task-view";
import { navigate } from "@/lib/workspace-view";
import { AREA_TABS, areaParam, readSaved, SOURCE_TABS, sourceParam, TASK_LIST_VIEWS, TASKS_VIEW_KEY, type AreaParam, type SourceParam, type TaskLayout, type TaskListView } from "@/components/tasks/task-views";

const LAYOUTS = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
] as const;

/**
 * /tasks: area tabs (from ?area=, so the Website and Performance nav links land on theirs), on Performance a filter by
 * report (?source=seo|geo), a view, List or Board, and the task peek (?task=). With tasks.all the page opens on all open
 * tasks, and a manager with it assigns from the list (people and roles read once here).
 */
export function TasksPage({ workspaceId, brandId, userId, perms }: { workspaceId: string; brandId: string; userId: string; perms: string[] }) {
  const base = brandBase(workspaceId, brandId);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const area = areaParam(search.get("area"));
  const source = sourceParam(search.get("source"), area);
  const all = perms.includes("tasks.all");
  const canAssign = all && perms.includes("tasks.manage");
  const fallback: TaskListView = all ? "open" : "mine";
  const team = useTaskPeople(base, canAssign);
  // Read after mount so the server render and the first client render match.
  const [saved, setSaved] = useState<{ view: TaskListView; layout: TaskLayout } | null>(null);
  // The saved choice, read once after mount.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(TASKS_VIEW_KEY);
    } catch {}
    setSaved((s) => s ?? readSaved(raw, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once after mount; the permissions don't change on this page
  }, []);
  // A link to one view (Today's group headers: ?view=approvals, the sidebar's Performance: ?view=open) shows that list,
  // for this visit only, each time a link brings one, also when this page is already open (the sidebar from Website).
  // Then the parameter leaves the URL (no history entry), so a reload or a shared link shows the person's own choice.
  const viewParam = search.get("view");
  useEffect(() => {
    if (viewParam === null) return;
    const linked = TASK_LIST_VIEWS.find((v) => v.value === viewParam)?.value;
    if (linked) setSaved((s) => ({ view: linked, layout: s?.layout ?? "list" }));
    const q = new URLSearchParams(search.toString());
    q.delete("view");
    const s = q.toString();
    navigate(router, s ? `${pathname}?${s}` : pathname, pathname, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when a link brings a view, not on other URL changes
  }, [viewParam]);
  const { view, layout } = saved ?? readSaved(null, fallback);

  const remember = (next: { view: TaskListView; layout: TaskLayout }) => {
    setSaved(next);
    try {
      localStorage.setItem(TASKS_VIEW_KEY, JSON.stringify(next));
    } catch {}
  };
  // Both filters change the URL in place (no server round trip); the lists re-read on their new query.
  const setParams = (next: { area?: AreaParam; source?: SourceParam }) => {
    const q = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    navigate(router, s ? `${pathname}?${s}` : pathname, pathname, "replace");
  };
  // The report filter belongs to the Performance tab: leaving it drops ?source=.
  const setArea = (a: AreaParam) => setParams({ area: a, source: "" });
  const setSource = (s: SourceParam) => setParams({ source: s });

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={navFor("/tasks").title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/projects">{navFor("/projects").title}</Link>
            </Button>
            {perms.includes("tasks.manage") ? <NewTaskButton base={base} all={all} userId={userId} /> : null}
          </div>
        }
      >
        Work on this business across content, the website and performance.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedRadios label="Area" name="task-area" value={area} onChange={setArea} options={AREA_TABS} />
        {area === "seo" ? <SegmentedRadios label="Report" name="task-source" value={source} onChange={setSource} options={SOURCE_TABS} /> : null}
        {layout === "list" ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">View</span>
            <select value={view} onChange={(e) => remember({ view: e.target.value as TaskListView, layout })} className={cn(selectClass, "w-auto pointer-coarse:h-11")}>
              {TASK_LIST_VIEWS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="sm:ml-auto">
          <SegmentedRadios label="Layout" name="task-layout" value={layout} onChange={(l) => remember({ view, layout: l })} options={LAYOUTS} />
        </div>
      </div>
      {layout === "board" ? <p className="-mt-2 text-xs text-muted-foreground">The board shows every open task and the last 30 days&rsquo; done ones.</p> : null}
      {saved === null ? null : layout === "board" ? (
        <TaskBoard base={base} area={area} source={source} />
      ) : (
        <section className="rounded-2xl border border-border bg-card px-5 py-2 shadow-sm">
          <TaskList base={base} view={view} area={area} source={source} assign={canAssign ? team : undefined} />
        </section>
      )}
      <TaskPeek base={base} perms={perms} userId={userId} recentKey={recentKey(workspaceId, brandId, userId)} />
    </div>
  );
}
