"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clapperboard,
  Compass,
  ExternalLink,
  FileText,
  Gauge,
  LineChart,
  ListChecks,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquareQuote,
  MessagesSquare,
  PenLine,
  Pin,
  RotateCw,
  ScanSearch,
  ShieldCheck,
  SquareTerminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AgentLog } from "@/components/agents/agent-log";
import { fetchAgents, startRun, type AgentSummary } from "@/components/agents/api";
import { DocPane } from "@/components/context/doc-pane";
import { fetchContextDocs, type ContextDocEntry, type ContextDocKind, type ContextDocsResponse } from "@/components/context/api";
import { request, settingsApi, type Connection } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Findings, Score } from "@/components/performance/audit-board";
import { AccountMenu } from "@/components/workspace/account-menu";
import { PanelLayout, type PanelDef, type Preset } from "@/components/workspace/panel-layout";
import { cn } from "@/lib/utils";

type Finding = { id: string; severity: string; title: string; why?: string };
type Report = { score: number; summary: string; findings: Finding[]; metrics: Record<string, unknown>; createdAt: string } | null;
type View = { kind: "home" } | { kind: "doc"; doc: ContextDocKind } | { kind: "agent"; key: string };

/** Agents shown as tiles. Built ones come from the API; planned ones are locked (Okara shows locked tiles too). */
const AGENT_META: Record<string, { icon: LucideIcon; tint: string }> = {
  research: { icon: ScanSearch, tint: "text-primary" },
  seo: { icon: Gauge, tint: "text-success" },
  geo: { icon: MessageSquareQuote, tint: "text-accent" },
};
const PLANNED: { key: string; name: string; icon: LucideIcon; does: string }[] = [
  { key: "scout", name: "Opportunities", icon: Compass, does: "Finds what to post about and ranks it" },
  { key: "planner", name: "Planner", icon: CalendarDays, does: "Fills your 30-day calendar" },
  { key: "creator", name: "Creator", icon: PenLine, does: "Drafts captions, scripts and visuals" },
  { key: "quality", name: "Quality check", icon: ShieldCheck, does: "Checks voice, accuracy and stock before approval" },
  { key: "analyst", name: "Analyst", icon: LineChart, does: "Reads results and writes learning notes" },
  { key: "reddit", name: "Reddit", icon: MessagesSquare, does: "Finds threads and drafts helpful replies" },
  { key: "pinterest", name: "Pinterest", icon: Pin, does: "Publishes Pins and reads saves" },
  { key: "influencer", name: "Influencer", icon: Users, does: "Finds creators who fit your brand" },
  { key: "ugc", name: "UGC video", icon: Clapperboard, does: "Short product videos" },
];

const POLL_MS = 5000;

type Props = {
  workspaceId: string;
  brandId: string;
  brandName: string;
  website: string | null;
  user: { name?: string | null; email?: string | null; image?: string | null };
};

export function Workspace({ workspaceId, brandId, brandName, website, user }: Props) {
  const [docs, setDocs] = useState<ContextDocsResponse | null>(null);
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [reports, setReports] = useState<{ seo: Report; geo: Report } | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [view, setView] = useState<View>({ kind: "home" });
  const [focus, setFocus] = useState<{ id: PanelId; n: number } | undefined>();

  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const loadReports = useCallback(() => request<{ seo: Report; geo: Report }>(`${base}/audit-reports`).then(setReports).catch(() => setReports({ seo: null, geo: null })), [base]);
  const refreshAgents = useCallback(() => fetchAgents(workspaceId, brandId).then((a) => setAgents(a.agents)), [workspaceId, brandId]);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const [d, a] = await Promise.allSettled([fetchContextDocs(workspaceId, brandId, ctrl.signal), fetchAgents(workspaceId, brandId, ctrl.signal)]);
      if (d.status === "fulfilled") setDocs(d.value);
      if (a.status === "fulfilled") setAgents(a.value.agents);
      if (!ctrl.signal.aborted) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    void loadReports();
    settingsApi.connections(workspaceId, brandId).then((c) => setConnections(c.connections), () => setConnections([]));
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [workspaceId, brandId, loadReports]);

  // A finished SEO/GEO run means a new report: refresh it.
  const reportRuns = agents?.filter((a) => a.key === "seo" || a.key === "geo").map((a) => `${a.lastRun?.id}:${a.lastRun?.status}`).join();
  useEffect(() => {
    if (reportRuns) void loadReports();
  }, [reportRuns, loadReports]);

  // Docs and agents open in the "Today & agents" panel (it's re-shown by the layout if hidden).
  const open = (v: View) => {
    setView(v);
    setFocus((f) => ({ id: "home", n: (f?.n ?? 0) + 1 }));
  };

  const panels: PanelDef<PanelId>[] = [
    {
      id: "context",
      title: "Context",
      icon: <FileText />,
      render: () => <ContextPane brandName={brandName} website={website} docs={docs} geo={reports?.geo ?? null} connections={connections} user={user} onOpenDoc={(doc) => open({ kind: "doc", doc })} />,
    },
    {
      id: "home",
      title: "Today & agents",
      icon: <ScanSearch />,
      render: () =>
        view.kind === "doc" && docs ? (
          <DocView
            entry={docs.docs.find((d) => d.kind === view.doc)!}
            workspaceId={workspaceId}
            brandId={brandId}
            researchActive={docs.research?.status === "QUEUED" || docs.research?.status === "RUNNING"}
            onBack={() => setView({ kind: "home" })}
            onChanged={(entry) => setDocs((d) => d && { ...d, docs: d.docs.map((x) => (x.kind === entry.kind ? entry : x)) })}
            onStale={() => fetchContextDocs(workspaceId, brandId).then(setDocs)}
          />
        ) : view.kind === "agent" ? (
          <AgentView
            agentKey={view.key}
            agent={agents?.find((a) => a.key === view.key) ?? null}
            report={view.key === "seo" ? reports?.seo ?? null : view.key === "geo" ? reports?.geo ?? null : null}
            docs={docs}
            workspaceId={workspaceId}
            brandId={brandId}
            onBack={() => setView({ kind: "home" })}
            onOpenDoc={(doc) => open({ kind: "doc", doc })}
            onRan={refreshAgents}
          />
        ) : (
          <Home user={user} docs={docs} agents={agents} reports={reports} connections={connections} onOpen={open} />
        ),
    },
    {
      id: "analytics",
      title: "Analytics",
      icon: <Gauge />,
      render: () => <AnalyticsPanel reports={reports} onOpenAgent={(key) => open({ kind: "agent", key })} />,
    },
    {
      id: "feed",
      title: "Agents feed",
      icon: <ListChecks />,
      render: () => <AgentsFeed agents={agents} reports={reports} docs={docs} workspaceId={workspaceId} brandId={brandId} onRan={refreshAgents} onOpen={open} />,
    },
    { id: "chat", title: "Chat", icon: <MessageCircle />, render: () => <ChatPane website={website} /> },
    { id: "log", title: "Agent Log", icon: <SquareTerminal />, render: () => <div className="p-2"><AgentLog workspaceId={workspaceId} brandId={brandId} compact /></div> },
  ];

  return <PanelLayout panels={panels} presets={PRESETS} storageKey="ws.layout.v1" focus={focus} />;
}

type PanelId = "context" | "home" | "analytics" | "feed" | "chat" | "log";

const PRESETS: Preset<PanelId>[] = [
  {
    name: "Focus",
    description: "Context, today and agents, chat",
    layout: { columns: [{ id: "a", size: 1, panels: ["context"] }, { id: "b", size: 2.2, panels: ["home"] }, { id: "c", size: 1.2, panels: ["chat"] }], collapsed: [] },
  },
  {
    name: "Classic",
    description: "Context, analytics, agents feed, chat",
    layout: { columns: [{ id: "a", size: 1, panels: ["context"] }, { id: "b", size: 1.15, panels: ["analytics"] }, { id: "c", size: 1.15, panels: ["feed"] }, { id: "d", size: 1.1, panels: ["chat"] }], collapsed: [] },
  },
  {
    name: "Operator",
    description: "Agents and live log side by side",
    layout: { columns: [{ id: "a", size: 1, panels: ["context", "analytics"] }, { id: "b", size: 1.8, panels: ["home", "log"] }, { id: "c", size: 1.2, panels: ["feed"] }], collapsed: [] },
  },
];

/* ───────────── Context pane (left) ───────────── */

function plainSummary(markdown: string | undefined) {
  if (!markdown) return null;
  const para = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#") && !p.startsWith("-") && !p.startsWith("_") && p.length > 60);
  return para?.replace(/\*\*|__|`|\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ") ?? null;
}

function docBadge(entry: ContextDocEntry, researching: boolean) {
  if (entry.latest?.status === "CONFIRMED") return <Check className="size-4 text-success" aria-label="Confirmed" />;
  if (entry.latest) return <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">New</span>;
  if (researching) return <Loader2 className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Drafting" />;
  return <Lock className="size-3.5 text-muted-foreground" aria-label="Not drafted yet" />;
}

function ContextPane({
  brandName,
  website,
  docs,
  geo,
  connections,
  user,
  onOpenDoc,
}: {
  brandName: string;
  website: string | null;
  docs: ContextDocsResponse | null;
  geo: Report;
  connections: Connection[] | null;
  user: Props["user"];
  onOpenDoc: (k: ContextDocKind) => void;
}) {
  const product = docs?.docs.find((d) => d.kind === "product-information");
  const summary = plainSummary(product?.latest?.markdown);
  const researching = docs?.research?.status === "QUEUED" || docs?.research?.status === "RUNNING";
  const competitors = ((geo?.metrics.competitors ?? []) as { name: string; mentions: number }[]).slice(0, 8);
  const host = website ? new URL(website).hostname.replace(/^www\./, "") : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-border px-5 py-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-medium">{brandName}</h2>
            <Link href="/context" className="text-xs text-muted-foreground hover:text-foreground">
              Edit
            </Link>
          </div>
          {host && (
            <a href={website!} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {host} <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
          {summary ? (
            <>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{summary}</p>
              <button type="button" onClick={() => onOpenDoc("product-information")} className="mt-1 text-xs font-medium hover:underline">
                View more
              </button>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{researching ? "Reading your website…" : "Your brand summary appears once Research has read the site."}</p>
          )}
        </section>

        <section aria-labelledby="docs-h" className="border-b border-border px-3 py-4">
          <h2 id="docs-h" className="flex items-center gap-2 px-2 text-sm font-semibold">
            Documents <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">{docs?.docs.filter((d) => d.latest).length ?? 0}</span>
          </h2>
          <ul className="mt-2">
            {(docs?.docs ?? []).map((d) => (
              <li key={d.kind}>
                <button
                  type="button"
                  onClick={() => onOpenDoc(d.kind)}
                  disabled={!d.latest}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className={cn("min-w-0 flex-1 truncate", !d.latest && "text-muted-foreground")}>{d.title}</span>
                  {docBadge(d, researching)}
                  {d.latest && <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
                </button>
              </li>
            ))}
            {!docs && <li className="px-2 py-2 text-sm text-muted-foreground">Loading…</li>}
          </ul>
        </section>

        <section aria-labelledby="comp-h" className="border-b border-border px-5 py-4">
          <h2 id="comp-h" className="flex items-center gap-2 text-sm font-semibold">
            Competitors <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">{competitors.length}</span>
          </h2>
          {competitors.length ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">Brands AI assistants recommend instead of you</p>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                {competitors.map((c) => (
                  <li key={c.name} className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold uppercase">{c.name[0]}</span>
                    <span className="truncate">{c.name}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Run the GEO agent to see who AI recommends in your market.</p>
          )}
        </section>

        <section aria-labelledby="conn-h" className="px-5 py-4">
          <h2 id="conn-h" className="text-sm font-semibold">
            Accounts
          </h2>
          {connections?.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {connections.map((c) => (
                <li key={c.id} className={cn("rounded-full border px-2.5 py-0.5 text-xs", c.status === "ACTIVE" ? "border-border" : "border-destructive/50 text-destructive")}>
                  {c.displayName}
                </li>
              ))}
            </ul>
          ) : (
            <Link href="/settings?tab=connections" className="mt-2 inline-block text-sm text-muted-foreground hover:text-foreground">
              Connect Instagram, Facebook, Google… →
            </Link>
          )}
        </section>
      </div>
      <div className="border-t border-border p-2">
        <AccountMenu variant="card" name={user.name} email={user.email} image={user.image} />
      </div>
    </div>
  );
}

/* ───────────── Centre: home ───────────── */

function timeAgo(iso: string | null | undefined) {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

function agentStatus(a: AgentSummary | undefined) {
  const s = a?.lastRun?.status;
  if (s === "RUNNING") return "Running…";
  if (s === "QUEUED") return "Queued";
  if (s === "FAILED") return "Failed";
  if (s === "SUCCEEDED") return `Done ${timeAgo(a?.lastRun?.finishedAt)}`;
  return "Ready";
}

function Home({
  user,
  docs,
  agents,
  reports,
  connections,
  onOpen,
}: {
  user: Props["user"];
  docs: ContextDocsResponse | null;
  agents: AgentSummary[] | null;
  reports: { seo: Report; geo: Report } | null;
  connections: Connection[] | null;
  onOpen: (v: View) => void;
}) {
  const first = user.name?.trim().split(/\s+/)[0];
  const tasks = useMemo(() => {
    const list: { id: string; done: boolean; label: string; detail?: string; action: React.ReactNode }[] = [];
    for (const d of docs?.docs ?? []) {
      if (!d.latest) continue;
      list.push({
        id: d.kind,
        done: d.latest.status === "CONFIRMED",
        label: d.title,
        detail: "Ready to read",
        action: (
          <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: "doc", doc: d.kind })}>
            Read it
          </Button>
        ),
      });
    }
    const run = (key: string, label: string, done: boolean) =>
      list.push({ id: key, done, label, detail: done ? undefined : "Not run yet", action: <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: "agent", key })}>Open</Button> });
    if (reports) {
      run("seo", "Check your website's SEO health", !!reports.seo);
      run("geo", "See if AI assistants recommend you", !!reports.geo);
    }
    if (connections) {
      list.push({
        id: "connect",
        done: connections.some((c) => c.status === "ACTIVE"),
        label: "Connect your Instagram or Facebook",
        detail: "So agents can publish and read results",
        action: (
          <Button size="sm" variant="secondary" asChild>
            <Link href="/settings?tab=connections">Connect</Link>
          </Button>
        ),
      });
    }
    return list;
  }, [docs, reports, connections, onOpen]);

  const done = tasks.filter((t) => t.done).length;
  const open = tasks.filter((t) => !t.done);
  const built = (agents ?? []).filter((a) => a.key !== "systems-check");

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
        <h1 className="font-display text-2xl font-medium tracking-tight">
          {first ? `Welcome, ${first}.` : "Welcome."}
        </h1>
      </div>

      <section aria-labelledby="today-h" className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="today-h" className="text-base font-semibold">
            Today
          </h2>
          {tasks.length > 0 && (
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full bg-success" style={{ width: `${(done / tasks.length) * 100}%` }} />
              </span>
              {done} of {tasks.length} done
            </span>
          )}
        </div>
        {open.length > 0 ? (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {open.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-sm">
                  {t.detail && <span className="text-muted-foreground">{t.detail} · </span>}
                  <span className="font-medium">{t.label}</span>
                </p>
                {t.action}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{tasks.length ? "All done for today." : "Loading your tasks…"}</p>
        )}
      </section>

      <section aria-labelledby="agents-h" className="px-6 pb-10">
        <div className="flex items-center justify-between">
          <h2 id="agents-h" className="text-base font-semibold">
            Agents
          </h2>
          <span className="text-xs text-muted-foreground">
            {built.length} active · {PLANNED.length} coming
          </span>
        </div>
        <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-5">
          {built.map((a) => {
            const meta = AGENT_META[a.key] ?? { icon: ScanSearch, tint: "text-primary" };
            const running = a.lastRun?.status === "RUNNING" || a.lastRun?.status === "QUEUED";
            return (
              <li key={a.key}>
                <AgentFolder
                  icon={meta.icon}
                  tint={meta.tint}
                  name={a.name}
                  status={agentStatus(a)}
                  state={running ? "running" : a.lastRun?.status === "FAILED" ? "failed" : "ready"}
                  onClick={() => onOpen({ kind: "agent", key: a.key })}
                />
              </li>
            );
          })}
          {PLANNED.map((p) => (
            <li key={p.key}>
              <AgentFolder icon={p.icon} tint="text-muted-foreground" name={p.name} status="Coming soon" state="locked" title={p.does} />
            </li>
          ))}
          {!agents && <li className="col-span-full text-sm text-muted-foreground">Loading agents…</li>}
        </ul>
      </section>
    </div>
  );
}

function AgentFolder({
  icon: Icon,
  tint,
  name,
  status,
  state,
  title,
  onClick,
}: {
  icon: LucideIcon;
  tint: string;
  name: string;
  status: string;
  state: "ready" | "running" | "failed" | "locked";
  title?: string;
  onClick?: () => void;
}) {
  const locked = state === "locked";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={title}
      className="group flex w-full flex-col items-center gap-1.5 rounded-lg p-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      {/* Folder: a tab on top of a rounded body, the agent's icon on the front. */}
      <span className={cn("relative mt-1.5 h-11 w-14 transition-transform duration-200 ease-out group-enabled:group-hover:-translate-y-0.5 motion-reduce:transition-none", locked && "opacity-55")}>
        <span className="absolute -top-1.5 left-1 h-3 w-6 rounded-t-md bg-muted-foreground/30" aria-hidden="true" />
        <span className="absolute inset-0 grid place-items-center rounded-md rounded-tl-none bg-muted-foreground/20 ring-1 ring-inset ring-white/5">
          <Icon className={cn("size-5", tint)} aria-hidden="true" />
        </span>
        {(locked || state === "running" || state === "failed") && (
          <span
            className={cn(
              "absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-background",
              locked ? "bg-muted" : state === "running" ? "bg-primary" : "bg-destructive",
            )}
            aria-hidden="true"
          >
            {locked ? <Lock className="size-2.5 text-muted-foreground" /> : state === "running" ? <span className="size-1.5 rounded-full bg-primary-foreground motion-safe:animate-pulse" /> : <span className="text-[9px] font-bold text-white">!</span>}
          </span>
        )}
      </span>
      <span className={cn("w-full truncate text-xs font-medium", locked && "text-muted-foreground")}>{name}</span>
      <span className={cn("w-full truncate text-[11px] text-muted-foreground", state === "failed" && "text-destructive")}>{status}</span>
    </button>
  );
}

/* ───────────── Centre: document and agent views ───────────── */

function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-4 py-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Workspace
      </Button>
      <span className="truncate text-sm text-muted-foreground">/ {title}</span>
    </div>
  );
}

function DocView(p: {
  entry: ContextDocEntry;
  workspaceId: string;
  brandId: string;
  researchActive: boolean;
  onBack: () => void;
  onChanged: (e: ContextDocEntry) => void;
  onStale: () => void;
}) {
  return (
    <div>
      <BackBar onBack={p.onBack} title={p.entry.title} />
      <div className="px-6 py-6">
        <DocPane entry={p.entry} workspaceId={p.workspaceId} brandId={p.brandId} researchActive={p.researchActive} onChanged={p.onChanged} onStale={p.onStale} />
      </div>
    </div>
  );
}

function AgentView({
  agentKey,
  agent,
  report,
  docs,
  workspaceId,
  brandId,
  onBack,
  onOpenDoc,
  onRan,
}: {
  agentKey: string;
  agent: AgentSummary | null;
  report: Report;
  docs: ContextDocsResponse | null;
  workspaceId: string;
  brandId: string;
  onBack: () => void;
  onOpenDoc: (k: ContextDocKind) => void;
  onRan: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = agent?.lastRun?.status === "RUNNING" || agent?.lastRun?.status === "QUEUED";

  async function run() {
    setPending(true);
    setError(null);
    try {
      await startRun(workspaceId, brandId, agentKey);
      onRan();
    } catch (e) {
      setError(e instanceof Error && /403/.test(e.message) ? "Your role can't run agents. Ask an owner or admin." : "Couldn't start the agent. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <BackBar onBack={onBack} title={agent?.name ?? agentKey} />
      <div className="flex flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight">{agent?.name ?? agentKey}</h1>
            <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">{agent?.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">{agentStatus(agent ?? undefined)}</p>
          </div>
          <Button onClick={run} disabled={pending || running}>
            {pending || running ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
            {running ? "Running…" : agent?.lastRun ? "Run again" : "Run"}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {running && <p className="text-sm text-muted-foreground">Open Logs in the top bar to watch each step live.</p>}

        {report && (
          <section aria-labelledby="report-h" className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <h2 id="report-h" className="text-base font-semibold">
                Latest report · <span className="tabular-nums">{report.score}/100</span>
              </h2>
              <Link href="/performance" className="text-sm text-muted-foreground hover:text-foreground">
                Full report →
              </Link>
            </div>
            <p className="max-w-[70ch] text-sm leading-relaxed">{report.summary}</p>
            <ol className="divide-y divide-border rounded-xl border border-border">
              {report.findings.slice(0, 5).map((f, i) => (
                <li key={f.id} className="flex gap-3 px-4 py-3 text-sm">
                  <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{f.title}</span>
                    {f.why && <span className="mt-0.5 block text-muted-foreground">{f.why}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {agentKey === "research" && docs && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {docs.docs.map((d) => (
              <li key={d.kind}>
                <button type="button" disabled={!d.latest} onClick={() => onOpenDoc(d.kind)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted disabled:hover:bg-transparent">
                  <span className={cn(!d.latest && "text-muted-foreground")}>{d.title}</span>
                  <span className="text-xs text-muted-foreground">{d.latest ? (d.latest.status === "CONFIRMED" ? "Confirmed" : "Draft to read") : "Not drafted"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ───────────── Chat pane (right) ───────────── */

function ChatPane({ website }: { website: string | null }) {
  const host = website ? new URL(website).hostname.replace(/^www\./, "") : "your site";
  const starters = ["Plan the next 30 days", "Who is my customer?", "Compare me with competitors"];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-muted font-display text-lg" aria-hidden="true">
          P+
        </span>
        <p className="max-w-[28ch] text-sm text-muted-foreground">
          Soon you&rsquo;ll be able to ask your CMO about {host}: plans, customers, competitors.
        </p>
        <ul className="flex flex-wrap justify-center gap-2">
          {starters.map((s) => (
            <li key={s}>
              <span className="inline-block rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border p-3">
        <label className="sr-only" htmlFor="chat-input">
          Message your CMO
        </label>
        <textarea
          id="chat-input"
          disabled
          rows={2}
          placeholder="Chat is coming soon"
          className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>
    </div>
  );
}

/* ───────────── Analytics panel (SEO / GEO tabs, Okara "Analytics") ───────────── */

type PageSpeed = { performance: number; seo: number; accessibility: number; bestPractices: number; lcpMs: number | null; cls: number | null };

function AnalyticsPanel({ reports, onOpenAgent }: { reports: { seo: Report; geo: Report } | null; onOpenAgent: (key: string) => void }) {
  const [tab, setTab] = useState<"seo" | "geo">("seo");
  const report = reports?.[tab] ?? null;
  const ps = tab === "seo" ? ((report?.metrics.pageSpeed as PageSpeed | null) ?? null) : null;
  const questions = tab === "geo" ? ((report?.metrics.questions ?? []) as { question: string; mentioned: boolean; branded?: boolean }[]) : [];
  return (
    <div className="flex flex-col gap-4 p-4">
      <div role="tablist" aria-label="Report" className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
        {(["seo", "geo"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("rounded-md py-1.5 font-medium", tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
          >
            {t === "seo" ? "SEO" : "AI visibility (GEO)"}
          </button>
        ))}
      </div>
      {!reports ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !report ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">No {tab === "seo" ? "SEO" : "GEO"} report yet.</p>
          <Button size="sm" variant="secondary" onClick={() => onOpenAgent(tab)}>
            Run the {tab === "seo" ? "SEO" : "GEO"} agent
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <Score label="out of 100" value={report.score} big />
            <span className="text-xs text-muted-foreground">Last run {timeAgo(report.createdAt)}</span>
          </div>
          {ps && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PageSpeed · mobile</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <Score label="Performance" value={ps.performance} />
                <Score label="Accessibility" value={ps.accessibility} />
                <Score label="Best practices" value={ps.bestPractices} />
                <Score label="SEO" value={ps.seo} />
              </div>
              {ps.lcpMs != null && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Main image appears after {(ps.lcpMs / 1000).toFixed(1)} s (target under 2.5 s)
                  {ps.cls != null ? `, layout shift ${ps.cls.toFixed(2)} (target under 0.1)` : ""}.
                </p>
              )}
            </div>
          )}
          {questions.length > 0 && (
            <ul className="flex flex-col gap-2 rounded-xl border border-border p-4 text-sm">
              {questions.map((q) => (
                <li key={q.question} className="flex items-start gap-2">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", q.branded ? "bg-muted-foreground/40" : q.mentioned ? "bg-success" : "bg-warning")} aria-hidden="true" />
                  <span>
                    {q.question}
                    <span className="sr-only">{q.branded ? " (names the brand)" : q.mentioned ? " (mentioned)" : " (not mentioned)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm leading-relaxed">{report.summary}</p>
          <Findings findings={report.findings as Parameters<typeof Findings>[0]["findings"]} />
        </>
      )}
    </div>
  );
}

/* ───────────── Agents feed panel (Okara "Agents Feed") ───────────── */

function feedLine(key: string, a: AgentSummary | undefined, reports: { seo: Report; geo: Report } | null, docs: ContextDocsResponse | null) {
  if (a?.lastRun?.status === "RUNNING" || a?.lastRun?.status === "QUEUED") return "Working…";
  if (a?.lastRun?.status === "FAILED") return "Last run failed: open Logs for details";
  if (key === "seo" && reports?.seo) return `${reports.seo.score}/100 · ${reports.seo.findings.length} fixes ready`;
  if (key === "geo" && reports?.geo) {
    const m = reports.geo.metrics as { visibility?: number; competitors?: unknown[] };
    return `Recommended unprompted ${m.visibility ?? 0}% · ${m.competitors?.length ?? 0} competitors named`;
  }
  if (key === "research" && docs) {
    const drafted = docs.docs.filter((d) => d.latest).length;
    const confirmed = docs.docs.filter((d) => d.latest?.status === "CONFIRMED").length;
    return `${drafted} of 5 documents drafted · ${confirmed} confirmed`;
  }
  return a?.lastRun ? "Done" : "Not run yet";
}

function AgentsFeed({
  agents,
  reports,
  docs,
  workspaceId,
  brandId,
  onRan,
  onOpen,
}: {
  agents: AgentSummary[] | null;
  reports: { seo: Report; geo: Report } | null;
  docs: ContextDocsResponse | null;
  workspaceId: string;
  brandId: string;
  onRan: () => void;
  onOpen: (v: View) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const built = (agents ?? []).filter((a) => a.key !== "systems-check");
  async function run(key: string) {
    setBusy(key);
    try {
      await startRun(workspaceId, brandId, key);
      onRan();
    } catch {
      // Permission or network: the agent view explains; keep the feed quiet.
    } finally {
      setBusy(null);
    }
  }
  return (
    <ul className="divide-y divide-border">
      {built.map((a) => {
        const meta = AGENT_META[a.key] ?? { icon: ScanSearch, tint: "text-primary" };
        const Icon = meta.icon;
        const running = a.lastRun?.status === "RUNNING" || a.lastRun?.status === "QUEUED";
        return (
          <li key={a.key} className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
              <Icon className={cn("size-4", meta.tint)} aria-hidden="true" />
            </span>
            <button type="button" onClick={() => onOpen({ kind: "agent", key: a.key })} className="min-w-0 flex-1 text-left">
              <span className="block text-xs font-semibold uppercase tracking-wide">{a.name} agent</span>
              <span className="block truncate text-sm text-muted-foreground">{feedLine(a.key, a, reports, docs)}</span>
            </button>
            <Button size="sm" variant="ghost" disabled={running || busy === a.key} onClick={() => run(a.key)} aria-label={`Run ${a.name}`}>
              {running || busy === a.key ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
            </Button>
          </li>
        );
      })}
      {PLANNED.map((p) => (
        <li key={p.key} className="flex items-center gap-3 px-4 py-3.5 opacity-70">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
            <p.icon className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide">{p.name} agent</span>
            <span className="block truncate text-sm text-muted-foreground">{p.does}</span>
          </span>
          <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            <Lock className="size-3" aria-hidden="true" /> Soon
          </span>
        </li>
      ))}
      {!agents && <li className="px-4 py-3 text-sm text-muted-foreground">Loading agents…</li>}
    </ul>
  );
}
