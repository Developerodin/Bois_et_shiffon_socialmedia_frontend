"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { TASK_AREAS, TASK_PRIORITIES, type TaskDetailDto, type TaskDto, type TaskPersonDto } from "@/shared";
import { okToDiscard, UnsavedGuardOff, useUnsavedGuard } from "@/components/context/unsaved";
import { ApiError, errorMessage } from "@/components/settings/api";
import { ListSkeleton, selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Peek } from "@/components/workspace/peek";
import { usePeek, type PeekItem } from "@/components/workspace/use-peek";
import { putShared } from "@/components/workspace/use-job";
import { writeRecent } from "@/lib/recent";
import { tasksApi } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";
import { parseViewParts, peekCrumb, peekKey, peekTitle, viewToSearch, type View } from "@/lib/workspace-view";
import { PersonSelect, TaskActions } from "@/components/tasks/task-actions";
import { AREA_LABEL, dueLabel, ownerLabel, PRIORITY_LABEL, STATUS_LABEL, TASKS_CHANGED } from "@/components/tasks/task-views";

/** The task fields a manager edits in the peek, as form values ("" for none). */
export type TaskDraft = { title: string; description: string; priority: string; areas: string[]; dueOn: string; ownerId: string; reviewerId: string };

export const draftOf = (t: TaskDto): TaskDraft => ({
  title: t.title,
  description: t.description ?? "",
  priority: t.priority,
  areas: t.areas,
  dueOn: t.dueOn ?? "",
  ownerId: t.owner?.id ?? "",
  reviewerId: t.reviewer?.id ?? "",
});

// A form value as PATCH takes it: blank optional fields clear (null), the title and priority are sent as typed.
const wire = (k: keyof TaskDraft, v: string | string[]) => (Array.isArray(v) ? v : k === "title" || k === "priority" ? v.trim() : v.trim() || null);
const same = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? [...a].sort().join() === [...b].sort().join() : a === b);

/**
 * The PATCH body for `edits` against the task as last loaded: only fields whose value differs. Two people editing one
 * task overwrite each other per field only (last write wins, spec §9).
 */
export function changedFields(t: TaskDto, edits: Partial<TaskDraft>): Record<string, unknown> {
  const now = draftOf(t);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(edits) as (keyof TaskDraft)[]) {
    const v = edits[k];
    if (v === undefined) continue;
    const next = wire(k, v);
    if (!same(next, wire(k, now[k]))) out[k] = next;
  }
  return out;
}

/** The URL the shared cache keeps a task's detail under: the peek's title reads it (knownName). */
export const taskUrl = (base: string, id: string) => `${base}/tasks/${encodeURIComponent(id)}`;

/**
 * One task in the side peek: status, blocked note, the actions the server lists for this person, and the fields
 * (editable with tasks.manage; Save sends only what changed, and unsaved edits ask before the peek closes).
 */
export function TaskView({ base, id, canManage, onLoaded }: { base: string; id: string; canManage: boolean; onLoaded?: (t: TaskDetailDto) => void }) {
  const [task, setTask] = useState<TaskDetailDto | null>(null);
  const [loadError, setLoadError] = useState<"gone" | "failed" | null>(null);
  const [people, setPeople] = useState<TaskPersonDto[] | null>(null);
  const [peopleFailed, setPeopleFailed] = useState(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const show = useCallback(
    (t: TaskDetailDto) => {
      setTask(t);
      setLoadError(null);
      putShared(taskUrl(base, t.id), { task: t });
      onLoadedRef.current?.(t);
    },
    [base],
  );
  const load = useCallback(() => {
    tasksApi.get(base, id).then(show, (e) => setLoadError(e instanceof ApiError && e.status === 404 ? "gone" : "failed"));
  }, [base, id, show]);
  useEffect(load, [load]);
  // A move on the board or list behind, or this peek's own action: read the task again.
  useEffect(() => {
    window.addEventListener(TASKS_CHANGED, load);
    return () => window.removeEventListener(TASKS_CHANGED, load);
  }, [load]);
  useEffect(() => {
    let alive = true;
    tasksApi.people(base).then(
      (p) => alive && setPeople(p),
      () => {
        if (!alive) return;
        setPeople([]);
        setPeopleFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [base]);

  if (!task) {
    if (loadError === "gone") return <EmptyState icon={SearchX} title="Task not found" description="It was deleted, or it isn't shared with you." className="py-10" />;
    if (loadError === "failed") return <LoadFailed what="this task" onRetry={load} className="px-5 py-6" />;
    return (
      <div className="px-5 py-6">
        <ListSkeleton label="Loading task" rows={3} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={task.status}>{STATUS_LABEL[task.status] ?? task.status}</StatusBadge>
        {task.blockedReason ? <StatusBadge status="BLOCKED">Blocked</StatusBadge> : null}
        {task.findingClearedAt ? <span className="text-xs text-muted-foreground">A later audit no longer finds this.</span> : null}
      </div>
      {task.blockedReason ? (
        <p className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">Waiting on{task.blockedOn ? ` ${ownerLabel(task.blockedOn)}` : ""}:</span> {task.blockedReason}
        </p>
      ) : null}
      <TaskActions base={base} task={task} people={people} onChanged={show} />
      {peopleFailed ? <p className="text-xs text-muted-foreground">Couldn&rsquo;t load the people on this business. Close and open the task to try again.</p> : null}
      {canManage ? <TaskFields key={task.id} base={base} task={task} people={people} onSaved={show} /> : <TaskFacts task={task} />}
    </div>
  );
}

const fieldLabel = "text-sm font-medium";

/** The fields as text, for people who can't edit them. */
function TaskFacts({ task }: { task: TaskDetailDto }) {
  const row = (term: string, value: ReactNode) => (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 flex-1 break-words">{value}</dd>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{task.title}</h2>
      {task.description ? <p className="whitespace-pre-wrap text-sm">{task.description}</p> : null}
      <dl className="flex flex-col gap-2 text-sm">
        {row("Owner", ownerLabel(task.owner))}
        {row("Reviewer", task.reviewer ? ownerLabel(task.reviewer) : "None")}
        {row("Due", dueLabel(task.dueOn))}
        {row("Priority", PRIORITY_LABEL[task.priority] ?? task.priority)}
        {row("Areas", task.areas.map((a) => AREA_LABEL[a] ?? a).join(", ") || "None")}
        {row("Project", task.project?.name ?? "None")}
        {task.post ? row("Post", <PostLink post={task.post} />) : null}
      </dl>
    </div>
  );
}

function PostLink({ post }: { post: { id: string; title: string } }) {
  return (
    <Link href={`/?post=${encodeURIComponent(post.id)}`} className="text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {post.title}
    </Link>
  );
}

/** The editable fields (tasks.manage). Edits are kept per field, so a reload of the task underneath keeps what was typed. */
function TaskFields({ base, task, people, onSaved }: { base: string; task: TaskDetailDto; people: TaskPersonDto[] | null; onSaved: (t: TaskDetailDto) => void }) {
  const [edits, setEdits] = useState<Partial<TaskDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ids = { title: useId(), description: useId(), priority: useId(), due: useId(), owner: useId(), reviewer: useId(), why: useId() };
  const draft = { ...draftOf(task), ...edits };
  const changed = changedFields(task, edits);
  const dirty = Object.keys(changed).length > 0;
  useUnsavedGuard(dirty);
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setEdits((e) => ({ ...e, [k]: v }));
  const invalid = !draft.title.trim() ? "Give the task a title." : !draft.areas.length ? "Pick at least one area." : "";

  const save = async () => {
    if (!dirty || invalid) return;
    setSaving(true);
    setError("");
    try {
      const next = await tasksApi.patch(base, task.id, changed);
      setEdits({});
      onSaved(next);
      window.dispatchEvent(new Event(TASKS_CHANGED));
    } catch (e) {
      setError(errorMessage(e, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.title} className={fieldLabel}>
          Title
        </label>
        <Input id={ids.title} value={draft.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.description} className={fieldLabel}>
          Description
        </label>
        <Textarea id={ids.description} value={draft.description} maxLength={10_000} onChange={(e) => set("description", e.target.value)} />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className={cn(fieldLabel, "mb-1.5")}>Areas</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {TASK_AREAS.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={draft.areas.includes(a)}
                onChange={(e) => set("areas", e.target.checked ? [...draft.areas, a] : draft.areas.filter((x) => x !== a))}
              />
              {AREA_LABEL[a] ?? a}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.priority} className={fieldLabel}>
            Priority
          </label>
          <select id={ids.priority} value={draft.priority} onChange={(e) => set("priority", e.target.value)} className={cn(selectClass, "pointer-coarse:h-11")}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p] ?? p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.due} className={fieldLabel}>
            Due
          </label>
          <Input id={ids.due} type="date" value={draft.dueOn} onChange={(e) => set("dueOn", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.owner} className={fieldLabel}>
            Owner
          </label>
          <PersonSelect id={ids.owner} value={draft.ownerId} people={people} current={task.owner} empty="Unassigned" onChange={(v) => set("ownerId", v)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.reviewer} className={fieldLabel}>
            Reviewer
          </label>
          <PersonSelect id={ids.reviewer} value={draft.reviewerId} people={people} current={task.reviewer} empty="No reviewer" onChange={(v) => set("reviewerId", v)} />
        </div>
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 text-muted-foreground">Project</dt>
          <dd>{task.project?.name ?? "None"}</dd>
        </div>
        {task.post ? (
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-muted-foreground">Post</dt>
            <dd className="min-w-0">
              <PostLink post={task.post} />
            </dd>
          </div>
        ) : null}
      </dl>
      {dirty ? (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background py-3">
          {invalid ? (
            <p id={ids.why} className="mr-auto text-xs text-muted-foreground">
              {invalid}
            </p>
          ) : null}
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setEdits({})}>
            Discard changes
          </Button>
          <Button type="submit" size="sm" disabled={saving || !!invalid} aria-describedby={invalid ? ids.why : undefined}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The task peek on a page of its own (/tasks; the project pages later): opens on `?task=<id>`, asks about unsaved edits
 * before switching or closing, records the task in Recent once it loads. The Overview has its own peek and renders TaskView.
 */
export function TaskPeek({ base, canManage, recentKey }: { base: string; canManage: boolean; recentKey: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [shownId, setShownId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ id: string; title: string } | null>(null);
  // The open task as the URL effect last accepted it, and that URL (put back when the person stays on unsaved edits).
  const shownRef = useRef<string | null>(null);
  const accepted = useRef<string | null>(null);

  const hrefFor = useCallback(
    (id: string | null) => {
      const v: View = id ? { kind: "task", id } : { kind: "home" };
      const s = viewToSearch(v, window.location.search, pathname);
      return s.startsWith("?") ? `${pathname}${s}` : s;
    },
    [pathname],
  );

  useEffect(() => {
    const raw = new URLSearchParams(query).get("task");
    const v = raw === null ? null : parseViewParts("task", raw);
    const next = v?.kind === "task" ? v.id : null;
    // A bad task link: drop it, so Back doesn't return to it.
    if (raw !== null && !next) return void router.replace(hrefFor(null), { scroll: false });
    if (next !== shownRef.current) {
      if (!okToDiscard()) return void router.replace(accepted.current ?? hrefFor(shownRef.current), { scroll: false });
      shownRef.current = next;
      setShownId(next);
    }
    accepted.current = `${pathname}${query ? `?${query}` : ""}`;
  }, [query, pathname, router, hrefFor]);

  const close = () => {
    if (!okToDiscard()) return;
    // The view first, so the URL change that follows finds nothing to ask about.
    shownRef.current = null;
    setShownId(null);
    router.push(hrefFor(null), { scroll: false });
  };

  const view: View | null = shownId ? { kind: "task", id: shownId } : null;
  const item: PeekItem | null = view ? { view, title: peekTitle(view, loaded?.id === shownId ? loaded.title : null), crumb: peekCrumb(view) } : null;
  const peek = usePeek(item);
  const onLoaded = (t: TaskDetailDto) => {
    setLoaded({ id: t.id, title: t.title });
    if (recentKey) writeRecent(recentKey, { kind: "task", id: t.id, at: Date.now() });
  };

  if (!peek.shown || peek.shown.view.kind !== "task") return null;
  return (
    <Peek placement="page" open={peek.live} title={peek.shown.title} crumb={peek.shown.crumb} onClose={close} onExited={peek.onExited} asideRef={peek.ref}>
      <UnsavedGuardOff value={!peek.live}>
        <TaskView key={peekKey(peek.shown.view)} base={base} id={peek.shown.view.id} canManage={canManage} onLoaded={onLoaded} />
      </UnsavedGuardOff>
    </Peek>
  );
}
