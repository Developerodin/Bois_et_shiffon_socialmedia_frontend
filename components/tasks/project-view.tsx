"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { SearchX } from "lucide-react";
import type { PostRow, WorkProjectDetailDto } from "@/shared";
import { ListSkeleton } from "@/components/settings/shared";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { StatusBadge } from "@/components/ui/status-badge";
import { CHANNEL_LABEL, STATUS_LABEL as POST_STATUS_LABEL } from "@/lib/post-labels";
import { JOB_INTERVALS, putShared, useJob } from "@/components/workspace/use-job";
import { navFor } from "@/lib/nav";
import { recentKey } from "@/lib/recent";
import { brandBase } from "@/lib/tasks-api";
import { Milestones } from "@/components/tasks/milestones";
import { ProjectHeader } from "@/components/tasks/project-header";
import { TaskList, useTasksChanged } from "@/components/tasks/task-list";
import { TaskPeek } from "@/components/tasks/task-view";

const pickProject = (d: { project: WorkProjectDetailDto }) => d.project;
const STOP_ON = [403, 404] as const;
const TASK_VIEWS = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done (30 days)" },
] as const;

/**
 * /projects/:id: the project's facts and progress, milestones, its tasks (open or recently done; a title opens the task
 * peek, ?task=), and the linked campaign's posts, which open in the Overview's post peek. Reads again when a task changes.
 */
export function ProjectView({ workspaceId, brandId, projectId, perms, userId }: { workspaceId: string; brandId: string; projectId: string; perms: string[]; userId: string }) {
  const base = brandBase(workspaceId, brandId);
  const url = `${base}/work-projects/${encodeURIComponent(projectId)}`;
  const { data: project, failed, status, reload } = useJob(url, { pick: pickProject, intervals: JOB_INTERVALS.tasks, stopOn: STOP_ON });
  const refresh = useCallback(() => void reload(), [reload]);
  useTasksChanged(refresh);
  const [view, setView] = useState<(typeof TASK_VIEWS)[number]["value"]>("open");
  const canManage = perms.includes("tasks.manage");
  const crumbs = [{ href: "/projects", label: navFor("/projects").title }];

  let body: ReactNode;
  if (!project) {
    if (failed && (status === 404 || status === 403)) {
      body = <EmptyState icon={SearchX} title="Project not found" description="It isn't on this business, or it isn't shared with you." className="py-10" />;
    } else if (failed) body = <LoadFailed what="this project" onRetry={refresh} className="py-6" />;
    else body = <ListSkeleton label="Loading project" rows={4} />;
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <PageHeader title={navFor("/projects").title} crumbs={crumbs} />
        {body}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title={project.name} crumbs={[...crumbs, { label: project.name }]} />
      {failed ? (
        <p role="status" className="-mt-2 text-xs text-muted-foreground">
          Couldn&rsquo;t refresh. Showing the last update.
        </p>
      ) : null}
      <ProjectHeader base={base} project={project} canManage={canManage} onSaved={(p) => putShared(url, { project: p })} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="project-tasks" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="project-tasks" className="text-lg font-medium">
              Tasks
            </h2>
            <SegmentedRadios label="Which tasks" name="project-task-view" value={view} onChange={setView} options={TASK_VIEWS} />
          </div>
          <TaskList base={base} view={view} area="" workProjectId={project.id} />
        </section>
        <Milestones base={base} projectId={project.id} milestones={project.milestones} canEdit={canManage} onChanged={refresh} />
      </div>
      {project.campaign ? <CampaignPosts name={project.campaign.name} posts={project.posts} /> : null}
      <TaskPeek base={base} perms={perms} userId={userId} recentKey={recentKey(workspaceId, brandId, userId)} />
    </div>
  );
}

/** The linked campaign's posts in the calendar window (up to 50); each opens in the Overview's post peek. */
function CampaignPosts({ name, posts }: { name: string; posts: PostRow[] }) {
  return (
    <section aria-labelledby="project-posts" className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <h2 id="project-posts" className="text-lg font-medium">
        Posts in {name}
      </h2>
      {posts.length ? (
        <ul className="flex flex-col">
          {posts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 last:border-0">
              <Link href={`/?post=${encodeURIComponent(p.id)}`} className="min-w-0 flex-1 basis-48 break-words font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {p.title}
              </Link>
              <span className="text-xs text-muted-foreground">{CHANNEL_LABEL[p.channel] ?? p.channel}</span>
              <span className="text-xs text-muted-foreground">
                {p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "No date"}
              </span>
              <StatusBadge status={p.status}>{POST_STATUS_LABEL[p.status] ?? p.status}</StatusBadge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No posts in this campaign in the calendar right now.</p>
      )}
    </section>
  );
}
