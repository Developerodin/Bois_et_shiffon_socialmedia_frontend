"use client";

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { TASK_AREAS, TASK_PRIORITIES, type TaskDto, type TaskPersonDto, type WorkProjectDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { projectsApi, tasksApi, type TaskTeam } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";
import { ownerPeople, PersonSelect } from "@/components/tasks/task-actions";
import { AREA_LABEL, ownerFromValue, PRIORITY_LABEL } from "@/components/tasks/task-views";

/** The areas as checkboxes; at least one is needed (the caller says so). */
export function AreaChecks({ value, onChange, legend = "Areas" }: { value: string[]; onChange: (areas: string[]) => void; legend?: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {TASK_AREAS.map((a) => (
          <label key={a} className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
            <input type="checkbox" className="size-4 accent-primary" checked={value.includes(a)} onChange={(e) => onChange(e.target.checked ? [...value, a] : value.filter((x) => x !== a))} />
            {AREA_LABEL[a] ?? a}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PrioritySelect({ id, value, onChange }: { id: string; value: string; onChange: (p: string) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, "pointer-coarse:h-11")}>
      {TASK_PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABEL[p] ?? p}
        </option>
      ))}
    </select>
  );
}

/**
 * The owner picker's people and roles (tasks/people; roles only with tasks.all), loaded once per opening; people is
 * null while loading or when it failed.
 */
export function useTaskPeople(base: string, open: boolean): { people: TaskPersonDto[] | null; roles: TaskTeam["roles"]; failed: boolean } {
  const [team, setTeam] = useState<TaskTeam | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(false);
    tasksApi.team(base).then(
      (t) => live && setTeam(t),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [base, open]);
  return { people: team?.people ?? null, roles: team?.roles ?? [], failed };
}

/** The brand's projects for the Project picker, loaded once per opening; null while loading or when it failed. */
function useProjects(base: string, open: boolean): WorkProjectDto[] | null {
  const [projects, setProjects] = useState<WorkProjectDto[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    projectsApi.first(base).then(
      (p) => live && setProjects(p.projects),
      () => live && setProjects([]),
    );
    return () => {
      live = false;
    };
  }, [base, open]);
  return projects;
}

/**
 * The project a task belongs to. ponytail: lists the first 30 open projects (soonest due first); the task's own project
 * stays pickable when it isn't among them. Add a search here if businesses run more projects than that.
 */
export function ProjectSelect({ id, base, value, current, onChange }: { id: string; base: string; value: string; current?: { id: string; name: string } | null; onChange: (id: string) => void }) {
  const projects = useProjects(base, true);
  const options: { id: string; name: string }[] = [...(projects ?? [])];
  if (current && !options.some((p) => p.id === current.id)) options.unshift(current);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, "pointer-coarse:h-11")}>
      <option value="">{projects ? "No project" : "Loading projects…"}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

const EMPTY = { title: "", description: "", areas: [] as string[], priority: "NORMAL", ownerId: "", dueOn: "", workProjectId: "" };

/**
 * Quick create → Task (tasks.manage): title, areas, priority, owner, due date, project and a description; `projectId`
 * (made from a project's page) starts it in that project. One requestId per opening, so a double click or a retry
 * after a dropped answer returns the first task instead of a second. The owner can be anyone or a role with tasks.all
 * (`all`), else only "Me" or nobody.
 */
export function NewTaskDialog({ base, open, projectId, all, userId, onOpenChange, onCreated }: { base: string; open: boolean; projectId?: string; all: boolean; userId: string; onOpenChange: (o: boolean) => void; onCreated: (t: TaskDto) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const { people, roles, failed } = useTaskPeople(base, open && all);
  const ids = { title: useId(), description: useId(), priority: useId(), owner: useId(), due: useId(), project: useId(), why: useId(), form: useId() };

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, workProjectId: projectId ?? "" });
    setError("");
    setRequestId(crypto.randomUUID());
  }, [open, projectId]);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const invalid = !form.title.trim() ? "Give the task a title." : !form.areas.length ? "Pick at least one area." : "";

  const submit = async () => {
    if (invalid || busy || !requestId) return;
    setBusy(true);
    setError("");
    try {
      const task = await tasksApi.create(base, {
        requestId,
        title: form.title.trim(),
        areas: form.areas,
        priority: form.priority,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.ownerId ? ownerFromValue(form.ownerId) : {}),
        ...(form.dueOn ? { dueOn: form.dueOn } : {}),
        ...(form.workProjectId ? { workProjectId: form.workProjectId } : {}),
      });
      onOpenChange(false);
      onCreated(task);
    } catch (e) {
      setError(errorMessage(e, "Couldn't create the task. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>It opens once it&rsquo;s made, so you can add a checklist, a reviewer or website details.</DialogDescription>
        </DialogHeader>
        <form
          id={ids.form}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.title} className="text-sm font-medium">
              Title
            </label>
            <Input id={ids.title} value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />
          </div>
          <AreaChecks value={form.areas} onChange={(a) => set("areas", a)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.priority} className="text-sm font-medium">
                Priority
              </label>
              <PrioritySelect id={ids.priority} value={form.priority} onChange={(p) => set("priority", p)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.due} className="text-sm font-medium">
                Due <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input id={ids.due} type="date" value={form.dueOn} onChange={(e) => set("dueOn", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor={ids.owner} className="text-sm font-medium">
                Owner
              </label>
              <PersonSelect id={ids.owner} value={form.ownerId} people={ownerPeople(people, all, userId)} roles={roles} empty="Unassigned" onChange={(v) => set("ownerId", v)} />
              {failed ? <p className="text-xs text-muted-foreground">Couldn&rsquo;t load the people on this business. You can assign the task after it&rsquo;s made.</p> : null}
            </div>
            {open ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor={ids.project} className="text-sm font-medium">
                  Project <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <ProjectSelect id={ids.project} base={base} value={form.workProjectId} onChange={(v) => set("workProjectId", v)} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.description} className="text-sm font-medium">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea id={ids.description} value={form.description} maxLength={10_000} onChange={(e) => set("description", e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter className="items-center">
          {invalid ? (
            <p id={ids.why} className="text-xs text-muted-foreground sm:mr-auto">
              {invalid}
            </p>
          ) : null}
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={ids.form} disabled={busy || !!invalid} aria-describedby={invalid ? ids.why : undefined}>
            {busy ? "Creating…" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "New task" on a page that lists tasks (tasks.manage): the dialog, then the new task opens in this page's peek. On a
 * project's page it starts in that project. The lists refresh themselves from the create (tasksApi announces it).
 */
export function NewTaskButton({ base, projectId, all, userId }: { base: string; projectId?: string; all: boolean; userId: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        New task
      </Button>
      <NewTaskDialog
        base={base}
        projectId={projectId}
        all={all}
        userId={userId}
        open={open}
        onOpenChange={setOpen}
        onCreated={(t) => {
          const q = new URLSearchParams(window.location.search);
          q.set("task", t.id);
          window.history.pushState(null, "", `${pathname}?${q}`);
        }}
      />
    </>
  );
}
