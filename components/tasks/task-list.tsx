"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ListTodo } from "lucide-react";
import type { PostRow, TaskDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { CHANNEL_LABEL, STATUS_LABEL as POST_STATUS_LABEL } from "@/lib/post-labels";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { listsCare, onTasksChanged, tasksApi, type TaskPage } from "@/lib/tasks-api";
import { shallowClick } from "@/lib/workspace-view";
import { AREA_LABEL, dueLabel, ownerLabel, PRIORITY_LABEL, STATUS_LABEL, tasksQuery, type AreaParam, type SourceParam, type TaskListView } from "@/components/tasks/task-views";

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
export function FindingTag({ kind }: { kind: string | null }) {
  if (!kind) return null;
  return <span className="shrink-0 rounded-[8px] bg-accent px-2 text-xs text-accent-foreground">{kind}</span>;
}

const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-3 py-3 align-top";

/** One view of the brand's tasks as a table, 50 a page with "Show more". View=mine also lists your posts that need action. */
/** `empty`: a page's own short line for no tasks (a project's), instead of the big "Nothing here". */
export function TaskList(props: { base: string; view: TaskListView; area: AreaParam; source?: SourceParam; workProjectId?: string; empty?: string }) {
  const query = tasksQuery(props);
  // Keyed by the query: a new view starts from its own first page.
  return <Pages key={query} base={props.base} query={query} empty={props.empty} />;
}

function Pages({ base, query, empty }: { base: string; query: string; empty?: string }) {
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
      {/* Wide table, narrow screen: the table scrolls inside its card, the page never does. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border">
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
              <PostTableRow key={`post-${p.id}`} post={p} />
            ))}
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/50">
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
                <td className={`${td} text-muted-foreground`}>{ownerLabel(t.owner)}</td>
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
function PostTableRow({ post }: { post: PostRow }) {
  return (
    <tr className="border-b border-border hover:bg-muted/50">
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
