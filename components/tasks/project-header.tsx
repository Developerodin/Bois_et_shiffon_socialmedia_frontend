"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { WORK_PROJECT_STATUSES, type TaskPersonDto, type WorkProjectDetailDto } from "@/shared";
import { errorMessage, request } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { projectsApi, tasksApi } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";
import { PersonSelect } from "@/components/tasks/task-actions";
import { dueLabel, ownerLabel, progressLabel, progressPercent, PROJECT_STATUS_LABEL, STATUS_LABEL } from "@/components/tasks/task-views";

/** A project's progress: a bar and "3 of 8 done" (cancelled tasks don't count). */
export function ProjectProgress({ progress, label }: { progress: { done: number; total: number }; label: string }) {
  const pct = progressPercent(progress);
  const text = progressLabel(progress);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={text} className="h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{text}</span>
    </div>
  );
}

/** The campaign's posts in the Overview's calendar, filtered to this campaign. */
const campaignHref = (id: string) => `/?panel=content&cf_campaignId=${encodeURIComponent(id)}`;

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;

/**
 * The project's facts: owner, dates, status, progress, the linked campaign and task counts by status. With tasks.manage
 * the owner, dates and status are edited in place (each change saves that one field), and "Visible to client" shares the
 * project with the business's client reviewers; unsharing is refused while a client reviews one of its tasks, and the
 * server's reason shows here. `perms` only hides controls; the server decides.
 */
export function ProjectHeader({ base, project, canManage, onSaved }: { base: string; project: WorkProjectDetailDto; canManage: boolean; onSaved: (p: WorkProjectDetailDto) => void }) {
  const [people, setPeople] = useState<TaskPersonDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = { owner: useId(), status: useId(), starts: useId(), due: useId(), campaign: useId(), share: useId(), shareHint: useId() };
  // The brand's campaigns for the Campaign picker; null while loading or when they couldn't be read.
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[] | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    tasksApi.people(base).then(
      (p) => alive && setPeople(p),
      () => alive && setPeople([]),
    );
    request<{ campaigns: { id: string; name: string }[] }>(`${base}/campaigns`).then(
      (r) => alive && setCampaigns(r.campaigns),
      () => alive && setCampaigns(null),
    );
    return () => {
      alive = false;
    };
  }, [base, canManage]);

  const save = async (fields: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      onSaved(await projectsApi.patch(base, project.id, fields));
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the project. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const row = (term: string, value: ReactNode, htmlFor?: string) => (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{htmlFor ? <label htmlFor={htmlFor}>{term}</label> : term}</dt>
      <dd className="min-w-0 text-sm">{value}</dd>
    </div>
  );

  return (
    <section aria-label="About this project" className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      {project.description ? <p className="whitespace-pre-wrap text-sm">{project.description}</p> : null}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canManage
          ? row(
              "Owner",
              <PersonSelect id={ids.owner} value={project.owner?.id ?? ""} people={people} current={project.owner} empty="No owner" disabled={busy} onChange={(v) => void save({ ownerId: v || null })} />,
              ids.owner,
            )
          : row("Owner", project.owner ? ownerLabel(project.owner) : "No owner")}
        {canManage
          ? row(
              "Status",
              <select id={ids.status} value={project.status} disabled={busy} onChange={(e) => void save({ status: e.target.value })} className={cn(selectClass, "pointer-coarse:h-11")}>
                {WORK_PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s] ?? s}
                  </option>
                ))}
              </select>,
              ids.status,
            )
          : row("Status", <StatusBadge status={project.status}>{PROJECT_STATUS_LABEL[project.status] ?? project.status}</StatusBadge>)}
        {canManage
          ? row("Starts", <DateField id={ids.starts} value={project.startsOn} disabled={busy} onSave={(v) => void save({ startsOn: v })} />, ids.starts)
          : row("Starts", dueLabel(project.startsOn))}
        {canManage ? row("Due", <DateField id={ids.due} value={project.dueOn} disabled={busy} onSave={(v) => void save({ dueOn: v })} />, ids.due) : row("Due", dueLabel(project.dueOn))}
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        <ProjectProgress progress={project.progress} label="Project progress" />
        <div className="flex flex-col gap-1 text-sm">
          {canManage && campaigns ? (
            <>
              <label htmlFor={ids.campaign} className="text-xs text-muted-foreground">
                Campaign
              </label>
              {/* A campaign has one project at most; picking one that has another is refused, and the reason shows. */}
              <select id={ids.campaign} value={project.campaignId ?? ""} disabled={busy} onChange={(e) => void save({ campaignId: e.target.value || null })} className={cn(selectClass, "pointer-coarse:h-11")}>
                <option value="">None</option>
                {project.campaign && !campaigns.some((c) => c.id === project.campaign!.id) ? <option value={project.campaign.id}>{project.campaign.name}</option> : null}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="text-muted-foreground">Campaign</span>
          )}
          {project.campaign ? (
            <Link href={campaignHref(project.campaign.id)} className="self-start text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {canManage && campaigns ? "Its posts in the calendar" : project.campaign.name}
            </Link>
          ) : canManage && campaigns ? null : (
            "None"
          )}
        </div>
      </div>
      <ul aria-label="Tasks by status" className="flex flex-wrap gap-2">
        {TASK_STATUSES.map((s) => (
          <li key={s}>
            <StatusBadge status={s}>
              {STATUS_LABEL[s]}: {project.taskCounts[s] ?? 0}
            </StatusBadge>
          </li>
        ))}
      </ul>
      {canManage ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <button
              id={ids.share}
              type="button"
              role="switch"
              aria-checked={project.clientVisible}
              aria-describedby={ids.shareHint}
              disabled={busy}
              onClick={() => void save({ clientVisible: !project.clientVisible })}
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border bg-muted transition-colors aria-checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none"
            >
              <span
                aria-hidden="true"
                className={cn("inline-block size-4 rounded-full bg-card shadow transition-transform motion-reduce:transition-none", project.clientVisible ? "translate-x-6" : "translate-x-1")}
              />
            </button>
            <label htmlFor={ids.share} className="text-sm font-medium">
              Visible to client
            </label>
          </div>
          <p id={ids.shareHint} className="text-xs text-muted-foreground">
            The business&rsquo;s client reviewers see this project and every task in it.
          </p>
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

/** A day the person picks; a full date or a cleared field saves, a half-typed one waits. */
function DateField({ id, value, disabled, onSave }: { id: string; value: string | null; disabled: boolean; onSave: (v: string | null) => void }) {
  return (
    <Input
      id={id}
      type="date"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === (value ?? "")) return;
        if (!v) onSave(null);
        else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) onSave(v);
      }}
    />
  );
}
