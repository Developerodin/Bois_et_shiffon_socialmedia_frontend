"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Gauge, Sparkles } from "lucide-react";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchAgents } from "@/components/agents/api";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListSkeleton, LoadError, formatDate, useLoad } from "@/components/settings/shared";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { navFor } from "@/lib/nav";
import { urlHistoryHref } from "@/lib/seo-links";
import { WriteBrief } from "@/components/performance/seo-brief";
import { PageSection } from "@/components/ui/page-section";

type Severity = "critical" | "high" | "medium" | "low";
type Finding = { id: string; category: string; severity: Severity; title: string; detail: string; fix: string; why?: string; urls?: string[] };
type Report = {
  id: string;
  kind: "SEO" | "GEO";
  score: number;
  summary: string;
  findings: Finding[];
  metrics: Record<string, unknown>;
  createdAt: string;
  /** Finding id → its open task's id (staff with tasks.read only). */
  openTasks?: Record<string, string>;
};
type PageSpeed = { performance: number; seo: number; accessibility: number; bestPractices: number; lcpMs: number | null };
type Question = { question: string; mentioned: boolean; branded?: boolean; brands: string[] };

const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const TONE: Record<Severity, "bad" | "warn" | "muted"> = { critical: "bad", high: "bad", medium: "warn", low: "muted" };
const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 50 ? "text-warning" : "text-destructive");

export function Score({ label, value, big }: { label: string; value: number | null | undefined; big?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={cn("font-display font-medium tabular-nums", big ? "text-4xl" : "text-xl", value == null ? "text-muted-foreground" : scoreTone(value))}>
        {value ?? "—"}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * `action`: beside each finding's row (Make a task); it drops under the row on a narrow screen. Closed rows show the
 * title and two lines of the why; open one for the detail, fix and pages.
 */
/** `history`: link each URL to its page history (flag `data` and the analytics read permission, decided by the page). */
export function Findings({ findings, action, history = false }: { findings: Finding[]; action?: (f: Finding) => ReactNode; history?: boolean }) {
  if (!findings.length) return <p className="text-sm text-muted-foreground">No issues found.</p>;
  return (
    <ol className="flex flex-col divide-y divide-border">
      {findings.map((f, i) => (
        <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-3">
          <details className="group min-w-0 flex-1">
            <summary className="flex cursor-pointer list-none items-start gap-2">
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge tone={TONE[f.severity]}>{SEVERITY_LABEL[f.severity]}</StatusBadge>
                  <span className="text-xs text-muted-foreground">{f.category}</span>
                </div>
                <p className="mt-1 text-sm font-medium">{f.title}</p>
                {f.why && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground group-open:line-clamp-none">{f.why}</p>}
              </div>
            </summary>
            <div className="ml-7 mt-2 flex flex-col gap-2 text-sm">
              <p>{f.detail}</p>
              <p><span className="font-medium">Fix: </span>{f.fix}</p>
              {f.urls?.length ? (
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {f.urls.slice(0, 8).map((u) => (
                    <li key={u} className="truncate">
                      {history ? <Link href={urlHistoryHref(u)} className="underline-offset-2 hover:underline">{u}</Link> : u}
                    </li>
                  ))}
                  {f.urls.length > 8 && <li>+{f.urls.length - 8} more</li>}
                </ul>
              ) : null}
            </div>
          </details>
          {action ? <div className="ml-7 shrink-0 sm:ml-0">{action(f)}</div> : null}
        </li>
      ))}
    </ol>
  );
}

/** The task a finding has (made now, or the open one it already had), or null before asking. */
type FindingTaskMade = { taskId: string; existed: boolean } | null;

/** The finding's task control: "Make a task" until the server answers, then "Open task", which opens it in the tasks page's peek. */
export function findingTaskLink(made: FindingTaskMade): { label: string; href: string | null } {
  return made ? { label: "Open task", href: `/tasks?task=${encodeURIComponent(made.taskId)}` } : { label: "Make a task", href: null };
}

/**
 * "Make a task" on one finding (flag tasks, tasks.manage): POST returns the finding's open task if it has one (existed),
 * else a new one. A 409 means an older audit's open task holds this finding's number; its message says to close that first.
 */
function FindingTask({ url, taskId }: { url: string; taskId?: string }) {
  const [made, setMade] = useState<FindingTaskMade>(taskId ? { taskId, existed: true } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const link = findingTaskLink(made);

  const make = async () => {
    setBusy(true);
    setError("");
    try {
      const d = await request<{ task: { id: string }; existed: boolean }>(url, { method: "POST" });
      setMade({ taskId: d.task.id, existed: d.existed });
    } catch (e) {
      setError(errorMessage(e, "Couldn't make the task. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      {link.href ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={link.href}>{link.label}</Link>
          </Button>
          {made && !(taskId && made.taskId === taskId) ? (
            <span role="status" className="text-xs text-muted-foreground">
              {made.existed ? "This finding already has an open task." : "Task made."}
            </span>
          ) : null}
        </div>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void make()}>
          {busy ? "Making…" : link.label}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Make all tasks": a task for every finding of this report that hasn't got one (the server skips findings with an open
 * task, and ones a person cancelled), then a link to them on the Performance tab.
 */
function MakeAllTasks({ url, kind, onStale, onMade }: { url: string; kind: "SEO" | "GEO"; onStale: () => void; onMade: () => void }) {
  const [made, setMade] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const make = async () => {
    setBusy(true);
    setError("");
    try {
      setMade((await request<{ made: number }>(url, { method: "POST" })).made);
      onMade(); // reload, so each finding shows its task
    } catch (e) {
      setError(errorMessage(e, "Couldn't make the tasks. Try again."));
      // A newer report replaced this one (404): show it.
      if (e instanceof ApiError && e.status === 404) onStale();
    } finally {
      setBusy(false);
    }
  };

  if (made !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span role="status" className="text-xs text-muted-foreground">
          {made ? `${made} ${made === 1 ? "task" : "tasks"} made.` : "Every finding already has a task."}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/tasks?area=seo&view=open&source=${kind.toLowerCase()}`}>Open tasks</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" disabled={busy} onClick={() => void make()}>
        {busy ? "Making…" : "Make all tasks"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Panel({ id, title, report, agent, exportUrl, reportsUrl, findingTaskUrl, brief, history, onStale, children }: { id: string; exportUrl: string; title: string; report: Report | null; agent: string; reportsUrl: string; findingTaskUrl?: (reportId: string, findingId: string) => string; brief?: { base: string; canWriteArticles: boolean }; history: boolean; onStale: () => void; children?: React.ReactNode }) {
  return (
    <PageSection
      id={id}
      title={title}
      className="flex flex-col gap-4"
      description={
        report ? (
          <span className="flex items-baseline gap-2">
            <span className={cn("font-display text-2xl font-medium tabular-nums", scoreTone(report.score))}>{report.score}</span>
            <span>/ 100 · Last run {formatDate(report.createdAt)}</span>
          </span>
        ) : undefined
      }
      actions={
        report ? (
          <>
            {findingTaskUrl && report.findings.length ? <MakeAllTasks key={report.id} url={`${reportsUrl}/${encodeURIComponent(report.id)}/tasks`} kind={report.kind} onStale={onStale} onMade={onStale} /> : null}
            <ExportCsvButton url={exportUrl} label="Export to Excel" filename={`${id}-findings-${new Date().toLocaleDateString("en-CA")}.xlsx`} />
          </>
        ) : undefined
      }
    >
      {report ? (
        <>
          <p className="text-sm leading-relaxed">{report.summary}</p>
          {children}
          <Findings
            findings={report.findings}
            history={history}
            action={findingTaskUrl || brief ? (f) => (
              <div className="flex flex-col items-start gap-2 sm:items-end">
                {findingTaskUrl ? <FindingTask key={`${report.id}:${f.id}:${report.openTasks?.[f.id] ?? ""}`} url={findingTaskUrl(report.id, f.id)} taskId={report.openTasks?.[f.id]} /> : null}
                {brief && (f.urls?.length ?? 0) >= 2 ? <WriteBrief key={`${report.id}:${f.id}`} base={brief.base} body={{ from: "finding", reportId: report.id, findingId: f.id }} canWriteArticles={brief.canWriteArticles} /> : null}
              </div>
            ) : undefined}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No report yet. Run the <Link href="/agents" className="text-link underline underline-offset-4 hover:decoration-2">{agent} agent</Link> to create one.
        </p>
      )}
    </PageSection>
  );
}

/**
 * `canReadAgents`: agents.read (from the shell). Without it the agents list is a 403, so it isn't watched.
 * `canMakeTasks`: the tasks flag is on and the role holds tasks.manage; each finding then gets "Make a task".
 * `bare`: the reports alone, without the page header (the Performance tabs draw it).
 */
export function AuditBoard({ workspaceId, brandId, canReadAgents, canMakeTasks = false, canSeeHistory = false, canWriteBriefs = false, canWriteArticles = false, bare = false }: {
  workspaceId: string; brandId: string; canReadAgents: boolean; canMakeTasks?: boolean; canSeeHistory?: boolean;
  /** The tasks flag, making tasks and seeing search numbers: "Write a brief" on a finding with two or more pages. */
  canWriteBriefs?: boolean;
  /** The blog flag and content.create: "Write an article" after a content brief. */
  canWriteArticles?: boolean;
  bare?: boolean;
}) {
  const reportsUrl = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}/audit-reports`;
  const brief = canWriteBriefs ? { base: `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`, canWriteArticles } : undefined;
  const findingTaskUrl = canMakeTasks ? (reportId: string, findingId: string) => `${reportsUrl}/${encodeURIComponent(reportId)}/findings/${encodeURIComponent(findingId)}/task` : undefined;
  const fetcher = useCallback(() => request<{ seo: Report | null; geo: Report | null }>(reportsUrl), [reportsUrl]);
  const { state, reload } = useLoad(fetcher);

  // A finished SEO or GEO run means a new report: watch the two agents' latest runs and reload when one changes.
  const runs = useRef<string | null>(null);
  useEffect(() => {
    if (!canReadAgents) return;
    let live = true;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      fetchAgents(workspaceId, brandId).then(
        ({ agents }) => {
          if (!live) return;
          const now = agents.filter((a) => a.key === "seo" || a.key === "geo").map((a) => `${a.lastRun?.id}:${a.lastRun?.status}`).join();
          if (runs.current !== null && runs.current !== now) reload();
          runs.current = now;
        },
        () => {},
      );
    };
    check();
    const t = setInterval(check, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [workspaceId, brandId, reload, canReadAgents]);

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading reports" />;
  else if (state.kind === "forbidden") body = <EmptyState icon={Gauge} title="You can't see performance" description="Ask a workspace owner for access." />;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else {
    const { seo, geo } = state.data;
    const ps = seo?.metrics.pageSpeed as PageSpeed | null | undefined;
    const questions = (geo?.metrics.questions ?? []) as Question[];
    const competitors = (geo?.metrics.competitors ?? []) as { name: string; mentions: number }[];
    body = (
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel id="seo" title="SEO health" report={seo} agent="SEO" exportUrl={`${reportsUrl}/export?kind=SEO`} reportsUrl={reportsUrl} findingTaskUrl={findingTaskUrl} brief={brief} history={canSeeHistory} onStale={reload}>
          {ps && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-muted/40 px-4 py-3 sm:grid-cols-4">
              <Score label="Performance (mobile)" value={ps.performance} />
              <Score label="SEO" value={ps.seo} />
              <Score label="Accessibility" value={ps.accessibility} />
              <Score label="Best practices" value={ps.bestPractices} />
            </div>
          )}
        </Panel>
        <Panel id="geo" title="AI visibility (GEO)" report={geo} agent="GEO" exportUrl={`${reportsUrl}/export?kind=GEO`} reportsUrl={reportsUrl} findingTaskUrl={findingTaskUrl} history={canSeeHistory} onStale={reload}>
          {geo && (
            <div className="flex flex-col gap-3 rounded-xl bg-muted/40 px-4 py-3">
              <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                <Score label="Recommended unprompted" value={geo.metrics.visibility as number} />
                <Score label="Citability" value={geo.metrics.citability as number} />
                <Score label="AI crawler access" value={geo.metrics.technical as number} />
              </div>
              {questions.length > 0 && (
                <details className="group text-sm">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground">
                    <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                    Questions asked: mentioned in {questions.filter((q) => q.mentioned).length} of {questions.length}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {questions.map((q) => (
                      <li key={q.question} className="flex items-start gap-2">
                        <StatusBadge tone={q.branded ? "muted" : q.mentioned ? "good" : "warn"}>
                          {q.branded ? "Names brand" : q.mentioned ? "Mentioned" : "Not yet"}
                        </StatusBadge>
                        <span>{q.question}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {competitors.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <Sparkles className="mr-1 inline size-3" aria-hidden="true" />
                  AI recommends instead: {competitors.map((c) => `${c.name} (${c.mentions})`).join(", ")}
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>
    );
  }

  if (bare) return body;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader title={navFor("/performance").title}>
        How findable the brand is, in search engines and in AI assistants, and what to fix first.
      </PageHeader>
      {body}
    </div>
  );
}
