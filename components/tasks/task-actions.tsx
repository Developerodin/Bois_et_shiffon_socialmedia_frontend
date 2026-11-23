"use client";

import { useId, useState } from "react";
import { TASK_ACTIONS, type TaskAction, type TaskDetailDto, type TaskPersonDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { tasksApi, type TaskActionBody } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";
import { shareToggleShown } from "@/components/tasks/task-comments";
import { recheckDay, roleValue } from "@/components/tasks/task-views";

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
  take: "Take it",
};

/** The main way forward from each status gets the filled button; the rest are outlined. */
const PRIMARY: TaskAction[] = ["take", "start", "submitForReview", "approve", "markDone", "reopen"];
/** These ask for something first (a reviewer, a reason, an optional note) in a short form under the buttons. */
const WITH_FORM: TaskAction[] = ["submitForReview", "approve", "requestChanges", "block"];

/**
 * A picker's options: staff only (owner, waiting on, project owner), or with the business's client reviewers too,
 * labelled so (reviewer). `current` stays pickable when the list leaves them out or failed.
 */
export function personOptions(people: TaskPersonDto[] | null, current: TaskPersonDto | null | undefined, withClients: boolean): { id: string; label: string }[] {
  const options = (people ?? []).filter((o) => withClients || !o.client);
  if (current && !options.some((o) => o.id === current.id)) options.unshift(current);
  return options.map((o) => ({ id: o.id, label: o.gone ? `${o.name} (no longer on this business)` : o.client ? `${o.name} (client)` : o.name }));
}

/**
 * A new task's owner choices: everyone with tasks.all; without it only the person themself, as "Me" (the server
 * refuses any other owner). "Unassigned" is the picker's empty option.
 */
export function ownerPeople(people: TaskPersonDto[] | null, all: boolean, userId: string | null | undefined): TaskPersonDto[] | null {
  if (all) return people;
  return userId ? [{ id: userId, name: "Me", gone: false, client: false }] : [];
}

/**
 * A select of the people who read the brand's tasks: staff, plus clients when `withClients` (the reviewer pickers).
 * `roles` (owner pickers, tasks.all) adds a Roles group whose values are `role:<id>` (ownerValue / ownerFromValue);
 * `currentRole` stays pickable when the roles failed to load. `placeholder` adds a first "no choice yet" option whose
 * value is NO_CHOICE (distinct from `empty`, which is the "nobody" value "").
 */
export const NO_CHOICE = "?";
export function PersonSelect(p: {
  id?: string;
  value: string;
  people: TaskPersonDto[] | null;
  current?: TaskPersonDto | null;
  roles?: { id: string; name: string }[];
  currentRole?: { id: string; name: string } | null;
  withClients?: boolean;
  empty: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  onChange: (id: string) => void;
}) {
  const roles = [...(p.roles ?? [])];
  if (p.currentRole && !roles.some((r) => r.id === p.currentRole!.id)) roles.unshift(p.currentRole);
  return (
    <select id={p.id} aria-label={p["aria-label"]} value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)} className={cn(selectClass, "pointer-coarse:h-11", p.className)}>
      {p.placeholder ? (
        <option value={NO_CHOICE} disabled>
          {p.placeholder}
        </option>
      ) : null}
      <option value="">{p.people ? p.empty : "Loading people…"}</option>
      {personOptions(p.people, p.current, !!p.withClients).map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
      {roles.length ? (
        <optgroup label="Roles">
          {roles.map((r) => (
            <option key={r.id} value={roleValue(r.id)}>
              {r.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

/**
 * What a form's send button posts. A staff reviewer's note or reason stays with the team unless `share` (the server
 * makes it internal otherwise); `share` is only offered where shareToggleShown says so.
 */
export function formBody(form: TaskAction, f: { text: string; personId: string; share: boolean }): TaskActionBody {
  const text = f.text.trim();
  const shared = f.share ? { shareWithClient: true } : {};
  if (form === "submitForReview") return { action: form, reviewerId: f.personId };
  if (form === "approve") return { action: form, ...(text ? { note: text } : {}), ...shared };
  if (form === "requestChanges") return { action: form, reason: text, ...shared };
  return { action: "block", reason: text, ...(f.personId ? { blockedOnId: f.personId } : {}) };
}

/**
 * The status buttons this person may press, straight from `task.actions` (the server's answer; nothing is decided here).
 * A refusal comes back as the server's message and shows as text. tasksApi announces every success (`tasks:changed`).
 * `noPeople`: the viewer may not list the business's people (a client reviewer), so no person pickers show.
 * Marking an SEO task done offers "Check again in 4 weeks" (on by default) to a manager: the recheck day is a PATCH,
 * which needs tasks.manage, sent after the action succeeds.
 * `draftReviewerId`: a reviewer picked in the task's unsaved fields, which "Send for review" starts from.
 */
export function TaskActions(props: {
  base: string;
  task: TaskDetailDto;
  people: TaskPersonDto[] | null;
  onChanged: (t: TaskDetailDto) => void;
  hide?: TaskAction[];
  noPeople?: boolean;
  canManage?: boolean;
  draftReviewerId?: string;
}) {
  const { base, task, people, onChanged, hide = [], noPeople = false, canManage = false, draftReviewerId } = props;
  const [form, setForm] = useState<TaskAction | null>(null);
  const [text, setText] = useState("");
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recheck, setRecheck] = useState(true);
  const [share, setShare] = useState(false);
  const textId = useId();
  const personSelectId = useId();
  const whyId = useId();
  const shown = TASK_ACTIONS.filter((a) => task.actions.includes(a) && !hide.includes(a));
  if (!shown.length && !error) return null;
  const offerRecheck = canManage && shown.includes("markDone") && task.areas.includes("SEO");

  async function run(body: TaskActionBody) {
    setBusy(true);
    setError("");
    try {
      let next = await tasksApi.act(base, task.id, body);
      setForm(null);
      setText("");
      if (body.action === "markDone" && offerRecheck && recheck) {
        try {
          next = await tasksApi.patch(base, task.id, { recheckOn: recheckDay(new Date()) });
        } catch (e) {
          setError(errorMessage(e, "Marked done, but couldn't set the day to check again. Set it in the task's fields."));
        }
      }
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
    setShare(false);
    setPersonId(a === "submitForReview" ? draftReviewerId || (task.reviewer && !task.reviewer.gone ? task.reviewer.id : "") : "");
  };

  const trimmed = text.trim();
  // What the form's send button is waiting for, shown as text beside it.
  const missing = form === "submitForReview" && !personId ? "Pick a reviewer first." : (form === "requestChanges" || form === "block") && !trimmed ? (form === "block" ? "Say what it is waiting on." : "Say what needs to change.") : "";
  const offerShare = (form === "approve" || form === "requestChanges") && shareToggleShown({ staff: !task.viewerIsClient, clientVisible: task.clientVisible });
  const send = () => {
    if (!form || missing) return;
    void run(formBody(form, { text, personId, share: offerShare && share }));
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
      {offerRecheck ? (
        <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
          <input type="checkbox" className="size-4 accent-primary" checked={recheck} disabled={busy} onChange={(e) => setRecheck(e.target.checked)} />
          When marked done, check again in 4 weeks
        </label>
      ) : null}
      {form ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          {(form === "submitForReview" || form === "block") && !noPeople ? (
            <>
              <label htmlFor={personSelectId} className="text-sm font-medium">
                {form === "block" ? "Waiting on (optional)" : "Reviewer"}
              </label>
              <PersonSelect
                id={personSelectId}
                value={personId}
                people={people}
                current={form === "submitForReview" && task.reviewer && !task.reviewer.gone ? task.reviewer : null}
                withClients={form === "submitForReview"}
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
              {/* Kept as a comment: only the team sees it unless shared, like any staff comment. */}
              {offerShare ? (
                <label className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
                  <input type="checkbox" className="size-4 accent-primary" checked={share} disabled={busy} onChange={(e) => setShare(e.target.checked)} />
                  Share with client
                </label>
              ) : null}
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
