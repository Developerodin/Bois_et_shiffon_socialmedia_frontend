"use client";

import { createPortal } from "react-dom";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearActionToasts } from "@/components/ui/toast";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
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
  Plug,
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
import { okToDiscard, UnsavedGuardOff } from "@/components/context/unsaved";
import { ApiError, errorMessage, request, settingsApi, type Connection } from "@/components/settings/api";
import { ListSkeleton } from "@/components/settings/shared";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { Findings, Score } from "@/components/performance/audit-board";
import { CompetitorView } from "@/components/workspace/competitors-panel";
import { ContentView, IdeasPanel, LoadFailed, LoadGate, useBrandData, type ContentItem, type Opportunity } from "@/components/workspace/content-panels";
import { NewPostDialog } from "@/components/workspace/new-post-dialog";
import { Peek } from "@/components/workspace/peek";
import { TaskView } from "@/components/tasks/task-view";
import { TodayTasks } from "@/components/tasks/today-tasks";
import { UpcomingWeek } from "@/components/workspace/upcoming-week";
import { PerformanceSummary } from "@/components/workspace/performance-summary";
import { FollowUpCounts } from "@/components/crm/follow-up-counts";
import { RecentMenu } from "@/components/workspace/recent-menu";
import { TOPBAR_SLOT_ID } from "@/components/shell/top-bar";
import { usePeek, type PeekItem } from "@/components/workspace/use-peek";
import { reelHref } from "@/components/reels/href";
import { Markdown } from "@/components/context/markdown";
import { PanelLayout, type PanelDef, type Preset } from "@/components/workspace/panel-layout";
import { NAV } from "@/lib/nav";
import { loadPlanCredits, withPrice, workspaceIdOf } from "@/lib/plan-credits";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { readable } from "@/lib/agent-message";
import { CONNECTIONS_READ, safeHttpUrl, STATUS_GROUPS } from "@/shared";
import { calendarHref as filterHref, isBlocked, isOverdue, type CalendarFilter } from "@/lib/calendar-filter";
import { timeAgo } from "@/lib/time";
import { RunEvents } from "@/components/agents/run-events";
import { nothingToDo } from "@/lib/agent-runs";
import { cachedPost, knownName } from "@/components/workspace/known-name";
import { recentKey, viewToEntry, writeRecent } from "@/lib/recent";
import { useReopen } from "@/components/workspace/use-reopen";
import { agreedToDrop, namesItem, peekCrumb, peekKey, peekTitle, PANEL_IDS, viewFromSearch, viewToSearch, type PanelId, type View } from "@/lib/workspace-view";
import { plainSummary } from "@/lib/plain-summary";
import { isRunCancelled } from "@/components/languages/languages";

type Finding = { id: string; severity: string; title: string; why?: string };
type Report = { score: number; summary: string; findings: Finding[]; metrics: Record<string, unknown>; createdAt: string } | null;

/** Agents shown as tiles. Built ones come from the API; planned ones are locked (Okara shows locked tiles too). */
const AGENT_META: Record<string, { icon: LucideIcon; tint: string }> = {
  research: { icon: ScanSearch, tint: "text-primary-strong" },
  scout: { icon: Compass, tint: "text-primary-strong" },
  planner: { icon: CalendarDays, tint: "text-primary-strong" },
  brief: { icon: FileText, tint: "text-primary-strong" },
  creator: { icon: PenLine, tint: "text-primary-strong" },
  quality: { icon: ShieldCheck, tint: "text-success" },
  analyst: { icon: LineChart, tint: "text-primary-strong" },
  seo: { icon: Gauge, tint: "text-success" },
  geo: { icon: MessageSquareQuote, tint: "text-primary-strong" },
  competitors: { icon: Users, tint: "text-primary-strong" },
};
/** Today's tasks show the icon of the agent or step they lead to, so the rows don't all look alike. */
const TASK_ICON: Record<string, LucideIcon> = {
  seo: Gauge,
  geo: MessageSquareQuote,
  scout: Compass,
  ideas: Compass,
  plan: CalendarDays,
  write: PenLine,
  approve: ShieldCheck,
  connect: Plug,
};
/** Every agent slot that can be "Soon"; the Overview shows the ones the sidebar marks Soon for this person (`soonAgents`). */
const PLANNED: { key: string; name: string; persona: string; icon: LucideIcon }[] = NAV.filter((e) => e.group === "agent" && e.soon).map((e) => ({
  key: e.id,
  name: e.role ?? e.label, // the role is the name in the Overview; the sidebar's persona is only a subtitle
  persona: e.label,
  icon: Lock,
}));

/** "Platform Admin" and the like are role names, not a first name to greet. */
const NOT_A_FIRST_NAME = new Set(["platform", "admin", "administrator", "user", "owner", "test", "demo", "team", "support"]);
function firstNameOf(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  return first && !first.includes("@") && !NOT_A_FIRST_NAME.has(first.toLowerCase()) ? first : null;
}

const POLL_MS = 5000;

// Today's "Needs action" counts. Numbers, so a poll that changes nothing doesn't re-render Today.
const pickOverdue = (d: { items: ContentItem[] }) => { const now = new Date(); return d.items.filter((i) => isOverdue(i, now)).length; };
const pickBlocked = (d: { items: ContentItem[] }) => d.items.filter((i) => isBlocked(i)).length;

type Props = {
  workspaceId: string;
  brandId: string;
  brandName: string;
  website: string | null;
  /** Reels are on for this workspace: a studio reel in the Overview links to its page. */
  reelsOn: boolean;
  /** The tasks flag is on for this workspace: without it a ?task= link is a bad link. */
  tasksOn: boolean;
  /** The digest flag is on: Home links to "This week" (/digest). */
  digestOn?: boolean;
  /** The ads and sales flags are on: Home's Performance shows those numbers to people who may read them. */
  adsOn?: boolean;
  salesOn?: boolean;
  crmOn?: boolean;
  /** The agent slots the sidebar marks "Soon" for this person (agentEntries): the Overview lists the same ones as coming. */
  soonAgents: readonly string[];
  user: { id?: string; name?: string | null; email?: string | null; image?: string | null };
  /** The person's permissions on this brand, from the shell (read with the page, so no fetch here can fail on its own). */
  perms: string[];
};

const viewFromUrl = () => viewFromSearch(window.location.search);
const viewSearch = (v: View) => viewToSearch(v, window.location.search, window.location.pathname);

export function Workspace({ workspaceId, brandId, brandName, website, reelsOn, tasksOn, digestOn = false, adsOn = false, salesOn = false, crmOn = false, soonAgents, user, perms }: Props) {
  const planned = PLANNED.filter((p) => soonAgents.includes(p.key));
  const router = useRouter();
  const [docs, setDocs] = useState<ContextDocsResponse | null>(null);
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [reports, setReports] = useState<{ seo: Report; geo: Report } | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  // ponytail: one peek at a time, so one `view`. Two peeks side by side would turn this into a list of views.
  const [view, setView] = useState<View>({ kind: "home" });
  const [focus, setFocus] = useState<{ id: PanelId; n: number } | undefined>();
  const [urlRead, setUrlRead] = useState(false);
  const [failed, setFailed] = useState(NONE_FAILED);
  const mark = useCallback((k: keyof typeof NONE_FAILED, v: boolean) => setFailed((f) => (f[k] === v ? f : { ...f, [k]: v })), []);
  const viewNow = useRef(view);
  viewNow.current = view;
  // open / close / Reopen / R; the last closed item resets with the brand because the page keys Workspace by brand.
  const { open, close, forgetClosed, peekNow } = useReopen(setView, viewNow);
  // The panel ?panel= last brought into view, so a later URL change (opening a post) doesn't bring it back.
  const shownPanel = useRef<string | null>(null);
  // Set when a view is dropped for being unknown: its URL replaces the bad one instead of adding a history entry.
  const replaceUrl = useRef(false);
  // The last full URL (path or search) the page accepted, to put back when the person stays on an unsaved document.
  const acceptedUrl = useRef<string | null>(null);
  // True while the URL change being handled came from browser Back/Forward (the entry the person went to must stay).
  const popped = useRef(false);
  useEffect(() => {
    const onPop = () => void (popped.current = true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Open what the URL names: on load (deep link, refresh), on Back/Forward, and on links to "/" while a view is open
  // (the sidebar's Overview). Next.js updates the search params for all of these, and for our own pushState below,
  // which already matches the open view and so changes nothing.
  const query = useSearchParams().toString();
  useEffect(() => {
    // A brand switch took the item out of the URL after the person agreed to leave: don't ask again. ponytail: matched
    // by URL string (agreedToDrop), so a URL changed in between just asks again; a flag on the switch would be exact.
    const agreed = agreedToDrop(window.location.search || window.location.pathname);
    const v = viewFromUrl();
    // A link naming an item that isn't valid: replace it with the clean URL, so Back doesn't return to it.
    if (v.kind === "home" && namesItem(window.location.search)) window.history.replaceState(null, "", viewSearch(v));
    if (viewSearch(v) !== viewSearch(viewNow.current)) {
      // An open document with unsaved edits asks first; staying puts the accepted URL back (in place of the new
      // entry), and the effect run that follows finds nothing to change.
      if (!agreed && !okToDiscard()) {
        // After Back/Forward, push: replacing would overwrite the entry they went back to.
        const back = acceptedUrl.current ?? viewSearch(viewNow.current);
        if (popped.current) window.history.pushState(null, "", back);
        else window.history.replaceState(null, "", back);
        popped.current = false;
        return;
      }
      forgetClosed();
      setView(v);
    }
    // ?panel= shows that panel once (e.g. a link to the Ideas panel), and stays in the URL.
    const panel = new URLSearchParams(window.location.search).get("panel");
    if (panel && panel !== shownPanel.current && (PANEL_IDS as readonly string[]).includes(panel)) setFocus((f) => ({ id: panel as PanelId, n: (f?.n ?? 0) + 1 }));
    shownPanel.current = panel;
    popped.current = false;
    acceptedUrl.current = window.location.search || window.location.pathname;
    setUrlRead(true);
  }, [query, forgetClosed]);
  useEffect(() => {
    // Until the URL has been read, writing it would erase a deep link.
    if (!urlRead) return;
    const next = viewSearch(view);
    const now = window.location.search || window.location.pathname;
    if (next === now) return;
    if (replaceUrl.current) window.history.replaceState(null, "", next);
    else window.history.pushState(null, "", next);
    replaceUrl.current = false;
    acceptedUrl.current = next;
  }, [view, urlRead]);
  // A ?doc= or ?agent= that names nothing shows home and drops the bad parameter, once the lists have loaded; so does a
  // ?task= while the tasks flag is off.
  useEffect(() => {
    const unknown = (view.kind === "task" && !tasksOn) || (view.kind === "doc" && !!docs && !docs.docs.some((d) => d.kind === view.doc)) || (view.kind === "agent" && !!agents && !agents.some((a) => a.key === view.key));
    if (!unknown) return;
    replaceUrl.current = true;
    setView({ kind: "home" });
  }, [view, docs, agents, tasksOn]);

  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  // What the person's role may do. Write controls show only for roles the API would accept.
  const canRun = perms.includes("agents.run");
  const canCreate = perms.includes("content.create");
  const canEditDocs = perms.includes("context.edit");
  const canConfirmDocs = perms.includes("context.confirm");
  // What this role may read (a client reviewer: no agents, documents or accounts). Nothing it can't read is asked for,
  // so nothing it can't read shows as failed; those sections are left out.
  const canAgents = perms.includes("agents.read");
  const canReports = perms.includes("analytics.read");
  const canAccounts = CONNECTIONS_READ.some((k) => perms.includes(k));
  // A failed load keeps what was already shown; a block shows its error only while it has nothing to show.
  const loadReports = useCallback(
    async () => {
      if (!canReports) return;
      return request<{ seo: Report; geo: Report }>(`${base}/audit-reports`).then(
        (r) => {
          setReports(r);
          mark("reports", false);
        },
        () => mark("reports", true),
      );
    },
    [base, mark, canReports],
  );
  const refreshAgents = useCallback(() => fetchAgents(workspaceId, brandId, true).then((a) => setAgents(a.agents)), [workspaceId, brandId]);

  // Each request gives up after 30 s (lib/net.ts), so a hung one can't stall the poll.
  const loadDocsAndAgents = useCallback(
    async (signal?: AbortSignal) => {
      if (!canAgents) return;
      const [d, a] = await Promise.allSettled([fetchContextDocs(workspaceId, brandId, signal), fetchAgents(workspaceId, brandId)]);
      if (signal?.aborted) return;
      if (d.status === "fulfilled") setDocs(d.value);
      if (a.status === "fulfilled") setAgents(a.value.agents);
      mark("docs", d.status === "rejected");
      mark("agents", a.status === "rejected");
    },
    [workspaceId, brandId, mark, canAgents],
  );
  // Everything the Overview loads up front; Retry calls it again.
  const loadAll = useCallback(
    async (signal?: AbortSignal) => {
      void loadReports();
      if (canAccounts) {
        settingsApi.connections(workspaceId, brandId).then(
          (c) => {
            setConnections(c.connections);
            mark("connections", false);
          },
          () => mark("connections", true),
        );
      }
      return loadDocsAndAgents(signal);
    },
    [workspaceId, brandId, loadReports, loadDocsAndAgents, mark, canAccounts],
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
  const pickToWrite = useCallback((d: { items: ContentItem[] }) => d.items.filter((i) => (STATUS_GROUPS.toWrite as readonly string[]).includes(i.status)).length, []);
  const pickShortlisted = useCallback((d: { opportunities: Opportunity[] }) => d.opportunities.filter((o) => o.status === "SHORTLISTED").length, []);
  const overdueQ = useBrandData(base, "content", pickOverdue as (d: never) => number);
  const blockedQ = useBrandData(base, "content", pickBlocked as (d: never) => number);
  const ideas = useBrandData(base, "opportunities", pickOpps as (d: never) => number);
  const shortlistedQ = useBrandData(base, "opportunities", pickShortlisted as (d: never) => number);
  const awaitingQ = useBrandData(base, "content", pickItems as (d: never) => number);
  const toWriteQ = useBrandData(base, "content", pickToWrite as (d: never) => number);
  const ideasToDecide = ideas.data, awaiting = awaitingQ.data, toWrite = toWriteQ.data, shortlisted = shortlistedQ.data;
  const pipeline = ideasToDecide == null || awaiting == null || toWrite == null || shortlisted == null ? null : { ideasToDecide, awaiting, toWrite, shortlisted };
  const pipelineFailed = [ideas, awaitingQ, toWriteQ, shortlistedQ].some((q) => q.data == null && q.failed);
  // Today is built from the reports, the connections and the pipeline counts (the ones this role can read).
  const today = {
    failed: (canReports && !reports && failed.reports) || (canAccounts && !connections && failed.connections) || pipelineFailed,
    loading: (canReports && !reports && !failed.reports) || (canAccounts && !connections && !failed.connections) || (!pipeline && !pipelineFailed),
  };
  const reloadIdeas = ideas.reload, reloadContent = awaitingQ.reload;
  const retry = useCallback(() => {
    setFailed(NONE_FAILED);
    void loadAll();
    void reloadIdeas();
    void reloadContent();
  }, [loadAll, reloadIdeas, reloadContent]);

  // Posts, documents, agents and competitors open in the side peek; the board behind stays as it is.
  // Recording what was opened: once per item, and only once it has resolved (a 404 or a mistyped link isn't history).
  // Documents and agents resolve when they are in the loaded list; posts and competitors when their view loaded them.
  // Nothing is kept without a user id. ponytail: Recent is per brand and entries stay (30 days) until sign-out or TTL.
  const rKey = recentKey(workspaceId, brandId, user.id);
  const viewId = peekKey(view);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const resolved =
    view.kind === "doc" ? !!docs?.docs.some((d) => d.kind === view.doc)
    : view.kind === "agent" ? !!agents?.some((a) => a.key === view.key)
    : loadedId === viewId;
  useEffect(() => {
    const entry = viewToEntry(viewNow.current, Date.now());
    if (rKey && entry && resolved) writeRecent(rKey, entry);
  }, [rKey, viewId, resolved]);
  const [topSlot, setTopSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setTopSlot(document.getElementById(TOPBAR_SLOT_ID)), []);
  // Buttons that point at a panel bring it into view: a collapsed or absent one is expanded or added (saved), then
  // scrolled to and flashed (panel-layout's reveal; the sidebar's ?panel= goes through `focus`). A revealed panel can sit under the peek, so an open peek closes first (asking about unsaved work).
  const revealRef = useRef<((id: PanelId) => void) | null>(null);
  const revealPanel = (id: PanelId) => {
    if (viewNow.current.kind !== "home") {
      if (!okToDiscard()) return;
      setView({ kind: "home" });
    }
    revealRef.current?.(id);
  };
  // The posts now live on the Content calendar page: leaving for it asks about unsaved work in the peek first.
  const openCalendar = () => {
    if (okToDiscard()) router.push("/calendar");
  };
  // Toasts with a button (Reopen) do nothing once this page is gone.
  useEffect(() => clearActionToasts, []);

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
          show={{ docs: canAgents, competitors: canReports, accounts: canAccounts }}
        />
      ),
    },
    {
      id: "home",
      title: "Today & agents",
      icon: <ScanSearch />,
      render: () => (
          <Home
            workspaceId={workspaceId}
            base={base}
            docs={docs}
            user={user}
            agents={agents}
            agentsFailed={failed.agents}
            today={today}
            reports={reports}
            connections={connections}
            pipeline={pipeline}
            needs={{ overdue: overdueQ.data ?? 0, blocked: blockedQ.data ?? 0 }}
            canRun={canRun}
            canCreate={canCreate}
            reelsOn={reelsOn}
            onOpen={open}
            onShowPanel={revealPanel}
            onRetry={retry}
            due={<>{perms.includes("publish.execute") ? <DueStories base={base} onOpen={open} /> : null}{crmOn && perms.includes("inbox.read") ? <FollowUpCounts base={base} /> : null}</>}
            taskGroups={tasksOn && perms.includes("tasks.read") ? <TodayTasks base={base} onOpen={(id) => open({ kind: "task", id })} /> : null}
            week={<UpcomingWeek base={base} withTasks={tasksOn && perms.includes("tasks.read")} onOpen={open} />}
            performance={<PerformanceSummary base={base} ads={adsOn && perms.includes("ads.read")} sales={salesOn && perms.includes("crm.read")} />}
            showAgents={canAgents}
            digestOn={digestOn}
            planned={planned}
          />
      ),
    },
    {
      id: "analytics",
      title: "Analytics",
      icon: <Gauge />,
      render: () => (canReports ? <AnalyticsPanel reports={reports} failed={failed.reports} onRetry={retry} onOpenAgent={(key) => open({ kind: "agent", key })} /> : <NotForRole what="reports" />),
    },
    {
      id: "feed",
      title: "Agents feed",
      icon: <ListChecks />,
      render: () => !canAgents ? <NotForRole what="the agents" /> : <AgentsFeed planned={planned} agents={agents} agentsFailed={failed.agents} onRetry={retry} reports={reports} docs={docs} workspaceId={workspaceId} brandId={brandId} canRun={canRun} onRan={refreshAgents} onOpen={open} />,
    },
    {
      id: "ideas",
      title: "Ideas",
      icon: <Compass />,
      render: () => <IdeasPanel base={base} perms={perms} onRunScout={() => open({ kind: "agent", key: "scout", run: true })} onOpenPosts={openCalendar} onOpenPost={(id) => open({ kind: "content", id })} />,
    },
    { id: "log", title: "Agent Log", icon: <SquareTerminal />, render: () => (canAgents ? <div className="p-2"><AgentLog workspaceId={workspaceId} brandId={brandId} compact /></div> : <NotForRole what="the Agent Log" />) },
  ];

  // The peek's title: documents and agents from state, posts and competitors from the lists their views already
  // fetched (the shared cache; nothing new is polled for a title), else a plain fallback.
  let peekItem: PeekItem | null = null;
  if (view.kind !== "home") {
    const post = view.kind === "content" ? cachedPost(base, view.id) : undefined;
    peekItem = { view, title: peekTitle(view, view.kind === "panel" ? panels.find((p) => p.id === view.id)?.title : knownName(view, { docs, agents, base })), crumb: peekCrumb(view), fullPageHref: post?.studio && reelsOn ? reelHref(post.id, brandId) : undefined };
  }
  peekNow.current = peekItem;
  const peek = usePeek(peekItem);
  // Until its list has loaded, a document or agent shows a skeleton: never "Ready" and a Run button for an agent not
  // yet known. Once the list arrives the Overview re-renders and the view gets the real entry; an unknown one closes.
  const peekLoading = (
    <div className="px-6 py-6">
      <ListSkeleton label="Loading" rows={3} />
    </div>
  );
  // `live` is false while the closed item slides out: that snapshot never auto-runs an agent.
  const peekView = (v: View, live: boolean) =>
    v.kind === "doc" ? (
      !canAgents ? (
        <NotForRole what="documents" />
      ) : docs?.docs.some((d) => d.kind === v.doc) ? (
        <DocView
          entry={docs.docs.find((d) => d.kind === v.doc)!}
          workspaceId={workspaceId}
          brandId={brandId}
          researchActive={docs.research?.status === "QUEUED" || docs.research?.status === "RUNNING"}
          canEdit={canEditDocs}
          canConfirm={canConfirmDocs}
          onChanged={(entry) => setDocs((d) => d && { ...d, docs: d.docs.map((x) => (x.kind === entry.kind ? entry : x)) })}
          onStale={() => fetchContextDocs(workspaceId, brandId).then(setDocs)}
        />
      ) : (
        peekLoading
      )
    ) : v.kind === "panel" ? (
      // The board leaves this panel out while it is here (PanelLayout `previewing`), so it is mounted once. While the
      // peek slides out the panel is back on the board, so the sliding copy is left empty.
      live ? panels.find((p) => p.id === v.id)?.render() : null
    ) : v.kind === "competitor" ? (
      <CompetitorView base={base} canRun={canRun} id={v.id} onLoaded={() => setLoadedId(peekKey(v))} />
    ) : v.kind === "task" ? (
      !tasksOn ? null : perms.includes("tasks.read") ? (
        <TaskView base={base} id={v.id} perms={perms} userId={user.id} onLoaded={() => setLoadedId(peekKey(v))} />
      ) : (
        <NotForRole what="tasks" />
      )
    ) : v.kind === "content" ? (
      <ContentView base={base} perms={perms} id={v.id} reelsOn={reelsOn} brandId={brandId} onLoaded={() => setLoadedId(peekKey(v))} />
    ) : v.kind === "agent" ? (
      !canAgents ? (
        <NotForRole what="the agents" />
      ) : !agents?.some((a) => a.key === v.key) ? (
        peekLoading
      ) : (
      <AgentView
        agentKey={v.key}
        autoRun={live && v.run && canRun}
        runId={v.runId}
        canRun={canRun}
        perms={perms}
        agent={agents?.find((a) => a.key === v.key) ?? null}
        report={v.key === "seo" ? reports?.seo ?? null : v.key === "geo" ? reports?.geo ?? null : null}
        docs={docs}
        workspaceId={workspaceId}
        brandId={brandId}
        onOpenDoc={(doc) => open({ kind: "doc", doc })}
        onRan={refreshAgents}
        onOpenPosts={openCalendar}
        onOpenPost={(id) => open({ kind: "content", id })}
      />
      )
    ) : null;

  const outOfCredits = agents?.some((a) => a.lastRun?.error?.includes("AI credits used up"));
  return (
    <div className="flex h-full min-h-0 flex-col">
      {outOfCredits && (
        <p role="status" className="shrink-0 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          <span className="font-medium">Agents are paused:</span> the AI service is out of credits. You can still write and edit drafts, approve and publish. Once credits are added, press Run on the agent again.
        </p>
      )}
      {/* The Overview's heading whichever panels are on the board (the greeting in Home is a paragraph). */}
      <h1 className="sr-only">Overview</h1>
      {/* A competitor opens on the Competitors page, its home now; the rest open in this peek. */}
      {rKey && topSlot && createPortal(<RecentMenu storageKey={rKey} base={base} docs={docs} agents={agents} canAgents={canAgents} onOpen={(v) => (v.kind === "competitor" ? router.push(`/competitors?competitor=${encodeURIComponent(v.id)}`) : open(v))} />, topSlot)}
      <div className="relative min-h-0 flex-1">
        <PanelLayout panels={panels} presets={PRESETS} storageKey="ws.layout.v1" focus={focus} revealRef={revealRef} onOpenInPeek={(id) => open({ kind: "panel", id })} previewing={view.kind === "panel" ? view.id : null} />
        {peek.shown && (
          <Peek open={peek.live} title={peek.shown.title} crumb={peek.shown.crumb} fullPageHref={peek.shown.fullPageHref} onClose={close} onExited={peek.onExited} asideRef={peek.ref}>
            {/* Keyed by item: a replaced item remounts fresh, never carrying one item's state into another. */}
            {/* While it slides out, the closed item's editors no longer count as unsaved: the person already agreed. */}
            <UnsavedGuardOff value={!peek.live}>
              <Fragment key={peekKey(peek.shown.view)}>{peekView(peek.shown.view, peek.live)}</Fragment>
            </UnsavedGuardOff>
          </Peek>
        )}
      </div>
    </div>
  );
}

const NONE_FAILED = { docs: false, agents: false, reports: false, connections: false };

/** A panel this role can't read (e.g. a client reviewer and the agents): said plainly, never as a failed load. */
export function NotForRole({ what }: { what: string }) {
  return <p className="p-5 text-sm text-muted-foreground">Your role doesn&rsquo;t include {what}.</p>;
}

const PRESETS: Preset<PanelId>[] = [
  {
    name: "Focus",
    description: "Context, today and agents, agents feed",
    layout: { columns: [{ id: "a", size: 1, panels: ["context"] }, { id: "b", size: 2.2, panels: ["home"] }, { id: "c", size: 1.3, panels: ["feed"] }], collapsed: [] },
  },
  {
    // The content calendar has its own page now (/calendar); a saved copy of this preset loses it the same way.
    name: "Content team",
    description: "Ideas, today and agents",
    layout: { columns: [{ id: "a", size: 1.1, panels: ["ideas"] }, { id: "b", size: 1.8, panels: ["home"] }], collapsed: [] },
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

function docBadge(entry: ContextDocEntry, researching: boolean) {
  if (entry.latest?.status === "CONFIRMED") return <Check className="size-4 text-success" aria-label="Confirmed" />;
  if (entry.latest) return <StatusBadge tone="good">New</StatusBadge>;
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
  show,
}: {
  base: string;
  onOpenResearch: () => void;
  /** The sections this role can read: documents (agents.read), competitors (analytics.read), accounts (CONNECTIONS_READ). */
  show: { docs: boolean; competitors: boolean; accounts: boolean };
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
  const researchPrice = useRunPrice(workspaceIdOf(base), "research");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-5 pb-4 pt-5">
          {editing ? (
            <BrandEditor base={base} brandName={brandName} website={website} onDone={(changed) => { setEditing(false); setSiteSaved(changed); }} />
          ) : (
          <>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-medium">{brandName}</h2>
            {canEdit && (
              <button type="button" onClick={() => { setSiteSaved(false); setEditing(true); }} aria-label="Edit business details" className="inline-block rounded py-1 text-xs text-muted-foreground hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Edit
              </button>
            )}
          </div>
          {siteSaved && (
            <p role="status" className="mt-2 text-xs">
              Website saved. Agents use it from their next run.
              {canRun ? (
                <>
                  {" "}To redraft the documents,{" "}
                  <button type="button" onClick={() => { setSiteSaved(false); onOpenResearch(); }} className="font-medium underline underline-offset-2">{withPrice("re-read it now", researchPrice)}</button>.
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
          {!show.docs ? null : summary ? (
            <>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{summary}</p>
              <button type="button" onClick={() => onOpenDoc("product-information")} className="mt-1 rounded py-1 text-xs font-medium hover:underline pointer-coarse:min-h-11 pointer-coarse:py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                View more
              </button>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{researching && !product?.latest ? "Reading your website…" : "Your brand summary appears once Research has drafted the product document."}</p>
          )}
          </>
          )}
        </section>

        {show.docs && (
        <section aria-labelledby="docs-h" className="px-5 py-4">
          <h2 id="docs-h" className="flex items-center gap-2 text-sm font-semibold">
            Documents <span className="rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground">{docs?.docs.filter((d) => d.latest).length ?? 0}</span>
          </h2>
          <LoadGate ready={!!docs} failed={docsFailed} what="your documents" onRetry={onRetry} rows={2} className="mt-2">
          {/* Rows bleed into the padding so their hover fills edge to edge while the text lines up with the headings. */}
          <ul className="-mx-2 mt-2">
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
        )}

        {show.competitors && (
        <section aria-labelledby="comp-h" className="px-5 py-4">
          <h2 id="comp-h" className="flex items-center gap-2 text-sm font-semibold">
            Competitors {reportsReady && <span className="rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground">{competitors.length}</span>}
          </h2>
          <LoadGate ready={reportsReady} failed={reportsFailed} what="competitors" onRetry={onRetry} rows={1} className="mt-2">
          {competitors.length ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">Brands AI assistants recommend instead of you. Audit them on the{" "}<Link href="/competitors" className="rounded font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Competitors page</Link>.</p>
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
        )}

        {show.accounts && (
        <section aria-labelledby="conn-h" className="px-5 pb-6 pt-4">
          <h2 id="conn-h" className="text-sm font-semibold">
            Accounts
          </h2>
          <LoadGate ready={!!connections} failed={connectionsFailed} what="your accounts" onRetry={onRetry} rows={1} className="mt-2">
          {connections?.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {connections.map((c) => (
                <li key={c.id} className={cn("rounded-full border px-2.5 py-0.5 text-xs", c.status === "ACTIVE" ? "border-border" : "border-destructive/50 text-destructive")}>
                  {c.status === "ACTIVE" ? c.displayName : <Link href="/settings?tab=connections" className="rounded underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{c.displayName} · reconnect</Link>}
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
        )}
      </div>
    </div>
  );
}

/* ───────────── Centre: home ───────────── */

/** "No new drafts to check" and friends: the agent ran fine and found no work. Not a failure. */

function agentStatus(a: AgentSummary | undefined) {
  const s = a?.lastRun?.status;
  if (nothingToDo(a)) return "Nothing to do right now";
  if (s === "RUNNING") return "Running…";
  if (s === "QUEUED") return a?.lastRun?.startedAt ? "Retrying soon" : "Queued";
  if (s === "FAILED") return "Failed";
  if (s === "SUCCEEDED") return `Done ${timeAgo(a?.lastRun?.finishedAt)}`;
  return "Ready";
}

/**
 * Today items hidden with "Not now" (for a day) or read (for good), per business in this browser. Blocked storage just
 * means they come back on reload. ponytail: entries are never pruned; one small entry per item and document version.
 */
function useTodayMarks(base: string) {
  const key = `today-marks:${base}`;
  const [marks, setMarks] = useState<Record<string, number>>({});
  // Read after mount: the server render has no localStorage.
  useEffect(() => {
    try {
      setMarks(JSON.parse(localStorage.getItem(key) ?? "{}") ?? {});
    } catch {
      setMarks({});
    }
  }, [key]);
  const mark = useCallback(
    (id: string) =>
      setMarks((m) => {
        const next = { ...m, [id]: Date.now() };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage blocked: hidden until the page reloads.
        }
        return next;
      }),
    [key],
  );
  return { marks, mark };
}

function Home({
  workspaceId,
  base,
  docs,
  user,
  agents,
  agentsFailed,
  today,
  reports,
  connections,
  pipeline,
  needs,
  canRun,
  canCreate,
  reelsOn,
  onOpen,
  onShowPanel,
  onRetry,
  due,
  taskGroups,
  week,
  performance,
  showAgents,
  digestOn,
  planned,
}: {
  planned: typeof PLANNED;
  workspaceId: string;
  base: string;
  /** The agents section, for roles that can read agents. */
  showAgents: boolean;
  digestOn: boolean;
  docs: ContextDocsResponse | null;
  /** The card for stories due to be posted by hand (people who can publish only). */
  due: React.ReactNode;
  /** Today's task groups (flag `tasks`, tasks.read), above the post rows. */
  taskGroups: React.ReactNode;
  /** The Next 7 days section, under Today. */
  week: React.ReactNode;
  /** The key performance numbers, under Next 7 days (nothing for a role that reads neither ads nor sales). */
  performance: React.ReactNode;
  user: Props["user"];
  agents: AgentSummary[] | null;
  agentsFailed: boolean;
  /** Whether Today's sources are still loading, or one failed with nothing to show. */
  today: { loading: boolean; failed: boolean };
  onRetry: () => void;
  reports: { seo: Report; geo: Report } | null;
  connections: Connection[] | null;
  pipeline: { ideasToDecide: number; awaiting: number; toWrite: number; shortlisted: number } | null;
  /** Posts needing action, from the calendar: past their date and blocked (the next 7 days have their own section). */
  needs: { overdue: number; blocked: number };
  canRun: boolean;
  canCreate: boolean;
  reelsOn: boolean;
  onOpen: (v: View) => void;
  onShowPanel: (id: PanelId) => void;
}) {
  const first = firstNameOf(user.name);
  const scoutPrice = useRunPrice(workspaceId, "scout");
  const { marks, mark } = useTodayMarks(base);
  const tasks = useMemo(() => {
    const list: { id: string; done: boolean; label: string; detail?: string; action: React.ReactNode }[] = [];
    // Finished work comes first. Keyed by version, so a redrafted strategy shows up again.
    const strategy = docs?.docs.find((d) => d.kind === "marketing-strategy")?.latest;
    if (strategy) {
      const id = `read:${strategy.id}`;
      list.push({
        id,
        done: !!marks[id],
        label: "Your Marketing Strategy",
        detail: "Ready to read",
        action: (
          <Button size="sm" onClick={() => { mark(id); onOpen({ kind: "doc", doc: "marketing-strategy" }); }}>
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
    if (pipeline && !pipeline.ideasToDecide && !pipeline.awaiting && !pipeline.toWrite && !pipeline.shortlisted && canRun) {
      list.push({
        id: "scout",
        done: false,
        label: "Get post ideas for your brand",
        detail: "Opportunities reads your documents and the season",
        action: (
          <Button size="sm" onClick={() => onOpen({ kind: "agent", key: "scout", run: true })}>
            {withPrice("Get ideas", scoutPrice)}
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
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" asChild>
              <Link href={calendarHref()}>Open posts</Link>
            </Button>
            <NewPostDialog base={base} canCreate={canCreate} reelsOn={reelsOn} onCreated={(id) => onOpen({ kind: "content", id })} />
          </div>
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
          <Button size="sm" variant="secondary" asChild>
            <Link href={calendarHref()}>Open calendar</Link>
          </Button>
        ),
      });
    }
    for (const [need, label, detail] of [
      ["overdue", "Overdue posts", "past their date"],
      ["blocked", "Blocked posts", "stuck on a problem"],
    ] as const) {
      if (!needs[need]) continue;
      list.push({
        id: `need-${need}`,
        done: false,
        label,
        detail: `${needs[need]} ${detail}`,
        action: (
          <Button size="sm" variant="secondary" asChild>
            <Link href={calendarHref(need)}>Open calendar</Link>
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
  }, [base, docs, marks, mark, reports, connections, pipeline, needs, canRun, canCreate, reelsOn, onOpen, onShowPanel, scoutPrice]);

  const done = tasks.filter((t) => t.done).length;
  const open = tasks.filter((t) => !t.done && !(Date.now() - (marks[t.id] ?? 0) < DAY_MS));
  const built = (agents ?? []).filter((a) => a.key !== "systems-check");

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 pt-6">
        <p className="font-display text-2xl font-medium tracking-tight">{first ? `Welcome, ${first}.` : "Welcome."}</p>
        {digestOn && (
          <Link href="/digest" className="text-sm font-medium text-link underline underline-offset-4 hover:decoration-2">
            This week
          </Link>
        )}
      </div>

      <section aria-labelledby="today-h" className="px-5 pb-8 pt-5">
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
        {taskGroups}
        {due}
        {open.length > 0 ? (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {open.slice(0, 5).map((t) => {
              const Icon = TASK_ICON[t.id] ?? FileText;
              return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent" aria-hidden="true">
                  <Icon className="size-4 text-accent-foreground" />
                </span>
                <p className="min-w-[12rem] flex-1 line-clamp-2 text-sm">
                  <span className="font-medium">{t.label}</span>
                  {t.detail && <span className="text-muted-foreground"> · {t.detail}</span>}
                </p>
                {t.action}
                <Button size="sm" variant="ghost" onClick={() => mark(t.id)}>
                  Not now
                </Button>
              </li>
              );
            })}
          </ul>
        ) : today.loading ? (
          <div className="mt-4">
            <ListSkeleton label="Loading your tasks" rows={2} />
          </div>
        ) : today.failed ? null : (
          <p className="mt-4 text-sm text-muted-foreground">{!tasks.length ? "Nothing to do today." : done === tasks.length ? "All done for today." : "The rest is set aside until tomorrow."}</p>
        )}
        {today.failed && !(today.loading && open.length === 0) && (
          <div className="mt-2">
            <LoadFailed what="today’s tasks" message={tasks.length ? "Some of today’s tasks didn’t load." : undefined} onRetry={onRetry} />
          </div>
        )}
      </section>

      {week}

      {performance}

      {showAgents && (
      <section aria-labelledby="agents-h" className="px-5 pb-10">
        <div className="flex items-center justify-between">
          <h2 id="agents-h" className="text-base font-semibold">
            Agents
          </h2>
          <span className="text-xs text-muted-foreground">
            {built.length} active · {planned.length} coming
          </span>
        </div>
        <LoadGate ready={!!agents} failed={agentsFailed} what="your agents" onRetry={onRetry} rows={1} className="mt-4">
        {built.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No agents are set up for this business yet.</p>
        ) : (
        <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-5">
          {built.map((a) => {
            const meta = AGENT_META[a.key] ?? { icon: ScanSearch, tint: "text-primary-strong" };
            const running = a.lastRun?.status === "RUNNING" || a.lastRun?.status === "QUEUED";
            const state = running ? "running" : a.lastRun?.status === "FAILED" && !nothingToDo(a) ? "failed" : "ready";
            // SEO and GEO show their latest score on the tile (no need to open them); running or failed still says so.
            const report = a.key === "seo" ? reports?.seo : a.key === "geo" ? reports?.geo : null;
            const score = state === "ready" && report ? `${report.score}/100` : null;
            return (
              <li key={a.key}>
                <AgentFolder
                  icon={meta.icon}
                  tint={meta.tint}
                  name={a.name}
                  status={score ?? agentStatus(a)}
                  strong={!!score}
                  title={score ? `${a.name} score ${score} · ${agentStatus(a)}` : agentStatus(a)}
                  state={state}
                  onClick={() => onOpen({ kind: "agent", key: a.key })}
                />
              </li>
            );
          })}
        </ul>
        )}
        </LoadGate>
        {planned.length ? (
          <details className="group mt-6">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              Coming soon · {planned.length} {planned.length === 1 ? "agent" : "agents"}
            </summary>
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-5">
              {planned.map((p) => (
                <li key={p.key}>
                  <AgentFolder icon={p.icon} tint="text-muted-foreground" name={p.name} status={p.persona} state="locked" />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
      )}
    </div>
  );
}

type DueStory = { id: string; title: string; scheduledFor: string };
const pickDue = (d: { items: DueStory[] }) => d.items;
const DAY_MS = 24 * 3600_000;

/** The Content calendar page, filtered to posts needing one kind of action when `need` is given. */
const calendarHref = (need?: NonNullable<CalendarFilter["need"]>) => filterHref({ need });

/**
 * Stories due to be posted by hand: one card with a count, until someone posts them or stops Post by hand. Dismiss hides
 * it in this browser for a day (localStorage, per business; a blocked storage just means it can't stay dismissed).
 */
function DueStories({ base, onOpen }: { base: string; onOpen: (v: View) => void }) {
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
      {n === 1 ? (
        <Button size="sm" onClick={() => onOpen({ kind: "content", id: items[0].id })}>
          Open
        </Button>
      ) : (
        <Button size="sm" asChild>
          <Link href={calendarHref()}>Open</Link>
        </Button>
      )}
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
  strong,
  state,
  title,
  onClick,
}: {
  icon: LucideIcon;
  tint: string;
  name: string;
  status: string;
  /** A figure (a score) rather than a state: set in the foreground colour so it reads at a glance. */
  strong?: boolean;
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
      {/* The agent's icon on a soft tile; the badge in the corner carries running, failed or locked. */}
      <span className={cn("relative size-12 transition-transform duration-200 ease-out group-enabled:group-hover:-translate-y-0.5 motion-reduce:transition-none", locked && "opacity-55")}>
        <span className="absolute inset-0 grid place-items-center rounded-xl bg-accent transition-colors group-enabled:group-hover:bg-primary/15">
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
      <span className={cn("w-full truncate text-xs text-muted-foreground", strong && "font-semibold text-foreground tabular-nums", state === "failed" && "text-destructive")}>{status}</span>
    </button>
  );
}

/* ───────────── Centre: document and agent views ───────────── */

function DocView(p: {
  entry: ContextDocEntry;
  workspaceId: string;
  brandId: string;
  researchActive: boolean;
  onChanged: (e: ContextDocEntry) => void;
  onStale: () => void;
  canEdit: boolean;
  canConfirm: boolean;
}) {
  return (
    <div>
      <div className="px-6 py-6">
        {/* Keyed by document: switching documents must never carry one document's edit into another. */}
        <DocPane key={p.entry.kind} entry={p.entry} workspaceId={p.workspaceId} brandId={p.brandId} researchActive={p.researchActive} onChanged={p.onChanged} onStale={p.onStale} canEdit={p.canEdit} canConfirm={p.canConfirm} />
      </div>
    </div>
  );
}

/** Where an agent's result lands, shown once its run has finished. */
const AGENT_NEXT: Record<string, { text: string; label: string; href: string }> = {
  planner: { text: "The Planner has filled your calendar.", label: "Open the calendar", href: "/calendar" },
  brief: { text: "Briefs are written on your posts.", label: "Open posts", href: "/calendar" },
  creator: { text: "Drafts are written on your posts.", label: "Open posts", href: "/calendar" },
  quality: { text: "Quality checks are on your drafts.", label: "Open posts", href: "/calendar" },
  seo: { text: "The SEO report is updated.", label: "See the SEO & GEO reports", href: "/performance" },
  geo: { text: "The AI visibility report is updated.", label: "See the SEO & GEO reports", href: "/performance" },
  competitors: { text: "Competitors it found are on the Competitors page.", label: "Open competitors", href: "/competitors" },
};

/** An agent in a side peek: the Overview's, and the Competitors page's for the Competitors agent (Find). */
export function AgentView({
  agentKey,
  agent,
  report,
  docs,
  workspaceId,
  brandId,
  onOpenDoc,
  onRan,
  autoRun,
  runId,
  onOpenPosts,
  onOpenPost,
  canRun,
  perms,
  postsHere = false,
}: {
  agentKey: string;
  /** Posts open in place on this page (the calendar's and Channels' peek): the run's posts are listed instead of a link to the calendar. */
  postsHere?: boolean;
  /** A run to show what it did (from the "agent finished" toast); without it, the latest run. */
  runId?: string;
  /** The role may run agents; without it the Run button is hidden. */
  canRun: boolean;
  perms: string[];
  /** Start a run on open (one-click "Get ideas" from Today). */
  autoRun?: boolean;
  onOpenPosts: () => void;
  onOpenPost?: (id: string) => void;
  agent: AgentSummary | null;
  report: Report;
  docs: ContextDocsResponse | null;
  workspaceId: string;
  brandId: string;
  onOpenDoc: (k: ContextDocKind) => void;
  onRan: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A run started here replaces the one the link named: from then on show the latest run.
  const [startedFor, setStartedFor] = useState<string | null | undefined>(null);
  const shownRun = startedFor === runId ? undefined : runId;
  const running = agent?.lastRun?.status === "RUNNING" || agent?.lastRun?.status === "QUEUED";
  const price = useRunPrice(workspaceId, agentKey);

  async function run() {
    setPending(true);
    setError(null);
    try {
      await startRun(workspaceId, brandId, agentKey);
      setStartedFor(runId);
      onRan();
      void loadPlanCredits(workspaceId, true);
    } catch (e) {
      if (isRunCancelled(e)) return;
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
              {running ? "Running…" : withPrice(agent?.lastRun ? "Run again" : "Run", price)}
            </Button>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {running && <p className="text-sm text-muted-foreground">Open Logs in the top bar to watch each step live.</p>}
        {!running && agent?.lastRun?.status === "SUCCEEDED" && AGENT_NEXT[agentKey] && !(postsHere && AGENT_NEXT[agentKey].href === "/calendar") && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
            <span>{AGENT_NEXT[agentKey].text}</span>
            <Button size="sm" asChild>
              <Link href={AGENT_NEXT[agentKey].href}>{AGENT_NEXT[agentKey].label}</Link>
            </Button>
          </div>
        )}

        {(shownRun ?? agent?.lastRun?.id) && (
          <section aria-labelledby="did-h" className="flex flex-col gap-3">
            <h2 id="did-h" className="text-base font-semibold">What it did</h2>
            <RunEvents
              workspaceId={workspaceId}
              brandId={brandId}
              agentKey={agentKey}
              runId={(shownRun ?? agent?.lastRun?.id)!}
              again={shownRun ? undefined : `${agent?.lastRun?.id}:${agent?.lastRun?.status}`}
              onOpenPost={postsHere ? onOpenPost : undefined}
            />
          </section>
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
              perms={perms}
              onRunScout={() => void run()}
              onOpenPosts={onOpenPosts}
              onOpenPost={onOpenPost}
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
      <SegmentedRadios label="Report" name="analytics-report" value={tab} onChange={setTab} options={[{ value: "seo", label: "SEO" }, { value: "geo", label: "AI visibility (GEO)" }]} />
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
          {questions.length > 0 && <p className="text-xs text-muted-foreground">Green: mentioned · Amber: not mentioned · Grey: names the brand</p>}
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

/** The feed's icon-only run button, its own component so each row reads its agent's price (shown on hover and in the name). */
function FeedRunButton({ workspaceId, agent, disabled, spinning, onRun }: { workspaceId: string; agent: AgentSummary; disabled: boolean; spinning: boolean; onRun: () => void }) {
  const label = withPrice(`Run ${agent.name}`, useRunPrice(workspaceId, agent.key));
  return (
    <Button size="sm" variant="ghost" disabled={disabled} onClick={onRun} aria-label={label} title={label}>
      {spinning ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
    </Button>
  );
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
  planned,
}: {
  planned: typeof PLANNED;
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
      void loadPlanCredits(workspaceId, true);
    } catch (e) {
      if (!isRunCancelled(e)) setError(errorMessage(e, "Couldn't start the agent. Try again."));
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
        const meta = AGENT_META[a.key] ?? { icon: ScanSearch, tint: "text-primary-strong" };
        const Icon = meta.icon;
        const running = a.lastRun?.status === "RUNNING" || a.lastRun?.status === "QUEUED";
        return (
          <li key={a.key} className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
              <Icon className={cn("size-4", meta.tint)} aria-hidden="true" />
            </span>
            <button type="button" onClick={() => onOpen({ kind: "agent", key: a.key })} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold">{a.name} agent</span>
              <span className={cn("block truncate text-xs", a.lastRun?.status === "FAILED" ? "text-destructive" : "text-muted-foreground")}>{feedLine(a.key, a, reports, docs)}</span>
            </button>
            {(canRun || running) && (
              <FeedRunButton workspaceId={workspaceId} agent={a} disabled={!canRun || running || busy === a.key} spinning={running || busy === a.key} onRun={() => run(a.key)} />
            )}
          </li>
        );
      })}
      {planned.map((p) => (
        <li key={p.key} className="flex items-center gap-3 px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
            <p.icon className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{p.name} agent</span>
            <span className="block truncate text-xs text-muted-foreground">{p.persona}</span>
          </span>
          <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
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
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    request<{ notes: { id: string; title: string; body: string; createdAt: string }[] }>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}/learning-notes`,
    ).then((d) => setNotes(d.notes), () => setFailed(true));
  }, [workspaceId, brandId]);
  useEffect(load, [load]);
  if (failed) return <LoadFailed what="learning notes" onRetry={load} />;
  if (!notes) return <ListSkeleton label="Loading notes" rows={2} />;
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
