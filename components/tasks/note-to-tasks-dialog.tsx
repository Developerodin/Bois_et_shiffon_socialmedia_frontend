"use client";

import { useEffect, useId, useState } from "react";
import { TASK_AREAS, TASK_PRIORITIES, type TaskProposalDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { tasksApi } from "@/lib/tasks-api";
import { PersonSelect } from "@/components/tasks/task-actions";
import { AreaChecks, PrioritySelect, useTaskPeople } from "@/components/tasks/new-task-dialog";

const NOTE_MAX = 8_000;

/** One proposal as the person edits it: form values ("" for none) and whether it is kept. */
export type ProposalRow = { key: string; keep: boolean; title: string; description: string; areas: string[]; ownerId: string; dueOn: string; priority: string };

/** A proposal as an editable row. The model's areas and priority are kept only when they are ones a task can have. */
export const rowOf = (p: TaskProposalDto, i: number): ProposalRow => ({
  key: String(i),
  keep: true,
  title: p.title,
  description: p.description ?? "",
  areas: p.areas.filter((a) => (TASK_AREAS as readonly string[]).includes(a)),
  ownerId: p.ownerId ?? "",
  dueOn: p.dueOn ?? "",
  priority: (TASK_PRIORITIES as readonly string[]).includes(p.priority) ? p.priority : "NORMAL",
});

/** POST tasks/batch's body: the kept rows only, blank optional fields left out. */
export function batchBody(requestId: string, rows: ProposalRow[]): { requestId: string; tasks: TaskProposalDto[] } {
  return {
    requestId,
    tasks: rows
      .filter((r) => r.keep)
      .map((r) => ({
        title: r.title.trim(),
        ...(r.description.trim() ? { description: r.description.trim() } : {}),
        areas: r.areas,
        priority: r.priority,
        ...(r.ownerId ? { ownerId: r.ownerId } : {}),
        ...(r.dueOn ? { dueOn: r.dueOn } : {}),
      })),
  };
}

/**
 * One opening of the dialog: one requestId for every Create in it, so a retry after a failure or a dropped answer
 * returns the tasks the first request made instead of making them twice.
 */
export function noteSession(): { requestId: string; create: (base: string, rows: ProposalRow[]) => ReturnType<typeof tasksApi.batch> } {
  const requestId = crypto.randomUUID();
  return { requestId, create: (base, rows) => tasksApi.batch(base, batchBody(requestId, rows)) };
}

/** Why Create can't be pressed yet, or "". */
function whyNot(rows: ProposalRow[]): string {
  const kept = rows.filter((r) => r.keep);
  if (!kept.length) return "Tick at least one task to create.";
  if (kept.some((r) => !r.title.trim())) return "Every ticked task needs a title.";
  if (kept.some((r) => !r.areas.length)) return "Every ticked task needs at least one area.";
  return "";
}

/**
 * Quick create → Tasks from a note (tasks.manage): paste a note, the model proposes up to 20 tasks (nothing is stored),
 * the person edits, unticks or keeps each, then Create sends the kept ones in one batch. The model's text shows as
 * plain text in form fields, never as HTML.
 */
export function NoteToTasksDialog({ base, open, onOpenChange }: { base: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ProposalRow[] | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "creating">("");
  const [error, setError] = useState("");
  const [session, setSession] = useState(noteSession);
  const { people, failed } = useTaskPeople(base, open && rows !== null);
  const ids = { note: useId(), count: useId(), why: useId() };

  useEffect(() => {
    if (!open) return;
    setNote("");
    setRows(null);
    setError("");
    setSession(noteSession());
  }, [open]);

  const read = async () => {
    if (!note.trim() || busy) return;
    setBusy("reading");
    setError("");
    try {
      setRows((await tasksApi.fromNote(base, note)).map(rowOf));
    } catch (e) {
      // 502/503 (the model failed, or isn't set up) and the hourly limit come with a message for the person.
      setError(errorMessage(e, "Couldn't read the note. Try again."));
    } finally {
      setBusy("");
    }
  };

  const create = async () => {
    if (!rows || whyNot(rows) || busy) return;
    setBusy("creating");
    setError("");
    try {
      const made = await session.create(base, rows);
      onOpenChange(false);
      toast({ title: made.length === 1 ? "1 task created" : `${made.length} tasks created`, href: "/tasks", tone: "success" });
    } catch (e) {
      setError(errorMessage(e, "Couldn't create the tasks. Try again."));
    } finally {
      setBusy("");
    }
  };

  const edit = (key: string, patch: Partial<ProposalRow>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? rs);
  // No proposals: there is nothing to tick, so no reason shows beside the (absent) Create button.
  const blocked = rows ? (rows.length ? whyNot(rows) : "") : note.trim() ? "" : "Paste or type a note first.";
  const kept = rows?.filter((r) => r.keep).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tasks from a note</DialogTitle>
          <DialogDescription>
            {rows ? "Check each task, change what's wrong and untick any you don't want. Nothing is made until you press Create." : "Paste meeting notes or a to-do list. We'll suggest tasks; nothing is made until you create them."}
          </DialogDescription>
        </DialogHeader>
        {rows === null ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.note} className="text-sm font-medium">
              Note
            </label>
            <Textarea id={ids.note} value={note} maxLength={NOTE_MAX} rows={10} disabled={!!busy} onChange={(e) => setNote(e.target.value)} aria-describedby={ids.count} />
            <span id={ids.count} className="self-end text-xs text-muted-foreground">
              {note.length.toLocaleString()}/{NOTE_MAX.toLocaleString()}
            </span>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks found in this note. Go back to add more detail.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {failed ? <li className="text-xs text-muted-foreground">Couldn&rsquo;t load the people on this business. Owners can be set after the tasks are made.</li> : null}
            {rows.map((r, i) => (
              <ProposalEditor key={r.key} n={i + 1} row={r} people={people} onChange={(p) => edit(r.key, p)} />
            ))}
          </ul>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter className="items-center">
          {blocked ? (
            <p id={ids.why} className="text-xs text-muted-foreground sm:mr-auto">
              {blocked}
            </p>
          ) : null}
          {rows !== null ? (
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => setRows(null)}>
              Back to the note
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {rows === null ? (
            <Button type="button" disabled={!!busy || !!blocked} aria-describedby={blocked ? ids.why : undefined} onClick={() => void read()}>
              {busy === "reading" ? "Reading the note…" : "Suggest tasks"}
            </Button>
          ) : rows.length ? (
            <Button type="button" disabled={!!busy || !!blocked} aria-describedby={blocked ? ids.why : undefined} onClick={() => void create()}>
              {busy === "creating" ? "Creating…" : kept === 1 ? "Create 1 task" : `Create ${kept} tasks`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalEditor({ n, row, people, onChange }: { n: number; row: ProposalRow; people: Parameters<typeof PersonSelect>[0]["people"]; onChange: (p: Partial<ProposalRow>) => void }) {
  const ids = { title: useId(), description: useId(), priority: useId(), owner: useId(), due: useId() };
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <label className="flex items-center gap-2 text-sm font-medium pointer-coarse:min-h-11">
        <input type="checkbox" className="size-4 accent-primary" checked={row.keep} onChange={(e) => onChange({ keep: e.target.checked })} />
        Create task {n}
      </label>
      {row.keep ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.title} className="text-sm font-medium">
              Title
            </label>
            <Input id={ids.title} value={row.title} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.description} className="text-sm font-medium">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea id={ids.description} value={row.description} rows={2} maxLength={10_000} onChange={(e) => onChange({ description: e.target.value })} />
          </div>
          <AreaChecks value={row.areas} onChange={(areas) => onChange({ areas })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.owner} className="text-sm font-medium">
                Owner
              </label>
              <PersonSelect id={ids.owner} value={row.ownerId} people={people} empty="Unassigned" onChange={(ownerId) => onChange({ ownerId })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.due} className="text-sm font-medium">
                Due
              </label>
              <Input id={ids.due} type="date" value={row.dueOn} onChange={(e) => onChange({ dueOn: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.priority} className="text-sm font-medium">
                Priority
              </label>
              <PrioritySelect id={ids.priority} value={row.priority} onChange={(priority) => onChange({ priority })} />
            </div>
          </div>
        </>
      ) : (
        <p className="truncate text-sm text-muted-foreground">{row.title || "Untitled"} won&rsquo;t be created.</p>
      )}
    </li>
  );
}
