"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Compass,
  ExternalLink,
  FileText,
  Gauge,
  LineChart,
  ListChecks,
  Loader2,
  Lock,
  MessageSquareQuote,
  PenLine,
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
import { okToDiscard } from "@/components/context/unsaved";
import { ApiError, errorMessage, request, settingsApi, type Connection } from "@/components/settings/api";
import { ListSkeleton } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Findings, Score } from "@/components/performance/audit-board";
import { CompetitorsPanel, CompetitorView } from "@/components/workspace/competitors-panel";
import { ContentPanel, ContentView, IdeasPanel, LoadFailed, LoadGate, useBrandData, usePerms, type ContentItem, type Opportunity } from "@/components/workspace/content-panels";
import { Markdown } from "@/components/context/markdown";
import { PanelLayout, type PanelDef, type Preset } from "@/components/workspace/panel-layout";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { readable } from "@/lib/agent-message";
import { safeHttpUrl } from "@espanda/shared";
import { timeAgo } from "@/lib/time";

type Finding = { id: string; severity: string; title: string; why?: string };
type Report = { score: number; summary: string; findings: Finding[]; metrics: Record<string, unknown>; createdAt: string } | null;
type View = { kind: "home" } | { kind: "doc"; doc: ContextDocKind } | { kind: "agent"; key: string; run?: boolean } | { kind: "content"; id: string } | { kind: "competitor"; id: string };

/** Agents shown as tiles. Built ones come from the API; planned ones are locked (Okara shows locked tiles too). */
const AGENT_META: Record<string, { icon: LucideIcon; tint: string }> = {
  research: { icon: ScanSearch, tint: "text-primary" },
  scout: { icon: Compass, tint: "text-primary" },
  planner: { icon: CalendarDays, tint: "text-primary" },
  brief: { icon: FileText, tint: "text-primary" },
  creator: { icon: PenLine, tint: "text-primary" },
  quality: { icon: ShieldCheck, tint: "text-success" },
  analyst: { icon: LineChart, tint: "text-primary-strong" },
  seo: { icon: Gauge, tint: "text-success" },
  geo: { icon: MessageSquareQuote, tint: "text-primary-strong" },
  competitors: { icon: Users, tint: "text-primary-strong" },
};
/** The agents the sidebar marks "Soon": one list, so the Overview counts match it. */
const PLANNED: { key: string; name: string; icon: LucideIcon; does: string }[] = NAV.filter((e) => e.group === "agent" && e.soon).map((e) => ({
  key: e.id,
  name: e.label,
  icon: Lock,
  does: e.role ?? "Coming soon",
}));

/** "Platform Admin" and the like are role names, not a first name to greet. */
const NOT_A_FIRST_NAME = new Set(["platform", "admin", "administrator", "user", "owner", "test", "demo", "team", "support"]);
function firstNameOf(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  return first && !first.includes("@") && !NOT_A_FIRST_NAME.has(first.toLowerCase()) ? first : null;
}

const POLL_MS = 5000;

type Props = {
  workspaceId: string;
  brandId: string;
  brandName: string;
  website: string | null;
  user: { name?: string | null; email?: string | null; image?: string | null };
};

/** The open item lives in the URL (?post=, ?doc=, ?agent=, ?competitor=) so Refresh, Back and shared links work. */
function viewFromUrl(): View {
  const q = new URLSearchParams(window.location.search);
  const post = q.get("post"), doc = q.get("doc"), agent = q.get("agent"), competitor = q.get("competitor");
  if (post) return { kind: "content", id: post };
  if (doc) return { kind: "doc", doc: doc as ContextDocKind };
  if (agent) return { kind: "agent", key: agent };
  if (competitor) return { kind: "competitor", id: competitor };
  return { kind: "home" };
}
function viewSearch(v: View) {
  const q = new URLSearchParams(window.location.search);
  for (const k of ["post", "doc", "agent", "competitor"]) q.delete(k);
  if (v.kind === "content") q.set("post", v.id);
  if (v.kind === "doc") q.set("doc", v.doc);
  if (v.kind === "agent") q.set("agent", v.key);
  if (v.kind === "competitor") q.set("competitor", v.id);
  const s = q.toString();
  return s ? `?${s}` : window.location.pathname;
}

export function Workspace({ workspaceId, brandId, brandName, website, user }: Props) {
  const [docs, setDocs] = useState<ContextDocsResponse | null>(null);
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [reports, setReports] = useState<{ seo: Report; geo: Report } | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [view, setView] = useState<View>({ kind: "home" });
  const [focus, setFocus] = useState<{ id: PanelId; n: number } | undefined>();
  const [urlRead, setUrlRead] = useState(false);
  const [failed, setFailed] = useState(NONE_FAILED);
  const mark = useCallback((k: keyof typeof NONE_FAILED, v: boolean) => setFailed((f) => (f[k] === v ? f : { ...f, [k]: v })), []);
  const viewNow = useRef(view);
  viewNow.current = view;
  // The panel ?panel= last brought into view, so a later URL change (opening a post) doesn't bring it back.
  const shownPanel = useRef<string | null>(null);
  // Set when a view is dropped for being unknown: its URL replaces the bad one instead of adding a history entry.
  const replaceUrl = useRef(false);

  // Open what the URL names: on load (deep link, refresh), on Back/Forward, and on links to "/" while a view is open
  // (the sidebar's Overview). Next.js updates the search params for all of these, and for our own pushState below,
  // which already matches the open view and so changes nothing.
  const query = useSearchParams().toString();
  useEffect(() => {
    const v = viewFromUrl();
    if (viewSearch(v) !== viewSearch(viewNow.current)) {
      // An open document with unsaved edits asks first; staying puts its URL back.
      if (!okToDiscard()) {
        window.history.pushState(null, "", viewSearch(viewNow.current));
        return;
      }
      setView(v);
      if (v.kind !== "home") setFocus((f) => ({ id: "home", n: (f?.n ?? 0) + 1 }));
    }
    // ?panel= shows that panel (e.g. Menu → Content calendar) once, and stays in the URL: the sidebar reads it to
    // keep Wave and Drift selected.
    const panel = new URLSearchParams(window.location.search).get("panel");
    if (panel && panel !== shownPanel.current && (PANEL_IDS as readonly string[]).includes(panel)) setFocus((f) => ({ id: panel as PanelId, n: (f?.n ?? 0) + 1 }));
    shownPanel.current = panel;
    setUrlRead(true);
  }, [query]);
  useEffect(() => {
    // Until the URL has been read, writing it would erase a deep link.
    if (!urlRead) return;
    const next = viewSearch(view);
    const now = window.location.search || window.location.pathname;
    if (next === now) return;
    if (replaceUrl.current) window.history.replaceState(null, "", next);
    else window.history.pushState(null, "", next);
    replaceUrl.current = false;
  }, [view, urlRead]);
  // A ?doc= or ?agent= that names nothing shows home and drops the bad parameter, once the lists have loaded.
  useEffect(() => {
    const unknown = (view.kind === "doc" && !!docs && !docs.docs.some((d) => d.kind === view.doc)) || (view.kind === "agent" && !!agents && !agents.some((a) => a.key === view.key));
    if (!unknown) return;
    replaceUrl.current = true;
    setView({ kind: "home" });
  }, [view, docs, agents]);

  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  // What the person's role may do; null until known. Write controls show only for roles the API would accept.
  const perms = usePerms(base);
  const canRun = !!perms?.includes("agents.run");
  const canEditDocs = !!perms?.includes("context.edit");
  const canConfirmDocs = !!perms?.includes("context.confirm");
  // A failed load keeps what was already shown; a block shows its error only while it has nothing to show.
  const loadReports = useCallback(
    () =>
      request<{ seo: Report; geo: Report }>(`${base}/audit-reports`).then(
        (r) => {
          setReports(r);
          mark("reports", false);
        },
        () => mark("reports", true),
      ),
    [base, mark],
  );
  const refreshAgents = useCallback(() => fetchAgents(workspaceId, brandId).then((a) => setAgents(a.agents)), [workspaceId, brandId]);

  // Each request gives up after 30 s (lib/net.ts), so a hung one can't stall the poll.
  const loadDocsAndAgents = useCallback(
    async (signal?: AbortSignal) => {
      const [d, a] = await Promise.allSettled([fetchContextDocs(workspaceId, brandId, signal), fetchAgents(workspaceId, brandId, signal)]);
      if (signal?.aborted) return;
      if (d.status === "fulfilled") setDocs(d.value);
      if (a.status === "fulfilled") setAgents(a.value.agents);
      mark("docs", d.status === "rejected");
      mark("agents", a.status === "rejected");
    },
    [workspaceId, brandId, mark],
  );
  // Everything the Overview loads up front; Retry calls it again.
  const loadAll = useCallback(
    (signal?: AbortSignal) => {
      void loadReports();
      settingsApi.connections(workspaceId, brandId).then(
        (c) => {
          setConnections(c.connections);
          mark("connections", false);
        },
        () => mark("connections", true),
      );
      return loadDocsAndAgents(signal);
    },
    [workspaceId, brandId, loadReports, loadDocsAndAgents, mark],
  );

  // Docs and agents are polled; the poll carries on through failures.
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (!ctrl.signal.aborted) timer = setTimeout(() => void loadDocsAndAgents(ctrl.signal).then(next), POLL_MS);
    };
    void loadAll(ctrl.signal).then(next);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [loadAll, loadDocsAndAgents]);

  // A finished SEO/GEO run means a new report: refresh it.
  const reportRuns = agents?.filter((a) => a.key === "seo" || a.key === "geo").map((a) => `${a.lastRun?.id}:${a.lastRun?.status}`).join();
  useEffect(() => {
    if (reportRuns) void loadReports();
  }, [reportRuns, loadReports]);

  const pickOpps = useCallback((d: { opportunities: Opportunity[] }) => d.opportunities.filter((o) => o.status === "NEW" && o.decision === "RECOMMEND").length, []);
  const pickItems = useCallback((d: { items: ContentItem[] }) => d.items.filter((i) => i.status === "AWAITING_APPROVAL").length, []);
  const pickToWrite = useCallback((d: { items: ContentItem[] }) => d.items.filter((i) => i.status === "PLANNED" || i.status === "BRIEF_READY" || i.status === "DRAFT_REVIEW").length, []);
  const pickShortlisted = useCallback((d: { opportunities: Opportunity[] }) => d.opportunities.filter((o) => o.status === "SHORTLISTED").length, []);
  const ideas = useBrandData(base, "opportunities", pickOpps as (d: never) => number);
  const shortlistedQ = useBrandData(base, "opportunities", pickShortlisted as (d: never) => number);
  const awaitingQ = useBrandData(base, "content", pickItems as (d: never) => number);
  const toWriteQ = useBrandData(base, "content", pickToWrite as (d: never) => number);
  const ideasToDecide = ideas.data, awaiting = awaitingQ.data, toWrite = toWriteQ.data, shortlisted = shortlistedQ.data;
  const pipeline = ideasToDecide == null || awaiting == null || toWrite == null || shortlisted == null ? null : { ideasToDecide, awaiting, toWrite, shortlisted };
  const pipelineFailed = [ideas, awaitingQ, toWriteQ, shortlistedQ].some((q) => q.data == null && q.failed);
  // Today is built from the reports, the connections and the pipeline counts.
  const today = {
    failed: (!reports && failed.reports) || (!connections && failed.connections) || pipelineFailed,
    loading: (!reports && !failed.reports) || (!connections && !failed.connections) || (!pipeline && !pipelineFailed),
  };
  const reloadIdeas = ideas.reload, reloadContent = awaitingQ.reload;
  const retry = useCallback(() => {
    setFailed(NONE_FAILED);
    void loadAll();
    void reloadIdeas();
    void reloadContent();
  }, [loadAll, reloadIdeas, reloadContent]);

  // Leaving a document with unsaved edits asks first (okToDiscard), for every view change in the workspace.
  const back = () => {
    if (okToDiscard()) setView({ kind: "home" });
  };
  // Docs and agents open in the "Today & agents" panel (it's re-shown by the layout if hidden).
  const open = (v: View) => {
    if (!okToDiscard()) return;
    setView(v);
    setFocus((f) => ({ id: "home", n: (f?.n ?? 0) + 1 }));
  };
  // Brings a panel into view, adding it to the layout if it's hidden.
  const showPanel = (id: PanelId) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));

  const panels: PanelDef<PanelId>[] = [
    {
      id: "context",
      title: "Context",
      icon: <FileText />,
      render: () => (
        <ContextPane
          base={base}
          brandName={brandName}
          website={website}
          docs={docs}
          docsFailed={failed.docs}
          onRetry={retry}
          geo={reports?.geo ?? null}
          reportsReady={!!reports}
          reportsFailed={failed.reports}
          connections={connections}
          connectionsFailed={failed.connections}
          onOpenDoc={(doc) => open({ kind: "doc", doc })}
          onOpenResearch={() => open({ kind: "agent", key: "research", run: true })}
          canEdit={canEditDocs}
          canRun={canRun}
        />
      ),
    },
    {
      id: "home",
      title: "Today & agents",
      icon: <ScanSearch />,
      render: () =>
        view.kind === "doc" && docs && docs.docs.some((d) => d.kind === view.doc) ? (
          <DocView
            entry={docs.docs.find((d) => d.kind === view.doc)!}
            workspaceId={workspaceId}
            brandId={brandId}
            researchActive={docs.research?.status === "QUEUED" || docs.research?.status === "RUNNING"}
            onBack={back}
            canEdit={canEditDocs}
            canConfirm={canConfirmDocs}
            onChanged={(entry) => setDocs((d) => d && { ...d, docs: d.docs.map((x) => (x.kind === entry.kind ? entry : x)) })}
            onStale={() => fetchContextDocs(workspaceId, brandId).then(setDocs)}
          />
        ) : view.kind === "competitor" ? (
          <CompetitorView base={base} id={view.id} onBack={back} />
        ) : view.kind === "content" ? (
          <ContentView base={base} id={view.id} onBack={back} />
        ) : view.kind === "agent" ? (
          <AgentView
            agentKey={view.key}
            autoRun={view.run && canRun}
            canRun={canRun}
            agent={agents?.find((a) => a.key === view.key) ?? null}
            report={view.key === "seo" ? reports?.seo ?? null : view.key === "geo" ? reports?.geo ?? null : null}
            docs={docs}
            workspaceId={workspaceId}
            brandId={brandId}
            onBack={back}
            onOpenDoc={(doc) => open({ kind: "doc", doc })}
            onRan={refreshAgents}
            onOpenPosts={() => showPanel("content")}
            onShowPanel={showPanel}
          />
        ) : (
          <Home
            user={user}
            agents={agents}
            agentsFailed={failed.agents}
            today={today}
            reports={reports}
            connections={connections}
            pipeline={pipeline}
            canRun={canRun}
            onOpen={open}
            onShowPanel={showPanel}
            onRetry={retry}
            due={perms?.includes("publish.execute") ? <DueStories base={base} onOpen={open} onShowPanel={showPanel} /> : null}
          />
        ),
    },
    {
      id: "analytics",
      title: "Analytics",
      icon: <Gauge />,
      render: () => <AnalyticsPanel reports={reports} failed={failed.reports} onRetry={retry} onOpenAgent={(key) => open({ kind: "agent", key })} />,
    },
    {
      id: "feed",
      title: "Agents feed",
      icon: <ListChecks />,
      render: () => <AgentsFeed agents={agents} agentsFailed={failed.agents} onRetry={retry} reports={reports} docs={docs} workspaceId={workspaceId} brandId={brandId} canRun={canRun} onRan={refreshAgents} onOpen={open} />,
    },
    {
      id: "ideas",
      title: "Ideas",
      icon: <Compass />,
      render: () => <IdeasPanel base={base} onRunScout={() => open({ kind: "agent", key: "scout", run: true })} onOpenPosts={() => showPanel("content")} />,
    },
    {
      id: "content",
      title: "Content calendar",
      icon: <CalendarDays />,
      render: () => <ContentPanel base={base} onOpen={(id) => open({ kind: "content", id })} onRunPlanner={() => open({ kind: "agent", key: "planner" })} />,
    },
    {
      id: "competitors",
      title: "Competitors",
      icon: <Users />,
      render: () => <CompetitorsPanel base={base} onOpen={(id) => open({ kind: "competitor", id })} onFind={() => open({ kind: "agent", key: "competitors" })} />,
    },
    { id: "log", title: "Agent Log", icon: <SquareTerminal />, render: () => <div className="p-2"><AgentLog workspaceId={workspaceId} brandId={brandId} compact /></div> },
  ];

  const outOfCredits = agents?.some((a) => a.lastRun?.error?.includes("AI credits used up"));
  return (
    <div className="flex h-full min-h-0 flex-col">
      {outOfCredits && (
        <p role="status" className="shrink-0 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          <span className="font-medium">Agents are paused:</span> the AI service is out of credits. You can still write and edit drafts, approve and publish. Once credits are added, press Run on the agent again.
        </p>
      )}
      <div className="min-h-0 flex-1">
        <PanelLayout panels={panels} presets={PRESETS} storageKey="ws.layout.v1" focus={focus} />
      </div>
    </div>
  );
}

const NONE_FAILED = { docs: false, agents: false, reports: false, connections: false };

const PANEL_IDS = ["context", "home", "ideas", "content", "competitors", "analytics", "feed", "log"] as const;
type PanelId = (typeof PANEL_IDS)[number];

const PRESETS: Preset<PanelId>[] = [
  {
    name: "Focus",
    description: "Context, today and agents, agents feed",
    layout: { columns: [{ id: "a", size: 1, panels: ["context"] }, { id: "b", size: 2.2, panels: ["home"] }, { id: "c", size: 1.3, panels: ["feed"] }], collapsed: [] },
  },
  {
    name: "Content team",
    description: "Ideas, today and agents, content calendar",
    layout: { columns: [{ id: "a", size: 1.1, panels: ["ideas"] }, { id: "b", size: 1.8, panels: ["home"] }, { id: "c", size: 1.1, panels: ["content"] }], collapsed: [] },
  },
  {
    name: "Market",
    description: "Your scores next to your competitors'",
    layout: { columns: [{ id: "a", size: 1, panels: ["context"] }, { id: "b", size: 1.3, panels: ["analytics"] }, { id: "c", size: 1.3, panels: ["competitors"] }], collapsed: [] },
  },
  {
    name: "Classic",
    description: "Context, analytics, agents feed",
    layout: { columns: [{ id: "a", size: 1, panels: ["context"] }, { id: "b", size: 1.15, panels: ["analytics"] }, { id: "c", size: 1.15, panels: ["feed"] }], collapsed: [] },
  },
  {
    name: "Operator",
    description: "Agents and live log side by side",
    layout: { columns: [{ id: "a", size: 1, panels: ["context", "analytics"] }, { id: "b", size: 1.8, panels: ["home", "log"] }, { id: "c", size: 1.2, panels: ["feed"] }], collapsed: [] },
  },
];

/* ───────────── Context pane (left) ───────────── */

/** Stored website, only if it is a valid http(s) URL: never link other schemes (e.g. javascript:). */
function safeSite(website: string | null) {
  const u = safeHttpUrl(website);
  return u ? { href: u.href, host: u.hostname.replace(/^www\./, "") } : null;
}

function plainSummary(markdown: string | undefined) {
  if (!markdown) return null;
  // First real sentence of the doc: skip headings and source lists, drop "(Sources: …)" and bare URLs.
  const clean = (l: string) =>
    l
      .replace(/^[-*\d.\s]+/, "")
      .replace(/\((?:sources?)\b[^)]*\)/gi, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\*\*|__|`/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return (
    markdown
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .map(clean)
      .find((l) => l.length > 60 && !/^sources?\b/i.test(l)) ?? null
  );
}

function docBadge(entry: ContextDocEntry, researching: boolean) {
  if (entry.latest?.status === "CONFIRMED") return <Check className="size-4 text-success" aria-label="Confirmed" />;
  if (entry.latest) return <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">New</span>;
  if (researching) return <Loader2 className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Drafting" />;
  return <Lock className="size-3.5 text-muted-foreground" aria-label="Not drafted yet" />;
}

/** Fix the brand's name or website in place (e.g. a placeholder site from setup). */
function BrandEditor({ base, brandName, website, onDone }: { base: string; brandName: string; website: string | null; onDone: (siteChanged: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState(brandName);
  const [site, setSite] = useState(website ?? "");
  // A business with no website can stay without one; the API can't clear a website, so one that exists stays required.
  const needsSite = !!website;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const typed = site.trim();
    const url = !typed ? null : /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
    const siteChanged = url !== null && url !== website;
    setPending(true);
    setError(null);
    try {
      await request(base, { method: "PATCH", body: JSON.stringify({ displayName: name.trim(), ...(siteChanged ? { websiteUrl: url } : {}) }) });
      router.refresh();
      onDone(siteChanged);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3" aria-label="Edit brand">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Brand name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className="h-10 rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Website{needsSite ? "" : " (optional)"}</span>
        <input value={site} onChange={(e) => setSite(e.target.value)} required={needsSite} inputMode="url" placeholder="yourbrand.com" className="h-10 rounded-md border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !name.trim() || (needsSite && !site.trim())}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone(false)} disabled={pending}>Cancel</Button>
      </div>
    </form>
  );
}

function ContextPane({
  base,
  brandName,
  website,
  docs,
  docsFailed,
  onRetry,
  geo,
  reportsReady,
  reportsFailed,
  connections,
  connectionsFailed,
  onOpenDoc,
  onOpenResearch,
  canEdit,
  canRun,
}: {
  base: string;
  onOpenResearch: () => void;
  /** Editing the brand needs context.edit; re-reading the site starts an agent run (agents.run). */
  canEdit: boolean;
  canRun: boolean;
  brandName: string;
  website: string | null;
  docs: ContextDocsResponse | null;
  docsFailed: boolean;
  onRetry: () => void;
  geo: Report;
  reportsReady: boolean;
  reportsFailed: boolean;
  connections: Connection[] | null;
  connectionsFailed: boolean;
  onOpenDoc: (k: ContextDocKind) => void;
}) {
  const product = docs?.docs.find((d) => d.kind === "product-information");
  const summary = plainSummary(product?.latest?.markdown);
  const researching = docs?.research?.status === "QUEUED" || docs?.research?.status === "RUNNING";
  const competitors = ((geo?.metrics.competitors ?? []) as { name: string; mentions: number }[]).slice(0, 8);
  const site = safeSite(website);
  const [editing, setEditing] = useState(false);
  const [siteSaved, setSiteSaved] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-border px-5 py-5">
          {editing ? (
            <BrandEditor base={base} brandName={brandName} website={website} onDone={(changed) => { setEditing(false); setSiteSaved(changed); }} />
          ) : (
          <>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-medium">{brandName}</h2>
            {canEdit && (
              <button type="button" onClick={() => { setSiteSaved(false); setEditing(true); }} className="inline-block py-1 text-xs text-muted-foreground hover:text-foreground">
                Edit
              </button>
            )}
          </div>
          {siteSaved && (
            <p role="status" className="mt-2 text-xs">
              Website saved. Agents use it from their next run.
              {canRun ? (
                <>
                  {" "}
                  <button type="button" onClick={() => { setSiteSaved(false); onOpenResearch(); }} className="font-medium underline underline-offset-2">Re-read it now</button> to redraft the documents.
                </>
              ) : null}
              {" "}
              <button type="button" onClick={() => setSiteSaved(false)} className="text-muted-foreground underline underline-offset-2">Dismiss</button>
            </p>
          )}
          {site && (
            <a href={site.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground">
              {site.host} <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
          {summary ? (
            <>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{summary}</p>
              <button type="button" onClick={() => onOpenDoc("product-information")} className="mt-1 py-1 text-xs font-medium hover:underline">
                View more
              </button>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{researching && !product?.latest ? "Reading your website…" : "Your brand summary appears once Research has drafted the product document."}</p>
          )}
          </>
          )}
        </section>

        <section aria-labelledby="docs-h" className="border-b border-border px-3 py-4">
          <h2 id="docs-h" className="flex items-center gap-2 px-2 text-sm font-semibold">
            Documents <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">{docs?.docs.filter((d) => d.latest).length ?? 0}</span>
          </h2>
          <LoadGate ready={!!docs} failed={docsFailed} what="your documents" onRetry={onRetry} rows={2} className="mt-2 px-2">
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
            {docs?.docs.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted-foreground">No documents yet. Research drafts them from your website.</li>
            )}
          </ul>
          </LoadGate>
        </section>

        <section aria-labelledby="comp-h" className="border-b border-border px-5 py-4">
          <h2 id="comp-h" className="flex items-center gap-2 text-sm font-semibold">
            Competitors {reportsReady && <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">{competitors.length}</span>}
          </h2>
          <LoadGate ready={reportsReady} failed={reportsFailed} what="competitors" onRetry={onRetry} rows={1} className="mt-2">
          {competitors.length ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">Brands AI assistants recommend instead of you. Audit them in the Competitors panel.</p>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                {competitors.map((c) => (
                  <li key={c.name} className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-xs font-semibold">{c.name[0]?.toUpperCase()}</span>
                    <span className="truncate">{c.name}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Run the GEO agent to see who AI recommends in your market.</p>
          )}
          </LoadGate>
        </section>

        <section aria-labelledby="conn-h" className="px-5 py-4">
          <h2 id="conn-h" className="text-sm font-semibold">
            Accounts
          </h2>
          <LoadGate ready={!!connections} failed={connectionsFailed} what="your accounts" onRetry={onRetry} rows={1} className="mt-2">
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
              Connect Instagram, Facebook, Google…
            </Link>
          )}
          </LoadGate>
        </section>
      </div>
    </div>
  );
}

/* ───────────── Centre: home ───────────── */

/** "No new drafts to check" and friends: the agent ran fine and found no work. Not a failure. */
const nothingToDo = (a: AgentSummary | undefined) => a?.lastRun?.status === "FAILED" && /^(No |Nothing )/.test(a.lastRun.error ?? "");

function agentStatus(a: AgentSummary | undefined) {
  const s = a?.lastRun?.status;
  if (nothingToDo(a)) return "Nothing to do right now";
  if (s === "RUNNING") return "Running…";
  if (s === "QUEUED") return a?.lastRun?.startedAt ? "Retrying soon" : "Queued";
  if (s === "FAILED") return "Failed";
  if (s === "SUCCEEDED") return `Done ${timeAgo(a?.lastRun?.finishedAt)}`;
  return "Ready";
}

function Home({
  user,
  agents,
  agentsFailed,
  today,
  reports,
  connections,
  pipeline,
  canRun,
  onOpen,
  onShowPanel,
  onRetry,
  due,
}: {
  /** The card for stories due to be posted by hand (people who can publish only). */
  due: React.ReactNode;
  user: Props["user"];
  agents: AgentSummary[] | null;
  agentsFailed: boolean;
  /** Whether Today's sources are still loading, or one failed with nothing to show. */
  today: { loading: boolean; failed: boolean };
  onRetry: () => void;
  reports: { seo: Report; geo: Report } | null;
  connections: Connection[] | null;
  pipeline: { ideasToDecide: number; awaiting: number; toWrite: number; shortlisted: number } | null;
  canRun: boolean;
  onOpen: (v: View) => void;
  onShowPanel: (id: PanelId) => void;
}) {
  const first = firstNameOf(user.name);
  const tasks = useMemo(() => {
    const list: { id: string; done: boolean; label: string; detail?: string; action: React.ReactNode }[] = [];
    const run = (key: string, label: string, done: boolean) =>
      list.push({ id: key, done, label, detail: done ? undefined : "Not run yet", action: <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: "agent", key })}>Open</Button> });
    if (reports) {
      run("seo", "Check your website's SEO health", !!reports.seo);
      run("geo", "See if AI assistants recommend you", !!reports.geo);
    }
    if (pipeline && !pipeline.ideasToDecide && !pipeline.awaiting && !pipeline.toWrite && !pipeline.shortlisted && canRun) {
      list.push({
        id: "scout",
        done: false,
        label: "Get post ideas for your brand",
        detail: "Scout reads your documents and the season",
        action: (
          <Button size="sm" onClick={() => onOpen({ kind: "agent", key: "scout", run: true })}>
            Get ideas
          </Button>
        ),
      });
    }
    if (pipeline?.shortlisted) {
      list.push({
        id: "plan",
        done: false,
        label: "Plan your shortlisted ideas into posts",
        detail: `${pipeline.shortlisted} shortlisted`,
        action: (
          <Button size="sm" variant="secondary" onClick={() => onShowPanel("ideas")}>
            See ideas
          </Button>
        ),
      });
    }
    if (pipeline?.ideasToDecide) {
      list.push({
        id: "ideas",
        done: false,
        label: "Decide on new post ideas",
        detail: `${pipeline.ideasToDecide} recommended`,
        action: (
          <Button size="sm" variant="secondary" onClick={() => onShowPanel("ideas")}>
            See ideas
          </Button>
        ),
      });
    }
    if (pipeline?.toWrite) {
      list.push({
        id: "write",
        done: false,
        label: "Write your planned posts",
        detail: `${pipeline.toWrite} to brief and draft`,
        action: (
          <Button size="sm" variant="secondary" onClick={() => onShowPanel("content")}>
            Open posts
          </Button>
        ),
      });
    }
    if (pipeline?.awaiting) {
      list.push({
        id: "approve",
        done: false,
        label: "Review drafts ready for approval",
        detail: `${pipeline.awaiting} waiting`,
        action: (
          <Button size="sm" variant="secondary" onClick={() => onShowPanel("content")}>
            Open calendar
          </Button>
        ),
      });
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
  }, [reports, connections, pipeline, canRun, onOpen, onShowPanel]);

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
        {due}
        {open.length > 0 ? (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {open.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{t.label}</span>
                  {t.detail && <span className="text-muted-foreground"> · {t.detail}</span>}
                </p>
                {t.action}
              </li>
            ))}
          </ul>
        ) : today.loading ? (
          <div className="mt-4">
            <ListSkeleton label="Loading your tasks" rows={2} />
          </div>
        ) : today.failed ? null : (
          <p className="mt-4 text-sm text-muted-foreground">{tasks.length ? "All done for today." : "Nothing to do today."}</p>
        )}
        {today.failed && !(today.loading && open.length === 0) && (
          <div className="mt-2">
            <LoadFailed what="today’s tasks" message={tasks.length ? "Some of today’s tasks didn’t load." : undefined} onRetry={onRetry} />
          </div>
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
        <LoadGate ready={!!agents} failed={agentsFailed} what="your agents" onRetry={onRetry} rows={1} className="mt-4">
        {built.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No agents are set up for this business yet.</p>
        ) : (
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
                  state={running ? "running" : a.lastRun?.status === "FAILED" && !nothingToDo(a) ? "failed" : "ready"}
                  onClick={() => onOpen({ kind: "agent", key: a.key })}
                />
              </li>
            );
          })}
        </ul>
        )}
        </LoadGate>
        <details className="group mt-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
            Coming soon · {PLANNED.length} agents
          </summary>
          <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-5">
            {PLANNED.map((p) => (
              <li key={p.key}>
                <AgentFolder icon={p.icon} tint="text-muted-foreground" name={p.name} status={p.does} state="locked" title={p.does} />
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}

type DueStory = { id: string; title: string; scheduledFor: string };
const pickDue = (d: { items: DueStory[] }) => d.items;
const DAY_MS = 24 * 3600_000;

/**
 * Stories due to be posted by hand: one card with a count, until someone posts them or stops Post by hand. Dismiss hides
 * it in this browser for a day (localStorage, per business; a blocked storage just means it can't stay dismissed).
 */
function DueStories({ base, onOpen, onShowPanel }: { base: string; onOpen: (v: View) => void; onShowPanel: (id: PanelId) => void }) {
  const items = useBrandData(base, "stories/due", pickDue as (d: never) => DueStory[]).data;
  const key = `stories-due-dismissed:${base}`;
  // Read after mount: the server render has no localStorage.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  useEffect(() => {
    try {
      setDismissedAt(Number(localStorage.getItem(key)) || 0);
    } catch {
      setDismissedAt(0);
    }
  }, [key]);
  if (!items?.length || dismissedAt === null || Date.now() - dismissedAt < DAY_MS) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // Storage blocked: hidden until the page reloads.
    }
    setDismissedAt(Date.now());
  };
  const n = items.length;
  return (
    <section aria-label="Stories to post by hand" className="mt-4 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
      <CalendarDays className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{n} {n === 1 ? "story" : "stories"} to post by hand</span>
        {n === 1 && <span className="text-muted-foreground"> · {items[0].title}</span>}
      </p>
      <Button size="sm" onClick={() => (n === 1 ? onOpen({ kind: "content", id: items[0].id }) : onShowPanel("content"))}>
        Open
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        Dismiss
      </Button>
    </section>
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
  canEdit: boolean;
  canConfirm: boolean;
}) {
  return (
    <div>
      <BackBar onBack={p.onBack} title={p.entry.title} />
      <div className="px-6 py-6">
        {/* Keyed by document: switching documents must never carry one document's edit into another. */}
        <DocPane key={p.entry.kind} entry={p.entry} workspaceId={p.workspaceId} brandId={p.brandId} researchActive={p.researchActive} onChanged={p.onChanged} onStale={p.onStale} canEdit={p.canEdit} canConfirm={p.canConfirm} />
      </div>
    </div>
  );
}

/** Where an agent's result lands, shown once its run has finished. */
const AGENT_NEXT: Record<string, { text: string; label: string; panel?: PanelId; href?: string }> = {
  planner: { text: "The Planner has filled your calendar.", label: "Open the calendar", panel: "content" },
  brief: { text: "Briefs are written on your posts.", label: "Open posts", panel: "content" },
  creator: { text: "Drafts are written on your posts.", label: "Open posts", panel: "content" },
  quality: { text: "Quality checks are on your drafts.", label: "Open posts", panel: "content" },
  seo: { text: "The SEO report is updated.", label: "See it in Performance", href: "/performance" },
  geo: { text: "The AI visibility report is updated.", label: "See it in Performance", href: "/performance" },
  competitors: { text: "Competitors it found are in the Competitors panel.", label: "Open competitors", panel: "competitors" },
};

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
  autoRun,
  onOpenPosts,
  onShowPanel,
  canRun,
}: {
  agentKey: string;
  onShowPanel: (id: PanelId) => void;
  /** The role may run agents; without it the Run button is hidden. */
  canRun: boolean;
  /** Start a run on open (one-click "Get ideas" from Today). */
  autoRun?: boolean;
  onOpenPosts: () => void;
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
      setError(e instanceof ApiError && e.status === 403 ? "Your role can't run agents. Ask an owner or admin." : errorMessage(e, "Couldn't start the agent. Try again."));
    } finally {
      setPending(false);
    }
  }

  // Once per mount; the ref stops React's dev double-effect from starting two paid runs.
  // A run already going counts as the auto-run: the ref is set first, so the end of that run
  // (the poll hands a new `agent`) doesn't start a second paid one.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoRun || autoStarted.current || !agent) return;
    autoStarted.current = true;
    if (running) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the agent has loaded
  }, [autoRun, agent]);

  return (
    <div>
      <BackBar onBack={onBack} title={agent?.name ?? agentKey} />
      <div className="flex flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight">{agent?.name ?? agentKey}</h1>
            <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">{agent?.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">{agentStatus(agent ?? undefined)}</p>
            {agent?.lastRun?.status === "FAILED" && agent.lastRun.error && (
              <p className={cn("mt-1 max-w-[60ch] text-sm", nothingToDo(agent) ? "text-muted-foreground" : "text-destructive")}>{readable(agent.lastRun.error)}</p>
            )}
          </div>
          {canRun && (
            <Button onClick={run} disabled={pending || running}>
              {pending || running ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
              {running ? "Running…" : agent?.lastRun ? "Run again" : "Run"}
            </Button>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {running && <p className="text-sm text-muted-foreground">Open Logs in the top bar to watch each step live.</p>}
        {!running && agent?.lastRun?.status === "SUCCEEDED" && AGENT_NEXT[agentKey] && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
            <span>{AGENT_NEXT[agentKey].text}</span>
            {AGENT_NEXT[agentKey].href ? (
              <Button size="sm" asChild>
                <Link href={AGENT_NEXT[agentKey].href!}>{AGENT_NEXT[agentKey].label}</Link>
              </Button>
            ) : (
              <Button size="sm" onClick={() => onShowPanel(AGENT_NEXT[agentKey].panel!)}>{AGENT_NEXT[agentKey].label}</Button>
            )}
          </div>
        )}

        {report && (
          <section aria-labelledby="report-h" className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <h2 id="report-h" className="text-base font-semibold">
                Latest report · <span className="tabular-nums">{report.score}/100</span>
              </h2>
              <Link href="/performance" className="text-sm text-muted-foreground hover:text-foreground">
                Full report
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

        {agentKey === "analyst" && <LearningNotes workspaceId={workspaceId} brandId={brandId} />}
        {/* Scout's output is the idea list: show it here, reloaded when a run finishes. */}
        {agentKey === "scout" && !running && (
          <div className="-mx-6 border-t border-border">
            <IdeasPanel
              key={agent?.lastRun?.finishedAt ?? "none"}
              base={`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`}
              onRunScout={() => void run()}
              onOpenPosts={onOpenPosts}
            />
          </div>
        )}

        {agentKey === "research" && docs && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {docs.docs.map((d) => (
              <li key={d.kind}>
                <button type="button" disabled={!d.latest} onClick={() => onOpenDoc(d.kind)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted disabled:hover:bg-transparent">
                  <span className={cn(!d.latest && "text-muted-foreground")}>{d.title}</span>
                  <span className="text-xs text-muted-foreground">{d.latest ? (d.latest.status === "CONFIRMED" ? "Reviewed" : "Ready") : "Not drafted"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ───────────── Analytics panel (SEO / GEO tabs, Okara "Analytics") ───────────── */

type PageSpeed = { performance: number; seo: number; accessibility: number; bestPractices: number; lcpMs: number | null; cls: number | null };

function AnalyticsPanel({ reports, failed, onRetry, onOpenAgent }: { reports: { seo: Report; geo: Report } | null; failed: boolean; onRetry: () => void; onOpenAgent: (key: string) => void }) {
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
      <LoadGate ready={!!reports} failed={failed} what="your reports" onRetry={onRetry} rows={2}>
      {!report ? (
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
              <p className="text-xs font-medium text-muted-foreground">PageSpeed on mobile</p>
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
      </LoadGate>
    </div>
  );
}

/* ───────────── Agents feed panel (Okara "Agents Feed") ───────────── */

function feedLine(key: string, a: AgentSummary | undefined, reports: { seo: Report; geo: Report } | null, docs: ContextDocsResponse | null) {
  if (a?.lastRun?.status === "QUEUED" && a.lastRun.startedAt) return "Hit a problem, retrying soon: open Logs for the reason";
  if (a?.lastRun?.status === "RUNNING" || a?.lastRun?.status === "QUEUED") return "Working…";
  if (a?.lastRun?.status === "FAILED") return a.lastRun.error ? `Last run: ${readable(a.lastRun.error)}` : "Last run failed: open Logs for details";
  if (key === "seo" && reports?.seo) return `${reports.seo.score}/100 · ${reports.seo.findings.length} fixes ready`;
  if (key === "geo" && reports?.geo) {
    const m = reports.geo.metrics as { visibility?: number; competitors?: unknown[] };
    return `Recommended unprompted ${m.visibility ?? 0}% · ${m.competitors?.length ?? 0} competitors named`;
  }
  if (key === "research" && docs) {
    const drafted = docs.docs.filter((d) => d.latest).length;
    return `${drafted} of 5 documents drafted`;
  }
  return a?.lastRun ? "Done" : "Not run yet";
}

function AgentsFeed({
  agents,
  agentsFailed,
  onRetry,
  reports,
  docs,
  workspaceId,
  brandId,
  canRun,
  onRan,
  onOpen,
}: {
  canRun: boolean;
  agents: AgentSummary[] | null;
  agentsFailed: boolean;
  onRetry: () => void;
  reports: { seo: Report; geo: Report } | null;
  docs: ContextDocsResponse | null;
  workspaceId: string;
  brandId: string;
  onRan: () => void;
  onOpen: (v: View) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const built = (agents ?? []).filter((a) => a.key !== "systems-check");
  async function run(key: string) {
    setBusy(key);
    setError(null);
    try {
      await startRun(workspaceId, brandId, key);
      onRan();
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the agent. Try again."));
    } finally {
      setBusy(null);
    }
  }
  return (
    <ul className="divide-y divide-border">
      {error && (
        <li role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </li>
      )}
      {(!agents || agentsFailed) && (
        <li className="px-4 py-3">
          <LoadGate ready={!!agents} failed={agentsFailed} what="your agents" onRetry={onRetry} rows={2} />
        </li>
      )}
      {agents && built.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No agents are set up for this business yet.</li>}
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
              <span className="block text-xs font-semibold">{a.name} agent</span>
              <span className="block truncate text-sm text-muted-foreground">{feedLine(a.key, a, reports, docs)}</span>
            </button>
            {(canRun || running) && (
              <Button size="sm" variant="ghost" disabled={!canRun || running || busy === a.key} onClick={() => run(a.key)} aria-label={`Run ${a.name}`}>
                {running || busy === a.key ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
              </Button>
            )}
          </li>
        );
      })}
      {PLANNED.map((p) => (
        <li key={p.key} className="flex items-center gap-3 px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
            <p.icon className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">{p.name} agent</span>
            <span className="block truncate text-sm text-muted-foreground">{p.does}</span>
          </span>
          <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            <Lock className="size-3" aria-hidden="true" /> Soon
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Analyst notes ───────────── */

function LearningNotes({ workspaceId, brandId }: { workspaceId: string; brandId: string }) {
  const [notes, setNotes] = useState<{ id: string; title: string; body: string; createdAt: string }[] | null>(null);
  useEffect(() => {
    request<{ notes: { id: string; title: string; body: string; createdAt: string }[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}/learning-notes`,
    ).then((d) => setNotes(d.notes), () => setNotes([]));
  }, [workspaceId, brandId]);
  if (!notes) return <p className="text-sm text-muted-foreground">Loading notes…</p>;
  if (!notes.length) return <p className="text-sm text-muted-foreground">No learning notes yet. Run the Analyst to write the first one.</p>;
  return (
    <section aria-labelledby="notes-h" className="flex flex-col gap-4">
      <h2 id="notes-h" className="text-base font-semibold">Learning notes</h2>
      {notes.map((n) => (
        <article key={n.id} className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
          <h3 className="mt-1 font-medium">{n.title}</h3>
          <div className="mt-2 text-sm"><Markdown source={n.body} /></div>
        </article>
      ))}
    </section>
  );
}
