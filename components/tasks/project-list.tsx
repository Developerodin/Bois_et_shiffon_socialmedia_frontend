"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban } from "lucide-react";
import type { WorkProjectDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { okToDiscard } from "@/components/context/unsaved";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { navFor } from "@/lib/nav";
import { brandBase, projectsApi, projectsQuery, type ProjectPage } from "@/lib/tasks-api";
import { ProjectProgress } from "@/components/tasks/project-header";
import { dueLabel, ownerLabel, PROJECT_STATUS_LABEL } from "@/components/tasks/task-views";

const FILTERS = [
  { value: "", label: "Current" },
  { value: "ARCHIVED", label: "Archived" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

const pickPage = (d: ProjectPage) => d;

/** /projects: the brand's projects with progress bars, soonest due first; "New project" with tasks.manage. */
export function ProjectsPage({ workspaceId, brandId, perms }: { workspaceId: string; brandId: string; perms: string[] }) {
  const base = brandBase(workspaceId, brandId);
  const [filter, setFilter] = useState<Filter>("");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader
        title={navFor("/projects").title}
        crumbs={[{ href: "/tasks", label: navFor("/tasks").title }, { label: navFor("/projects").title }]}
      >
        Launches and pieces of work, with their tasks, milestones and posts in one place.
      </PageHeader>
      {perms.includes("tasks.manage") ? <NewProject base={base} /> : null}
      <SegmentedRadios label="Which projects" name="project-filter" value={filter} onChange={setFilter} options={FILTERS} />
      <section className="rounded-2xl border border-border bg-card px-5 py-2 shadow-sm">
        <Pages key={filter} base={base} query={projectsQuery(filter)} />
      </section>
    </div>
  );
}

function Pages({ base, query }: { base: string; query: string }) {
  const { data, failed, reload } = useJob(`${base}/${query}`, { pick: pickPage, intervals: JOB_INTERVALS.tasks });
  const [more, setMore] = useState<WorkProjectDto[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");

  if (!data) {
    return failed ? (
      <LoadFailed what="projects" onRetry={() => void reload()} className="py-4" />
    ) : (
      <p role="status" className="py-4 text-sm text-muted-foreground">
        Loading projects…
      </p>
    );
  }
  const next = cursor === undefined ? data.nextCursor : cursor;
  const seen = new Set(data.projects.map((p) => p.id));
  const projects = [...data.projects, ...more.filter((p) => !seen.has(p.id))];
  if (!projects.length) return <EmptyState icon={FolderKanban} title="No projects here" description="Projects you start, or that are shared with you, show here." className="py-10" />;

  const showMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const page = await projectsApi.page(base, query, next);
      setMore((m) => [...m, ...page.projects]);
      setCursor(page.nextCursor);
    } catch (e) {
      setMoreError(errorMessage(e, "Couldn't load more projects. Try again."));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p role="status" className="text-xs text-muted-foreground">
          Couldn&rsquo;t refresh. Showing the last update.
        </p>
      ) : null}
      <ul className="flex flex-col">
        {projects.map((p) => (
          <li key={p.id} className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(10rem,1fr)] sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <Link href={`/projects/${encodeURIComponent(p.id)}`} className="break-words font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {p.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {p.owner ? ownerLabel(p.owner) : "No owner"} · Due {dueLabel(p.dueOn)}
              </span>
            </div>
            <span>
              <StatusBadge status={p.status}>{PROJECT_STATUS_LABEL[p.status] ?? p.status}</StatusBadge>
            </span>
            <ProjectProgress progress={p.progress} label={`${p.name} progress`} />
          </li>
        ))}
      </ul>
      {next ? (
        <div className="flex flex-col items-start gap-1 pb-2">
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

/**
 * Start a project by name (tasks.manage), then open it to fill in the rest. One requestId per attempt: a retry after a lost
 * answer returns the project the first request made; a new one is drawn once it succeeds. `onCreated` runs before the
 * new project opens (the top bar's quick create closes its dialog).
 */
export function NewProject({ base, onCreated }: { base: string; onCreated?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const inputId = useId();

  const create = async () => {
    const n = name.trim();
    if (!n) return setError("Give the project a name.");
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const p = await projectsApi.create(base, { name: n, requestId: requestId.current });
      requestId.current = null;
      onCreated?.();
      const href = `/projects/${encodeURIComponent(p.id)}`;
      // Quick create opens this over any page: leaving one with unsaved work asks first; staying shows a link instead.
      if (!okToDiscard()) return void toast({ title: "Project created", href, tone: "success" });
      router.push(href);
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the project. Try again."));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <label htmlFor={inputId} className="sr-only">
          New project name
        </label>
        <Input
          id={inputId}
          className="min-w-0 flex-1 basis-60 sm:max-w-md"
          value={name}
          maxLength={120}
          placeholder="Name a new project"
          disabled={busy}
          onChange={(e) => {
            setName(e.target.value);
            requestId.current = null; // a different name is a different request
          }}
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Starting…" : "New project"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
