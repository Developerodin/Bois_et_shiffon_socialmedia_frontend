"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { WorkProjectMilestoneDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectsApi } from "@/lib/tasks-api";
import { dueLabel } from "@/components/tasks/task-views";

/** Milestones in order; positions can tie, so the id breaks the tie the same way every time. */
const ordered = (items: WorkProjectMilestoneDto[]) => [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

const iconButton = "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 pointer-coarse:size-11";

/**
 * The project's milestones: tick, add (title and day), move up or down, remove. `canEdit` (tasks.manage) only hides the
 * controls; the server decides. After every write `onChanged` reads the project again, so the list shows what was saved.
 */
export function Milestones({ base, projectId, milestones, canEdit, onChanged }: { base: string; projectId: string; milestones: WorkProjectMilestoneDto[]; canEdit: boolean; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = { h: useId(), title: useId(), due: useId() };
  const items = ordered(milestones);

  async function write(op: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await op();
      return true;
    } catch (e) {
      setError(errorMessage(e, "Couldn't change the milestones. Try again."));
      return false;
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const missing = !title.trim() ? "Give the milestone a title." : !dueOn ? "Pick the day it's due." : "";
  const add = async () => {
    if (missing) return setError(missing);
    if (await write(() => projectsApi.addMilestone(base, projectId, { title: title.trim(), dueOn }))) {
      setTitle("");
      setDueOn("");
    }
  };
  // Moving renumbers the milestones 0..n-1 in the new order, writing only those whose number changes.
  // ponytail: one PATCH per changed milestone; fine for tens, add a bulk reorder route if projects grow long ones.
  const move = (from: number, to: number) => {
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    void write(() => Promise.all(next.map((m, i) => (m.position === i ? null : projectsApi.patchMilestone(base, projectId, m.id, { position: i })))));
  };

  return (
    <section aria-labelledby={ids.h} className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <h2 id={ids.h} className="text-lg font-medium">
        Milestones
      </h2>
      {items.length ? (
        <ul className="flex flex-col">
          {items.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 border-b border-border py-1 last:border-0">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={!!m.doneAt}
                  disabled={!canEdit || busy}
                  onChange={(e) => void write(() => projectsApi.patchMilestone(base, projectId, m.id, { done: e.target.checked }))}
                />
                <span className={m.doneAt ? "min-w-0 flex-1 break-words text-muted-foreground line-through" : "min-w-0 flex-1 break-words"}>{m.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{dueLabel(m.dueOn)}</span>
              </label>
              {canEdit ? (
                <>
                  <button type="button" className={iconButton} disabled={busy || i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="size-4" aria-hidden="true" />
                    <span className="sr-only">Move “{m.title}” up</span>
                  </button>
                  <button type="button" className={iconButton} disabled={busy || i === items.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="size-4" aria-hidden="true" />
                    <span className="sr-only">Move “{m.title}” down</span>
                  </button>
                  <button type="button" className={iconButton} disabled={busy} onClick={() => void write(() => projectsApi.removeMilestone(base, projectId, m.id))}>
                    <X className="size-4" aria-hidden="true" />
                    <span className="sr-only">Remove “{m.title}”</span>
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No milestones yet.</p>
      )}
      {canEdit ? (
        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <label htmlFor={ids.title} className="sr-only">
              New milestone
            </label>
            <Input id={ids.title} className="min-w-0 flex-1 basis-48" value={title} maxLength={120} placeholder="Add a milestone" disabled={busy} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor={ids.due} className="sr-only">
              Due
            </label>
            <Input id={ids.due} className="w-auto" type="date" value={dueOn} disabled={busy} onChange={(e) => setDueOn(e.target.value)} />
            <Button type="submit" size="sm" variant="outline" disabled={busy}>
              Add
            </Button>
          </div>
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
