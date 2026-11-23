"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Gauge, Sparkles } from "lucide-react";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchAgents } from "@/components/agents/api";
import { errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListSkeleton, LoadError, formatDate, useLoad } from "@/components/settings/shared";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { navFor } from "@/lib/nav";
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
};
type PageSpeed = { performance: number; seo: number; accessibility: number; bestPractices: number; lcpMs: number | null };
type Question = { question: string; mentioned: boolean; branded?: boolean; brands: string[] };

const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const TONE: Record<Severity, "bad" | "warn" | "muted"> = { critical: "bad", high: "bad", medium: "warn", low: "muted" };
const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 50 ? "text-warning" : "text-destructive");

export function Score({ label, value, big }: { label: string; value: number | null | undefined; big?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={cn("font-display font-medium tabular-nums", big ? "text-5xl" : "text-2xl", value == null ? "text-muted-foreground" : scoreTone(value))}>
        {value ?? "—"}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** `action`: shown under each finding's row (Make a task). */
export function Findings({ findings, action }: { findings: Finding[]; action?: (f: Finding) => ReactNode }) {
  if (!findings.length) return <p className="text-sm text-muted-foreground">No issues found.</p>;
  return (
    <ol className="flex flex-col divide-y divide-border">
      {findings.map((f, i) => (
        <li key={f.id} className="py-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start gap-3">
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={TONE[f.severity]}>{SEVERITY_LABEL[f.severity]}</StatusBadge>
                  <span className="text-xs text-muted-foreground">{f.category}</span>
                </div>
                <p className="mt-1 font-medium">{f.title}</p>
                {f.why && <p className="mt-1 text-sm text-muted-foreground">{f.why}</p>}
              </div>
            </summary>
            <div className="ml-8 mt-3 flex flex-col gap-2 text-sm">
              <p>{f.detail}</p>
              <p><span className="font-medium">Fix: </span>{f.fix}</p>
              {f.urls?.length ? (
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {f.urls.slice(0, 8).map((u) => <li key={u} className="truncate">{u}</li>)}
                  {f.urls.length > 8 && <li>+{f.urls.length - 8} more</li>}
                </ul>
              ) : null}
            </div>
          </details>
          {action ? <div className="ml-8 mt-2">{action(f)}</div> : null}
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
function FindingTask({ url }: { url: string }) {
  const [made, setMade] = useState<FindingTaskMade>(null);
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
    <div className="flex flex-col items-start gap-1">
      {link.href ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={link.href}>{link.label}</Link>
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {made?.existed ? "This finding already has an open task." : "Task made."}
          </span>
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

function Panel({ id, title, report, agent, exportUrl, findingTaskUrl, children }: { id: string; exportUrl: string; title: string; report: Report | null; agent: string; findingTaskUrl?: (reportId: string, findingId: string) => string; children?: React.ReactNode }) {
  return (
    <PageSection
      id={id}
      title={title}
      className="flex flex-col gap-5"
      description={report ? `Last run ${formatDate(report.createdAt)}` : undefined}
      actions={
        report ? (
          <div className="flex items-center gap-4">
            <ExportCsvButton url={exportUrl} filename={`${id}-findings-${new Date().toLocaleDateString("en-CA")}.csv`} />
            <Score label="out of 100" value={report.score} big />
          </div>
        ) : undefined
      }
    >
      {report ? (
        <>
          <p className="text-sm leading-relaxed">{report.summary}</p>
          {children}
          <Findings
            findings={report.findings}
            action={findingTaskUrl ? (f) => <FindingTask key={`${report.id}:${f.id}`} url={findingTaskUrl(report.id, f.id)} /> : undefined}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No report yet. Run the <Link href="/agents" className="text-primary underline-offset-4 hover:underline">{agent} agent</Link> to create one.
        </p>
      )}
    </PageSection>
  );
}

/**
 * `canReadAgents`: agents.read (from the shell). Without it the agents list is a 403, so it isn't watched.
 * `canMakeTasks`: the tasks flag is on and the role holds tasks.manage; each finding then gets "Make a task".
 */
export function AuditBoard({ workspaceId, brandId, canReadAgents, canMakeTasks = false }: { workspaceId: string; brandId: string; canReadAgents: boolean; canMakeTasks?: boolean }) {
  const reportsUrl = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}/audit-reports`;
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
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel id="seo" title="SEO health" report={seo} agent="SEO" exportUrl={`${reportsUrl}/export?kind=SEO`} findingTaskUrl={findingTaskUrl}>
          {ps && (
            <div className="flex flex-wrap gap-8 rounded-xl bg-muted/40 px-5 py-4">
              <Score label="Performance (mobile)" value={ps.performance} />
              <Score label="SEO" value={ps.seo} />
              <Score label="Accessibility" value={ps.accessibility} />
              <Score label="Best practices" value={ps.bestPractices} />
            </div>
          )}
        </Panel>
        <Panel id="geo" title="AI visibility (GEO)" report={geo} agent="GEO" exportUrl={`${reportsUrl}/export?kind=GEO`} findingTaskUrl={findingTaskUrl}>
          {geo && (
            <div className="flex flex-col gap-4 rounded-xl bg-muted/40 px-5 py-4">
              <div className="flex flex-wrap gap-8">
                <Score label="Recommended unprompted" value={geo.metrics.visibility as number} />
                <Score label="Citability" value={geo.metrics.citability as number} />
                <Score label="AI crawler access" value={geo.metrics.technical as number} />
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {questions.map((q) => (
                  <li key={q.question} className="flex items-start gap-2">
                    <StatusBadge tone={q.branded ? "muted" : q.mentioned ? "good" : "warn"}>
                      {q.branded ? "Names brand" : q.mentioned ? "Mentioned" : "Not yet"}
                    </StatusBadge>
                    <span>{q.question}</span>
                  </li>
                ))}
              </ul>
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title={navFor("/performance").title}>
        How findable the brand is, in search engines and in AI assistants, and what to fix first.
      </PageHeader>
      {body}
    </div>
  );
}
