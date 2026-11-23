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
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { TaskPeek } from "@/components/tasks/task-view";
import { AREA_TABS, areaParam, readSaved, TASK_LIST_VIEWS, TASKS_VIEW_KEY, type AreaParam, type TaskLayout, type TaskListView } from "@/components/tasks/task-views";

const LAYOUTS = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
] as const;

/** /tasks: area tabs (from ?area=, so the Website and SEO nav links land on theirs), a view, List or Board, and the task peek (?task=). */
export function TasksPage({ workspaceId, brandId, userId, perms }: { workspaceId: string; brandId: string; userId: string; perms: string[] }) {
  const base = brandBase(workspaceId, brandId);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const area = areaParam(search.get("area"));
  // Read after mount so the server render and the first client render match.
  const [saved, setSaved] = useState<{ view: TaskListView; layout: TaskLayout } | null>(null);
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(TASKS_VIEW_KEY);
    } catch {}
    setSaved(readSaved(raw));
  }, []);
  const { view, layout } = saved ?? readSaved(null);

  const remember = (next: { view: TaskListView; layout: TaskLayout }) => {
    setSaved(next);
    try {
      localStorage.setItem(TASKS_VIEW_KEY, JSON.stringify(next));
    } catch {}
  };
  const setArea = (a: AreaParam) => {
    const q = new URLSearchParams(search.toString());
    if (a) q.set("area", a);
    else q.delete("area");
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title={navFor("/tasks").title}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/projects">{navFor("/projects").title}</Link>
          </Button>
        }
      >
        Work on this business across content, the website and SEO.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedRadios label="Area" name="task-area" value={area} onChange={setArea} options={AREA_TABS} />
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
        <TaskBoard base={base} area={area} />
      ) : (
        <section className="rounded-2xl border border-border bg-card px-5 py-2 shadow-sm">
          <TaskList base={base} view={view} area={area} />
        </section>
      )}
      <TaskPeek base={base} perms={perms} userId={userId} recentKey={recentKey(workspaceId, brandId, userId)} />
    </div>
  );
}
