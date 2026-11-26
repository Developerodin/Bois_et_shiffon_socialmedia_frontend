"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fetchAgents } from "@/components/agents/api";
import { useAgentsPoll } from "@/components/agents/use-agents-poll";
import { ListSkeleton } from "@/components/settings/shared";
import { Card } from "@/components/ui/card";
import { CompetitorsPanel, CompetitorView } from "@/components/workspace/competitors-panel";
import { knownName } from "@/components/workspace/known-name";
import { Peek } from "@/components/workspace/peek";
import { fetchShared } from "@/components/workspace/use-job";
import { usePeek, type PeekItem } from "@/components/workspace/use-peek";
import { AgentView, NotForRole } from "@/components/workspace/workspace";
import { recentKey, viewToEntry, writeRecent } from "@/lib/recent";
import { agreedToDrop, namesItem, navigate, peekCrumb, peekKey, peekTitle, viewFromSearch, viewToSearch, type View } from "@/lib/workspace-view";

/**
 * The /competitors page's list and its side peek, which opens a competitor's audit (?competitor=) or the Competitors
 * agent (?agent=competitors, from Find) over the list, as /tasks does with ?task= (TaskPeek). It renders the Overview's
 * CompetitorView and AgentView; the Overview still opens them for old /?competitor= and /?agent= links. Neither view
 * holds unsaved edits, so unlike TaskPeek nothing asks before the item changes or closes.
 */
export function CompetitorsBoard({ workspaceId, brandId, perms, userId }: { workspaceId: string; brandId: string; perms: string[]; userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const canRun = perms.includes("agents.run");
  const canAgents = perms.includes("agents.read");
  const rKey = recentKey(workspaceId, brandId, userId);

  const hrefFor = useCallback(
    (v: View) => {
      const s = viewToSearch(v, window.location.search, pathname);
      return s.startsWith("?") ? `${pathname}${s}` : s;
    },
    [pathname],
  );
  const show = (v: View) => navigate(router, hrefFor(v), pathname);

  // Only a competitor or the Competitors agent opens here. Any other item, a malformed one, or an agent the brand
  // doesn't have is taken out of the URL in place, so Back doesn't return to it.
  const parsed = viewFromSearch(query);
  const view = parsed.kind === "competitor" || (parsed.kind === "agent" && parsed.key === "competitors") ? parsed : null;

  // The Competitors agent's summary, polled only while it is open and the role may read agents (else a 403), never
  // while the tab is hidden. The peek shows a skeleton until the first answer. A fresh read after a run (refreshAgents)
  // reaches `agents` through the shared request.
  const agentOpen = view?.kind === "agent" && canAgents;
  const { agents } = useAgentsPoll(workspaceId, brandId, agentOpen);
  const refreshAgents = useCallback(() => fetchAgents(workspaceId, brandId, true).then(() => undefined), [workspaceId, brandId]);
  // The Competitors agent adds competitors: once its run ends, read the list again instead of waiting for the list's
  // idle poll (a minute).
  const findRun = agents?.find((a) => a.key === "competitors")?.lastRun;
  const findDone = findRun && findRun.status !== "QUEUED" && findRun.status !== "RUNNING" ? findRun.id : null;
  useEffect(() => {
    if (findDone) void fetchShared(`${base}/competitors`, true).catch(() => {});
  }, [findDone, base]);
  const unknownAgent = view?.kind === "agent" && canAgents && !!agents && !agents.some((a) => a.key === view.key);
  const bad = (!view && namesItem(query)) || unknownAgent;
  useEffect(() => {
    // A brand or workspace switch already took the item out (dropOpenItem): clear its one-time mark here.
    agreedToDrop(window.location.search || window.location.pathname);
    if (bad) navigate(router, hrefFor({ kind: "home" }), pathname, "replace");
  }, [query, bad, router, hrefFor, pathname]);

  // Recent records the item once it resolves (a competitor once its view found it, the agent once the list has it), as
  // the Overview does; the Overview's Recent menu opens a competitor back here.
  const viewRef = useRef(view);
  viewRef.current = view;
  const viewId = view ? peekKey(view) : null;
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const resolved = view?.kind === "agent" ? !!agents?.some((a) => a.key === view.key) : !!viewId && loadedId === viewId;
  useEffect(() => {
    const entry = viewRef.current && viewToEntry(viewRef.current, Date.now());
    if (rKey && entry && resolved) writeRecent(rKey, entry);
  }, [rKey, viewId, resolved]);

  const item: PeekItem | null = view && !bad ? { view, title: peekTitle(view, knownName(view, { docs: null, agents, base })), crumb: peekCrumb(view) } : null;
  const peek = usePeek(item);

  const peekView = (v: View) =>
    v.kind === "competitor" ? (
      <CompetitorView base={base} canRun={canRun} id={v.id} onLoaded={() => setLoadedId(peekKey(v))} />
    ) : v.kind !== "agent" ? null : !canAgents ? (
      <NotForRole what="the agents" />
    ) : !agents?.some((a) => a.key === v.key) ? (
      <div className="px-6 py-6">
        <ListSkeleton label="Loading" rows={3} />
      </div>
    ) : (
      // Never auto-run from here: Find only opens the agent. Its links to other places lead to the Overview.
      <AgentView
        agentKey={v.key}
        runId={v.runId}
        canRun={canRun}
        perms={perms}
        agent={agents.find((a) => a.key === v.key) ?? null}
        report={null}
        docs={null}
        workspaceId={workspaceId}
        brandId={brandId}
        onOpenDoc={(doc) => router.push(`/?doc=${encodeURIComponent(doc)}`)}
        onRan={refreshAgents}
        onOpenPosts={() => router.push("/?panel=content")}
        onOpenPost={(id) => router.push(`/?post=${encodeURIComponent(id)}`)}
        onShowPanel={(id) => router.push(`/?panel=${encodeURIComponent(id)}`)}
      />
    );

  return (
    <>
      <Card className="overflow-clip">
        <CompetitorsPanel base={base} canRun={canRun} onOpen={(id) => show({ kind: "competitor", id })} onFind={() => show({ kind: "agent", key: "competitors" })} />
      </Card>
      {peek.shown && (
        <Peek placement="page" open={peek.live} title={peek.shown.title} crumb={peek.shown.crumb} onClose={() => show({ kind: "home" })} onExited={peek.onExited} asideRef={peek.ref}>
          {/* Keyed by item: a replaced item remounts fresh, never carrying one item's state into another. */}
          <Fragment key={peekKey(peek.shown.view)}>{peekView(peek.shown.view)}</Fragment>
        </Peek>
      )}
    </>
  );
}
