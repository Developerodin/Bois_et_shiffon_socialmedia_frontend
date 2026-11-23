"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { TaskDto, TaskPersonDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { tasksApi, type TaskActionBody, type TaskPage } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";
import { FindingTag, useTaskHref, useTasksChanged } from "@/components/tasks/task-list";
import { shallowClick } from "@/lib/workspace-view";
import {
  AREA_LABEL,
  BOARD_COLUMNS,
  boardMove,
  dueLabel,
  ownerLabel,
  STATUS_LABEL,
  tasksQuery,
  type AreaParam,
  type BoardStatus,
  type SourceParam,
} from "@/components/tasks/task-views";

const pickPage = (d: TaskPage) => d;

/**
 * Open tasks and the last 30 days' done ones in four status columns. Dragging a card (or its "Move to" select) runs the
 * matching action when the server lists it for this person; otherwise the reason shows above the board.
 * ponytail: the first 50 of each (open, done); a note says so and the list view pages through the rest.
 */
export function TaskBoard({ base, area, source }: { base: string; area: AreaParam; source?: SourceParam }) {
  const open = useJob(`${base}/${tasksQuery({ view: "open", area, source })}`, { pick: pickPage, intervals: JOB_INTERVALS.tasks });
  const done = useJob(`${base}/${tasksQuery({ view: "done", area, source })}`, { pick: pickPage, intervals: JOB_INTERVALS.tasks });
  const { reload: reloadOpen } = open;
  const { reload: reloadDone } = done;
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState<TaskDto | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const reloadBoth = useCallback(() => {
    void reloadOpen();
    void reloadDone();
  }, [reloadOpen, reloadDone]);
  useTasksChanged(reloadBoth);

  if (!open.data || !done.data) {
    return open.failed || done.failed ? (
      <LoadFailed what="tasks" onRetry={reloadBoth} className="py-4" />
    ) : (
      <p role="status" className="py-4 text-sm text-muted-foreground">
        Loading tasks…
      </p>
    );
  }

  const tasks = [...open.data.tasks, ...done.data.tasks];
  const truncated = !!open.data.nextCursor || !!done.data.nextCursor;

  async function run(task: TaskDto, body: TaskActionBody) {
    setBusyId(task.id);
    setMessage("");
    try {
      await tasksApi.act(base, task.id, body);
    } catch (e) {
      setMessage(`“${task.title}”: ${errorMessage(e, "Couldn't move it. Try again.")}`);
    } finally {
      setBusyId(null);
    }
  }

  function moveTo(task: TaskDto, to: BoardStatus) {
    if (task.status === to) return;
    const r = boardMove(task, to);
    if ("refused" in r) return setMessage(`“${task.title}”: ${r.refused}`);
    setMessage("");
    if (r.action === "submitForReview") return setAsking(task);
    void run(task, { action: r.action });
  }

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </p>
      ) : null}
      {open.failed || done.failed ? (
        <p role="status" className="text-xs text-muted-foreground">
          Couldn&rsquo;t refresh. Showing the last update.
        </p>
      ) : null}
      {truncated ? <p className="text-xs text-muted-foreground">The board shows the first 50 open and 50 done tasks. The list shows them all.</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((col) => {
          const inCol = tasks.filter((t) => t.status === col);
          return (
            <section
              key={col}
              aria-label={STATUS_LABEL[col]}
              onDragOver={(e) => {
                if (dragId) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const t = tasks.find((x) => x.id === dragId);
                setDragId(null);
                if (t) moveTo(t, col);
              }}
              className="flex min-h-40 flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm"
            >
              <h2 className="px-1 text-sm font-medium">
                {STATUS_LABEL[col]} <span className="text-muted-foreground">({inCol.length})</span>
              </h2>
              {inCol.map((t) => (
                <Card key={t.id} task={t} busy={busyId === t.id} dragging={dragId === t.id} onDrag={setDragId} onMove={(to) => moveTo(t, to)} />
              ))}
            </section>
          );
        })}
      </div>
      {asking ? <ReviewerDialog key={asking.id} base={base} task={asking} onClose={() => setAsking(null)} onSend={(reviewerId) => run(asking, { action: "submitForReview", reviewerId })} /> : null}
    </div>
  );
}

function Card({ task, busy, dragging, onDrag, onMove }: { task: TaskDto; busy: boolean; dragging: boolean; onDrag: (id: string | null) => void; onMove: (to: BoardStatus) => void }) {
  const taskHref = useTaskHref();
  const pathname = usePathname();
  const moveId = useId();
  return (
    <article
      draggable={!busy}
      onDragStart={(e) => {
        onDrag(task.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
      }}
      onDragEnd={() => onDrag(null)}
      aria-busy={busy || undefined}
      className={cn("flex flex-col gap-2 rounded-xl border border-border bg-background p-3 active:cursor-grabbing", (dragging || busy) && "opacity-50")}
    >
      <Link href={taskHref(task.id)} scroll={false} draggable={false} onClick={(e) => shallowClick(e, taskHref(task.id), pathname)} className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {task.title}
      </Link>
      <p className="text-xs text-muted-foreground">
        {ownerLabel(task.owner, task.ownerRole)} · {dueLabel(task.dueOn)}
        {task.areas.length ? ` · ${task.areas.map((a) => AREA_LABEL[a] ?? a).join(", ")}` : ""}
      </p>
      {task.blockedReason || task.findingKind ? (
        <span className="flex flex-wrap items-center gap-1">
          <FindingTag kind={task.findingKind} />
          {task.blockedReason ? <StatusBadge status="BLOCKED">Blocked</StatusBadge> : null}
        </span>
      ) : null}
      {/* The keyboard's way to move a card. */}
      <label htmlFor={moveId} className="sr-only">
        Move “{task.title}” to
      </label>
      <select
        id={moveId}
        value=""
        disabled={busy}
        onChange={(e) => e.target.value && onMove(e.target.value as BoardStatus)}
        className={cn(selectClass, "h-8 text-xs pointer-coarse:h-11")}
      >
        <option value="">Move to…</option>
        {BOARD_COLUMNS.filter((c) => c !== task.status).map((c) => (
          <option key={c} value={c}>
            {STATUS_LABEL[c]}
          </option>
        ))}
      </select>
    </article>
  );
}

/** Sending a task for review: pick who reviews it (the current reviewer is preselected). */
function ReviewerDialog({ base, task, onClose, onSend }: { base: string; task: TaskDto; onClose: () => void; onSend: (reviewerId: string) => Promise<void> }) {
  const [people, setPeople] = useState<TaskPersonDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reviewerId, setReviewerId] = useState(task.reviewer && !task.reviewer.gone ? task.reviewer.id : "");
  const [sending, setSending] = useState(false);
  const selectId = useId();
  const reasonId = useId();

  useEffect(() => {
    let alive = true;
    tasksApi.people(base).then(
      (p) => alive && setPeople(p),
      () => alive && setLoadError(true),
    );
    return () => {
      alive = false;
    };
  }, [base]);

  // The current reviewer stays pickable even when the people list couldn't load or leaves them out.
  const options = [...(people ?? [])];
  if (task.reviewer && !task.reviewer.gone && !options.some((p) => p.id === task.reviewer!.id)) options.unshift(task.reviewer);

  const send = async () => {
    setSending(true);
    await onSend(reviewerId);
    setSending(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Send for review</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Pick who reviews “{task.title}”. It moves to In review.</p>
          <label htmlFor={selectId} className="text-sm font-medium">
            Reviewer
          </label>
          <select id={selectId} value={reviewerId} disabled={sending} onChange={(e) => setReviewerId(e.target.value)} className={cn(selectClass, "pointer-coarse:h-11")}>
            <option value="">{people || loadError ? "Pick a reviewer" : "Loading people…"}</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {loadError ? <p className="text-xs text-muted-foreground">Couldn&rsquo;t load the people on this business. Close and try again.</p> : null}
        </div>
        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-end">
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={sending} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!reviewerId || sending} aria-describedby={!reviewerId ? reasonId : undefined} onClick={() => void send()}>
              {sending ? "Sending…" : "Send for review"}
            </Button>
          </div>
          {!reviewerId ? (
            <p id={reasonId} className="text-xs text-muted-foreground sm:text-right">
              Pick a reviewer first.
            </p>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
