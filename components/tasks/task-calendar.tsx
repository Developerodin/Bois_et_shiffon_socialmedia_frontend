"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskDto } from "@/shared";
import { CalendarCard, DayRow, MonthGrid } from "@/components/calendar/month-grid";
import { Button } from "@/components/ui/button";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { useTaskHref, useTasksChanged } from "@/components/tasks/task-list";
import { AREA_LABEL, ownerLabel, STATUS_LABEL, TASK_LEGEND, taskTone, tasksQuery, type AreaParam, type SourceParam, type TaskListView } from "@/components/tasks/task-views";
import { dayKey, groupByDay, monthGrid, type CardForm, type Noun } from "@/lib/calendar-month";
import type { TaskPage } from "@/lib/tasks-api";
import { TONE_DOT } from "@/lib/status";
import { cn } from "@/lib/utils";
import { navigate } from "@/lib/workspace-view";

const TASK_NOUN: Noun = ["task", "tasks"];
const pickPage = (d: TaskPage) => d;
const taskId = (t: TaskDto) => t.id;
const statusText = (t: TaskDto) => (t.blockedReason ? `${STATUS_LABEL[t.status] ?? t.status}, blocked` : (STATUS_LABEL[t.status] ?? t.status));
const taskSummary = (t: TaskDto) => ({ title: t.title, time: null, status: statusText(t) });

/**
 * /tasks as a month: each task on its due day (the brand's calendar day, `dueOn` as it is, so no time zone moves it),
 * for the same View, Area and Report as the list, one read of the shown grid's days (up to 200 tasks). A task opens in
 * the page's side peek (`?task=`), and the open one is marked. Tasks without a due day aren't here; the List has them.
 * ponytail: no drag to reschedule (the due day is changed in the peek), no week view.
 */
export function TaskCalendar({ base, view, area, source }: { base: string; view: TaskListView; area: AreaParam; source?: SourceParam }) {
  const router = useRouter();
  const pathname = usePathname();
  const taskHref = useTaskHref();
  const selectedId = useSearchParams().get("task");
  const [month, setMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const showMonth = (y: number, m: number) => setMonth({ y: new Date(y, m, 1).getFullYear(), m: new Date(y, m, 1).getMonth() });
  const headId = useId();
  const grid = useMemo(() => monthGrid(month.y, month.m), [month]);
  const query = tasksQuery({ view, area, source, dueFrom: dayKey(grid[0]), dueTo: dayKey(grid[grid.length - 1]) });
  const { data, failed, reload } = useJob(`${base}/${query}`, { pick: pickPage, intervals: JOB_INTERVALS.tasks });
  useTasksChanged(reload);
  const byDay = useMemo(() => groupByDay(data?.tasks ?? [], (t) => t.dueOn), [data]);
  const open = useCallback((id: string) => navigate(router, taskHref(id), pathname), [router, taskHref, pathname]);

  return (
    <section aria-label="Task calendar" className="@container/cal flex min-h-[36rem] flex-col rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2 @max-[640px]/cal:px-2">
        <h2 id={headId} aria-live="polite" className="mx-1 mr-auto text-base font-semibold tracking-tight tabular-nums @min-[900px]/cal:mr-0 @min-[900px]/cal:min-w-40">
          {new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <Button size="sm" variant="ghost" className="w-8 px-0 pointer-coarse:w-11" aria-label="Previous month" onClick={() => showMonth(month.y, month.m - 1)}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" className="w-8 px-0 pointer-coarse:w-11" aria-label="Next month" onClick={() => showMonth(month.y, month.m + 1)}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => showMonth(new Date().getFullYear(), new Date().getMonth())}>
          Today
        </Button>
      </div>
      <MonthGrid
        month={month}
        headId={headId}
        byDay={byDay}
        idOf={taskId}
        selectedId={selectedId}
        onOpen={open}
        card={(t, form, selected) => <TaskCard task={t} form={form} selected={selected} onOpen={open} />}
        dayList={(tasks, onPick) => <DayTasks tasks={tasks} onPick={onPick} />}
        summary={taskSummary}
        tone={taskTone}
        noun={TASK_NOUN}
        emptyMonth="Nothing due this month"
        loaded={!!data}
        gate={(children) =>
          data ? (
            <>
              {children}
              {failed ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Couldn&rsquo;t refresh. Showing the last update.
                </p>
              ) : null}
            </>
          ) : failed ? (
            <LoadFailed what="this month's tasks" onRetry={reload} className="py-4" />
          ) : (
            <p role="status" className="py-4 text-sm text-muted-foreground">
              Loading tasks…
            </p>
          )
        }
        notes={data?.nextCursor ? <p className="text-xs text-muted-foreground">Showing the first 200 tasks of this month. The list shows them all.</p> : null}
        footer={
          <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs text-muted-foreground @max-[640px]/cal:px-2">
            {/* What each colour means, in words: a dot and its label. */}
            <ul aria-label="Status colours" className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {TASK_LEGEND.map(([tone, label]) => (
                <li key={label} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} />
                  {label}
                </li>
              ))}
            </ul>
            <p>Tasks without a due day are in the List.{view === "done" ? " Done shows tasks finished in the last 30 days." : ""}</p>
          </div>
        }
      />
    </section>
  );
}

/** One task as a month card (CalendarCard): the owner small above the title when stacked, the title alone on one line. */
function TaskCard({ task, form, selected, onOpen }: { task: TaskDto; form: CardForm; selected: boolean; onOpen: (id: string) => void }) {
  const owner = ownerLabel(task.owner, task.ownerRole);
  return (
    <CalendarCard
      form={form}
      tone={taskTone(task)}
      selected={selected}
      about={`${task.title} · ${statusText(task)} · ${owner}`}
      onClick={() => onOpen(task.id)}
      top={
        <span aria-hidden className="min-w-0 truncate text-xs leading-3 text-muted-foreground">
          {owner}
        </span>
      }
      title={task.title}
    />
  );
}

/** A day's tasks, each a row (owner and areas, status, title) that opens the task: the day popover's list and the narrow month's agenda. */
function DayTasks({ tasks, onPick }: { tasks: TaskDto[]; onPick: (id: string) => void }) {
  return (
    <ul className="flex flex-col">
      {tasks.map((t) => (
        <DayRow
          key={t.id}
          onClick={() => onPick(t.id)}
          meta={
            <span className="block truncate">
              {ownerLabel(t.owner, t.ownerRole)}
              {t.areas.length ? ` · ${t.areas.map((a) => AREA_LABEL[a] ?? a).join(", ")}` : ""}
            </span>
          }
          status={
            <span className="flex shrink-0 items-center gap-1">
              {t.blockedReason ? <StatusBadge quiet status="BLOCKED">Blocked</StatusBadge> : null}
              <StatusBadge quiet status={t.status}>{STATUS_LABEL[t.status] ?? t.status}</StatusBadge>
            </span>
          }
          title={t.title}
        />
      ))}
    </ul>
  );
}
