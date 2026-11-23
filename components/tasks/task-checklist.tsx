"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { TaskChecklistItemDto, TaskDetailDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tasksApi } from "@/lib/tasks-api";
import { TASKS_CHANGED } from "@/components/tasks/task-views";

/** Lines in order; positions can tie (two quick adds), so the id breaks the tie the same way every time. */
const ordered = (items: TaskChecklistItemDto[]) => [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

const iconButton = "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 pointer-coarse:size-11";

/**
 * The task's checklist: tick, add, move up or down, remove. `canEdit` only hides the controls from people the server
 * would refuse (it allows the owner and tasks.manage); the server still decides. Every write fires `tasks:changed`, and
 * the peek reads the task again, so the list shows what was saved.
 */
export function TaskChecklist({ base, task, canEdit }: { base: string; task: TaskDetailDto; canEdit: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  const items = ordered(task.checklistItems);
  if (!canEdit && !items.length) return null;

  async function write(op: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await op();
      return true;
    } catch (e) {
      setError(errorMessage(e, "Couldn't change the checklist. Try again."));
      return false;
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event(TASKS_CHANGED));
    }
  }

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    if (await write(() => tasksApi.addItem(base, task.id, t))) setText("");
  };
  // Moving renumbers the lines 0..n-1 in the new order, writing only those whose number changes.
  // ponytail: one PATCH per changed line; fine for a checklist of tens, add a bulk reorder route if they grow.
  const move = (from: number, to: number) => {
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    void write(() => Promise.all(next.map((x, i) => (x.position === i ? null : tasksApi.patchItem(base, task.id, x.id, { position: i })))));
  };

  return (
    <section aria-labelledby={`${inputId}-h`} className="flex flex-col gap-2">
      <h3 id={`${inputId}-h`} className="text-sm font-medium">
        Checklist{items.length ? ` (${task.checklist.done} of ${task.checklist.total})` : ""}
      </h3>
      {items.length ? (
        <ul className="flex flex-col">
          {items.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2 border-b border-border py-1 last:border-0">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={!!item.doneAt}
                  disabled={!canEdit || busy}
                  onChange={(e) => void write(() => tasksApi.patchItem(base, task.id, item.id, { done: e.target.checked }))}
                />
                <span className={item.doneAt ? "break-words text-muted-foreground line-through" : "break-words"}>{item.text}</span>
              </label>
              {canEdit ? (
                <>
                  <button type="button" className={iconButton} disabled={busy || i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="size-4" aria-hidden="true" />
                    <span className="sr-only">Move “{item.text}” up</span>
                  </button>
                  <button type="button" className={iconButton} disabled={busy || i === items.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="size-4" aria-hidden="true" />
                    <span className="sr-only">Move “{item.text}” down</span>
                  </button>
                  <button type="button" className={iconButton} disabled={busy} onClick={() => void write(() => tasksApi.removeItem(base, task.id, item.id))}>
                    <X className="size-4" aria-hidden="true" />
                    <span className="sr-only">Remove “{item.text}”</span>
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            New checklist line
          </label>
          <Input id={inputId} value={text} maxLength={300} placeholder="Add a line" disabled={busy} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            Add
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
