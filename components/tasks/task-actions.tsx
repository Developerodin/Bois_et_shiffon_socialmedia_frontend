"use client";

import { useId, useState } from "react";
import { TASK_ACTIONS, type TaskAction, type TaskDetailDto, type TaskPersonDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { tasksApi, type TaskActionBody } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";

export const ACTION_LABEL: Record<TaskAction, string> = {
  start: "Start",
  submitForReview: "Send for review",
  approve: "Approve",
  requestChanges: "Request changes",
  markDone: "Mark done",
  block: "Mark blocked",
  unblock: "Unblock",
  checkedLive: "Checked on live site",
  cancel: "Cancel task",
  reopen: "Reopen",
};

/** The main way forward from each status gets the filled button; the rest are outlined. */
const PRIMARY: TaskAction[] = ["start", "submitForReview", "approve", "markDone", "reopen"];
/** These ask for something first (a reviewer, a reason, an optional note) in a short form under the buttons. */
const WITH_FORM: TaskAction[] = ["submitForReview", "approve", "requestChanges", "block"];

/** A select of the people who read the brand's tasks; `current` stays pickable when the list leaves them out or failed. */
export function PersonSelect(p: {
  id: string;
  value: string;
  people: TaskPersonDto[] | null;
  current?: TaskPersonDto | null;
  empty: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const options = [...(p.people ?? [])];
  if (p.current && !options.some((o) => o.id === p.current!.id)) options.unshift(p.current);
  return (
    <select id={p.id} value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)} className={cn(selectClass, "pointer-coarse:h-11")}>
      <option value="">{p.people ? p.empty : "Loading people…"}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.gone ? `${o.name} (no longer on this business)` : o.name}
        </option>
      ))}
    </select>
  );
}

/**
 * The status buttons this person may press, straight from `task.actions` (the server's answer; nothing is decided here).
 * A refusal comes back as the server's message and shows as text. tasksApi announces every success (`tasks:changed`).
 */
export function TaskActions({ base, task, people, onChanged, hide = [] }: { base: string; task: TaskDetailDto; people: TaskPersonDto[] | null; onChanged: (t: TaskDetailDto) => void; hide?: TaskAction[] }) {
  const [form, setForm] = useState<TaskAction | null>(null);
  const [text, setText] = useState("");
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textId = useId();
  const personSelectId = useId();
  const whyId = useId();
  const shown = TASK_ACTIONS.filter((a) => task.actions.includes(a) && !hide.includes(a));
  if (!shown.length && !error) return null;

  async function run(body: TaskActionBody) {
    setBusy(true);
    setError("");
    try {
      const next = await tasksApi.act(base, task.id, body);
      setForm(null);
      setText("");
      onChanged(next);
    } catch (e) {
      setError(errorMessage(e, "Couldn't do that. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const press = (a: TaskAction) => {
    setError("");
    if (!WITH_FORM.includes(a)) return void run({ action: a });
    setForm(a);
    setText("");
    setPersonId(a === "submitForReview" && task.reviewer && !task.reviewer.gone ? task.reviewer.id : "");
  };

  const trimmed = text.trim();
  // What the form's send button is waiting for, shown as text beside it.
  const missing = form === "submitForReview" && !personId ? "Pick a reviewer first." : (form === "requestChanges" || form === "block") && !trimmed ? (form === "block" ? "Say what it is waiting on." : "Say what needs to change.") : "";
  const send = () => {
    if (!form || missing) return;
    if (form === "submitForReview") return void run({ action: form, reviewerId: personId });
    if (form === "approve") return void run({ action: form, ...(trimmed ? { note: trimmed } : {}) });
    if (form === "requestChanges") return void run({ action: form, reason: trimmed });
    void run({ action: "block", reason: trimmed, ...(personId ? { blockedOnId: personId } : {}) });
  };

  return (
    <section aria-label="Actions" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {shown.map((a) => (
          <Button key={a} size="sm" variant={PRIMARY.includes(a) ? "default" : "outline"} disabled={busy} aria-pressed={WITH_FORM.includes(a) ? form === a : undefined} onClick={() => press(a)}>
            {ACTION_LABEL[a]}
          </Button>
        ))}
      </div>
      {form ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          {form === "submitForReview" || form === "block" ? (
            <>
              <label htmlFor={personSelectId} className="text-sm font-medium">
                {form === "block" ? "Waiting on (optional)" : "Reviewer"}
              </label>
              <PersonSelect
                id={personSelectId}
                value={personId}
                people={people}
                current={form === "submitForReview" && task.reviewer && !task.reviewer.gone ? task.reviewer : null}
                empty={form === "block" ? "Nobody in particular" : "Pick a reviewer"}
                disabled={busy}
                onChange={setPersonId}
              />
            </>
          ) : null}
          {form !== "submitForReview" ? (
            <>
              <label htmlFor={textId} className="text-sm font-medium">
                {form === "approve" ? "Note (optional)" : form === "block" ? "What is it waiting on?" : "What needs to change?"}
              </label>
              <Textarea id={textId} value={text} maxLength={4_000} disabled={busy} onChange={(e) => setText(e.target.value)} className="min-h-20" />
            </>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {missing ? (
              <p id={whyId} className="mr-auto text-xs text-muted-foreground">
                {missing}
              </p>
            ) : null}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setForm(null)}>
              Back
            </Button>
            <Button size="sm" disabled={busy || !!missing} aria-describedby={missing ? whyId : undefined} onClick={send}>
              {busy ? "Sending…" : ACTION_LABEL[form]}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
