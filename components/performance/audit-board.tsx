"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Gauge, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchAgents } from "@/components/agents/api";
import { request } from "@/components/settings/api";
import { ListSkeleton, LoadError, StatusPill, formatDate, useLoad } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

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

export function Findings({ findings }: { findings: Finding[] }) {
  if (!findings.length) return <p className="text-sm text-muted-foreground">No issues found.</p>;
  return (
    <ol className="flex flex-col divide-y divide-border">
      {findings.map((f, i) => (
        <li key={f.id} className="py-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start gap-3">
              <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={TONE[f.severity]}>{f.severity}</StatusPill>
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
        </li>
      ))}
    </ol>
  );
}

function Panel({ title, report, agent, children }: { title: string; report: Report | null; agent: string; children?: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-medium tracking-tight">{title}</h2>
          {report && <p className="mt-1 text-xs text-muted-foreground">Last run {formatDate(report.createdAt)}</p>}
        </div>
        {report && <Score label="out of 100" value={report.score} big />}
      </div>
      {report ? (
        <>
          <p className="text-sm leading-relaxed">{report.summary}</p>
          {children}
          <Findings findings={report.findings} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No report yet. Run the <Link href="/agents" className="text-primary underline-offset-4 hover:underline">{agent} agent</Link> to create one.
        </p>
      )}
    </section>
  );
}

export function AuditBoard({ workspaceId, brandId }: { workspaceId: string; brandId: string }) {
  const fetcher = useCallback(
    () => request<{ seo: Report | null; geo: Report | null }>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}/audit-reports`),
    [workspaceId, brandId],
  );
  const { state, reload } = useLoad(fetcher);

  // A finished SEO or GEO run means a new report: watch the two agents' latest runs and reload when one changes.
  const runs = useRef<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const check = () => {
      if (document.visibilityState !== "visible") return;
      fetchAgents(workspaceId, brandId, ctrl.signal).then(
        ({ agents }) => {
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
      ctrl.abort();
      clearInterval(t);
    };
  }, [workspaceId, brandId, reload]);

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading reports" />;
  else if (state.kind === "forbidden") body = <EmptyState icon={Gauge} title="You can't see performance" description="Your role doesn't include analytics.read." />;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else {
    const { seo, geo } = state.data;
    const ps = seo?.metrics.pageSpeed as PageSpeed | null | undefined;
    const questions = (geo?.metrics.questions ?? []) as Question[];
    const competitors = (geo?.metrics.competitors ?? []) as { name: string; mentions: number }[];
    body = (
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="SEO health" report={seo} agent="SEO">
          {ps && (
            <div className="flex flex-wrap gap-8 rounded-xl bg-muted/40 px-5 py-4">
              <Score label="Performance (mobile)" value={ps.performance} />
              <Score label="SEO" value={ps.seo} />
              <Score label="Accessibility" value={ps.accessibility} />
              <Score label="Best practices" value={ps.bestPractices} />
            </div>
          )}
        </Panel>
        <Panel title="AI visibility (GEO)" report={geo} agent="GEO">
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
                    <StatusPill tone={q.branded ? "muted" : q.mentioned ? "good" : "warn"}>
                      {q.branded ? "Names brand" : q.mentioned ? "Mentioned" : "Not yet"}
                    </StatusPill>
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
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">How findable the brand is, in search engines and in AI assistants, and what to fix first.</p>
      </div>
      {body}
    </div>
  );
}
