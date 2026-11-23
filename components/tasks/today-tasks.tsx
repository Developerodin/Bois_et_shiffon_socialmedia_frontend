"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { TaskDto, TodayDto } from "@/shared";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { useTasksChanged } from "@/components/tasks/task-list";
import { dueLabel, STATUS_LABEL } from "@/components/tasks/task-views";

const pickToday = (d: TodayDto) => d;

/**
 * Today's groups, in order; each header links to a view on /tasks. My tasks and Blockers show a narrower slice than any
 * view, so their links say what they open (`more`) instead of "See all".
 */
const GROUPS = [
  { key: "mine", title: "My tasks", hint: "due today or overdue", view: "mine", more: "All my open tasks" },
  { key: "approvals", title: "Approvals", hint: "waiting for your review", view: "approvals", more: null },
  { key: "blockers", title: "Blockers", hint: "blocked, yours or waiting on you", view: "blocked", more: "All blocked tasks" },
] as const;

/**
 * The Overview's task groups above Today's post rows (flag `tasks`, tasks.read): My tasks, Approvals and Blockers, each
 * with its count and first 5 rows. Polls every minute, again on window focus and after any task change here. A group
 * with nothing in it is left out; with nothing anywhere, nothing shows (Today says the rest).
 */
export function TodayTasks({ base, onOpen }: { base: string; onOpen: (id: string) => void }) {
  const { data, failed, reload } = useJob(`${base}/tasks?view=today`, { pick: pickToday, intervals: JOB_INTERVALS.tasks });
  useTasksChanged(reload);
  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  if (!data) return failed ? <LoadFailed what="your tasks" onRetry={() => void reload()} className="mt-4" /> : null;
  const shown = GROUPS.filter((g) => data[g.key].count > 0);
  if (!shown.length) return null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {shown.map((g) => (
        <TaskGroup key={g.key} title={g.title} hint={g.hint} href={`/tasks?view=${g.view}`} more={g.more} count={data[g.key].count} tasks={data[g.key].tasks} onOpen={onOpen} />
      ))}
    </div>
  );
}

function TaskGroup({ title, hint, href, more, count, tasks, onOpen }: { title: string; hint: string; href: string; more: string | null; count: number; tasks: TaskDto[]; onOpen: (id: string) => void }) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground">· {count} {hint}</span>
        </h3>
        <Link href={href} className="shrink-0 text-xs font-medium text-primary-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {more ?? (count > tasks.length ? `See all ${count}` : "Open tasks")}
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
        {tasks.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onOpen(t.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span className="min-w-[12rem] flex-1 line-clamp-2 text-sm font-medium">{t.title}</span>
              <span className="text-xs text-muted-foreground">{t.dueOn ? `Due ${dueLabel(t.dueOn)}` : "No date"}</span>
              <StatusBadge status={t.status}>{STATUS_LABEL[t.status] ?? t.status}</StatusBadge>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
