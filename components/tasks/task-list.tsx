"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ListTodo } from "lucide-react";
import type { PostRow, TaskDto, TaskPersonDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { CHANNEL_LABEL, STATUS_LABEL as POST_STATUS_LABEL } from "@/lib/post-labels";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { listsCare, onTasksChanged, tasksApi, type TaskPage, type TaskTeam } from "@/lib/tasks-api";
import { shallowClick } from "@/lib/workspace-view";
import { PersonSelect } from "@/components/tasks/task-actions";
import { AREA_LABEL, dueLabel, ownerFromValue, ownerLabel, ownerValue, PRIORITY_LABEL, STATUS_LABEL, tasksQuery, type AreaParam, type SourceParam, type TaskListView } from "@/components/tasks/task-views";

const pickPage = (d: TaskPage) => d;

/** `?task=<id>` on the current page, keeping its other parameters: the task peek reads it. */
export function useTaskHref(): (id: string) => string {
  const pathname = usePathname();
  const search = useSearchParams();
  return (id) => {
    const q = new URLSearchParams(search.toString());
    q.set("task", id);
    return `${pathname}?${q}`;
  };
}

/** Reload `reload` whenever a task changes elsewhere on the page (a board move, the peek); a new comment doesn't count. */
export function useTasksChanged(reload: () => void) {
  useEffect(() => onTasksChanged((d) => listsCare(d) && reload()), [reload]);
}

/** The report a task came from ("SEO" or "GEO"), as a small tag; nothing for a task made by hand. */
export function FindingTag({ kind }: { kind: TaskDto["findingKind"] }) {
  if (!kind) return null;
  return <span className="shrink-0 rounded-[8px] bg-accent px-2 text-xs text-accent-foreground">{kind}</span>;
}

const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-3 py-3 align-top";
const check = "flex size-4 items-center justify-center pointer-coarse:size-11";

/** The people and roles the list's owner pickers offer (TasksPage reads them once); people is null while loading. */
type Assign = { people: TaskPersonDto[] | null; roles: TaskTeam["roles"] };
/** POST tasks/assign takes up to this many tasks. */
const ASSIGN_MAX = 100;
/** A row's owner while its change saves (`value`), once saved until the list reads it again, or why it failed. */
type RowOwner = { value?: string; saved?: boolean; error?: string };

/** One view of the brand's tasks as a table, 50 a page with "Show more". View=mine also lists your posts that need action. */
/** `empty`: a page's own short line for no tasks (a project's), instead of the big "Nothing here". */
/** `assign` (tasks.all and tasks.manage): an owner picker on each row, and ticks to give several tasks one owner. */
export function TaskList(props: { base: string; view: TaskListView; area: AreaParam; source?: SourceParam; workProjectId?: string; empty?: string; assign?: Assign }) {
  const query = tasksQuery(props);
  // Keyed by the query: a new view starts from its own first page (and no ticks).
  return <Pages key={query} base={props.base} query={query} empty={props.empty} assign={props.assign} />;
}

function Pages({ base, query, empty, assign }: { base: string; query: string; empty?: string; assign?: Assign }) {
  const url = `${base}/${query}`;
  const { data, failed, reload } = useJob(url, { pick: pickPage, intervals: JOB_INTERVALS.tasks });
  // Pages after the first, loaded on request; a reload drops them (the first page is fresh, they may not be).
  const [more, setMore] = useState<TaskDto[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  // How many pages after the first are shown, and a counter that makes an older read of them stale.
  const extraPages = useRef(0);
  const gen = useRef(0);
  const refresh = useCallback(() => {
    gen.current += 1;
    extraPages.current = 0;
    setMore([]);
    setCursor(undefined);
    void reload();
  }, [reload]);
  // The 60 s poll refreshes page 1 only: a task added there pushes its last row onto page 2, between page 1 and the
  // page 2 already shown, so it would never show. Read the shown pages again from the fresh page 1 instead of dropping
  // them (dropping would pull the rows out from under someone scrolled down).
  // ponytail: one request per shown page each minute; fine for a few pages, a "rows up to here" query past that.
  useEffect(() => {
    const pages = extraPages.current;
    if (!data || !pages) return;
    const mine = ++gen.current;
    void (async () => {
      const rows: TaskDto[] = [];
      let c = data.nextCursor;
      for (let i = 0; i < pages && c; i++) {
        const page = await tasksApi.page(base, query, c);
        rows.push(...page.tasks);
        c = page.nextCursor;
      }
      if (gen.current !== mine) return; // a refresh or "Show more" since: theirs wins
      setMore(rows);
      setCursor(c);
    })().catch(() => {}); // keep what's shown; the next poll tries again
  }, [data, base, query]);
  useTasksChanged(refresh);
  const taskHref = useTaskHref();
  const pathname = usePathname();
  // Owner changes from the row pickers, by task id: shown at once, put back with the reason when the save fails.
  const [owners, setOwners] = useState<Record<string, RowOwner>>({});
  // A fresh read shows the saved owners itself.
  useEffect(() => setOwners((o) => (Object.values(o).some((r) => r.saved) ? Object.fromEntries(Object.entries(o).filter(([, r]) => !r.saved)) : o)), [data]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");

  if (!data) {
    return failed ? (
      <LoadFailed what="tasks" onRetry={() => void reload()} className="py-4" />
    ) : (
      <p role="status" className="py-4 text-sm text-muted-foreground">
        Loading tasks…
      </p>
    );
  }

  const next = cursor === undefined ? data.nextCursor : cursor;
  const seen = new Set(data.tasks.map((t) => t.id));
  const tasks = [...data.tasks, ...more.filter((t) => !seen.has(t.id))];
  const posts = data.posts ?? [];

  const showMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError("");
    const mine = ++gen.current;
    try {
      const page = await tasksApi.page(base, query, next);
      if (gen.current !== mine) return; // the pages were read again meanwhile; this one may overlap them
      extraPages.current += 1;
      setMore((m) => [...m, ...page.tasks]);
      setCursor(page.nextCursor);
    } catch (e) {
      setMoreError(errorMessage(e, "Couldn't load more tasks. Try again."));
    } finally {
      setLoadingMore(false);
    }
  };

  // The patch announces the change once; the list then reads again (useTasksChanged).
  const setOwner = async (t: TaskDto, value: string) => {
    setOwners((o) => ({ ...o, [t.id]: { value } }));
    try {
      await tasksApi.patch(base, t.id, ownerFromValue(value));
      setOwners((o) => ({ ...o, [t.id]: { value, saved: true } }));
    } catch (e) {
      setOwners((o) => ({ ...o, [t.id]: { error: errorMessage(e, "Couldn't change the owner. Try again.") } }));
    }
  };
  // Ticks on rows the list no longer shows (reassigned out of this view) don't count.
  const picked = assign ? tasks.filter((t) => selected.has(t.id)).map((t) => t.id) : [];
  const allPicked = tasks.length > 0 && picked.length === tasks.length;
  const tick = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const tooMany = picked.length > ASSIGN_MAX ? `Pick ${ASSIGN_MAX} tasks or fewer.` : "";
  const assignPicked = async () => {
    if (!picked.length || tooMany || bulkBusy) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      await tasksApi.assign(base, { ids: picked, ...ownerFromValue(bulkOwner) });
      setSelected(new Set());
      setBulkOwner("");
    } catch (e) {
      // A 409 names the task that can't take this owner; nothing was changed.
      setBulkError(errorMessage(e, "Couldn't assign the tasks. Try again."));
    } finally {
      setBulkBusy(false);
    }
  };

  if (!tasks.length && !posts.length) {
    if (empty) return <p className="py-1 text-sm text-muted-foreground">{empty}</p>;
    return <EmptyState icon={ListTodo} title="Nothing here" description="No tasks in this view. Try another view or area." className="py-6" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p role="status" className="text-xs text-muted-foreground">
          Couldn&rsquo;t refresh. Showing the last update.
        </p>
      ) : null}
      {assign && picked.length ? (
        <div role="group" aria-label="Selected tasks" className="flex flex-col gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{picked.length} selected</span>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <label className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-muted-foreground">Assign to</span>
              <PersonSelect value={bulkOwner} people={assign.people} roles={assign.roles} empty="Unassigned" disabled={bulkBusy} className="h-8 w-auto min-w-0 max-w-[12rem] text-sm" onChange={setBulkOwner} />
            </label>
            <Button size="sm" disabled={bulkBusy || !!tooMany} onClick={() => void assignPicked()}>
              {bulkBusy ? "Assigning…" : "Assign"}
            </Button>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          {tooMany || bulkError ? (
            <p role="alert" className="text-xs text-destructive">
              {tooMany || bulkError}
            </p>
          ) : null}
        </div>
      ) : null}
      {/* Wide table, narrow screen: the table scrolls inside its card, the page never does. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border">
              {assign ? (
                <th scope="col" className={`${th} w-px pr-0`}>
                  <label className={check}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label="Select all tasks shown"
                      checked={allPicked}
                      ref={(el) => {
                        if (el) el.indeterminate = picked.length > 0 && !allPicked;
                      }}
                      onChange={(e) => setSelected(new Set(e.target.checked ? tasks.map((t) => t.id) : []))}
                    />
                  </label>
                </th>
              ) : null}
              <th scope="col" className={th}>Title</th>
              <th scope="col" className={th}>Areas</th>
              <th scope="col" className={th}>Owner</th>
              <th scope="col" className={th}>Due</th>
              <th scope="col" className={th}>Priority</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Project</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <PostTableRow key={`post-${p.id}`} post={p} withTick={!!assign} />
            ))}
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                {assign ? (
                  <td className={`${td} pr-0`}>
                    <label className={check}>
                      <input type="checkbox" className="size-4 accent-primary" aria-label={`Select “${t.title}”`} checked={selected.has(t.id)} onChange={(e) => tick(t.id, e.target.checked)} />
                    </label>
                  </td>
                ) : null}
                <td className={td}>
                  <span className="flex items-center gap-2">
                    <FindingTag kind={t.findingKind} />
                    <Link href={taskHref(t.id)} scroll={false} onClick={(e) => shallowClick(e, taskHref(t.id), pathname)} className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {t.title}
                    </Link>
                  </span>
                  {t.checklist.total ? (
                    <span className="block text-xs text-muted-foreground">
                      {t.checklist.done} of {t.checklist.total} checked
                    </span>
                  ) : null}
                </td>
                <td className={`${td} text-muted-foreground`}>{t.areas.map((a) => AREA_LABEL[a] ?? a).join(", ") || "None"}</td>
                {assign ? (
                  <td className={td}>
                    <PersonSelect
                      aria-label={`Owner of “${t.title}”`}
                      value={owners[t.id]?.value ?? ownerValue(t)}
                      people={assign.people}
                      current={t.owner}
                      roles={assign.roles}
                      currentRole={t.ownerRole}
                      empty="Unassigned"
                      disabled={owners[t.id]?.value !== undefined && !owners[t.id]?.saved}
                      className="h-8 w-auto max-w-[12rem] text-sm"
                      onChange={(v) => void setOwner(t, v)}
                    />
                    {owners[t.id]?.error ? (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        {owners[t.id]?.error}
                      </p>
                    ) : null}
                  </td>
                ) : (
                  <td className={`${td} text-muted-foreground`}>{ownerLabel(t.owner, t.ownerRole)}</td>
                )}
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{dueLabel(t.dueOn)}</td>
                <td className={`${td} text-muted-foreground`}>{PRIORITY_LABEL[t.priority] ?? t.priority}</td>
                <td className={td}>
                  <span className="flex flex-wrap gap-1">
                    <StatusBadge status={t.status}>{STATUS_LABEL[t.status] ?? t.status}</StatusBadge>
                    {t.blockedReason ? <StatusBadge status="BLOCKED">Blocked</StatusBadge> : null}
                  </span>
                </td>
                <td className={`${td} text-muted-foreground`}>{t.project?.name ?? "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {next ? (
        <div className="flex flex-col items-start gap-1">
          <Button size="sm" variant="outline" disabled={loadingMore} onClick={() => void showMore()}>
            {loadingMore ? "Loading…" : "Show more"}
          </Button>
          {moreError ? (
            <p role="alert" className="text-xs text-destructive">
              {moreError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A post of yours that needs action: tagged "Post", it opens in the Overview's post peek. */
function PostTableRow({ post, withTick }: { post: PostRow; withTick: boolean }) {
  return (
    <tr className="border-b border-border hover:bg-muted/50">
      {withTick ? <td className={td} /> : null}
      <td className={td}>
        <span className="flex items-center gap-2">
          <span className="shrink-0 rounded-[8px] bg-accent px-2 text-xs text-accent-foreground">Post</span>
          <Link href={`/?post=${encodeURIComponent(post.id)}`} className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {post.title}
          </Link>
        </span>
        <span className="block text-xs text-muted-foreground">{CHANNEL_LABEL[post.channel] ?? post.channel}</span>
      </td>
      <td className={`${td} text-muted-foreground`}>Content</td>
      <td className={`${td} text-muted-foreground`}>You</td>
      <td className={`${td} whitespace-nowrap text-muted-foreground`}>
        {post.scheduledFor ? new Date(post.scheduledFor).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "No date"}
      </td>
      <td className={`${td} text-muted-foreground`}>None</td>
      <td className={td}>
        <StatusBadge status={post.status}>{POST_STATUS_LABEL[post.status] ?? post.status}</StatusBadge>
      </td>
      <td className={`${td} text-muted-foreground`}>None</td>
    </tr>
  );
}
