"use client";

import { useRef, useState } from "react";
import { History } from "lucide-react";
import type { AgentSummary } from "@/components/agents/api";
import type { ContextDocsResponse } from "@/components/context/api";
import { knownName } from "@/components/workspace/known-name";
import { fetchShared } from "@/components/workspace/use-job";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { entryToView, readRecent, type RecentEntry } from "@/lib/recent";
import { timeAgo } from "@/lib/time";
import { peekTitle, type View } from "@/lib/workspace-view";

type Competitors = { state: "loading" } | { state: "failed" } | { state: "loaded"; names: Map<string, string> };

type Props = {
  storageKey: string;
  base: string;
  docs: ContextDocsResponse | null;
  agents: AgentSummary[] | null;
  /** Documents and agents are for roles that may read agents; for others their lists are never loaded. */
  canAgents: boolean;
  onOpen: (v: View) => void;
};

type Row = { entry: RecentEntry; title: string; gone: boolean };

const KIND_LABEL: Record<RecentEntry["kind"], string> = { post: "Post", doc: "Document", agent: "Agent", competitor: "Competitor", task: "Task" };

/** Adds to `knownName` only what Recent needs: a placeholder while a list loads, and `gone` once a readable list lacks it. */
function rowFor(entry: RecentEntry, p: Props, competitors: Competitors): Row {
  const view = entryToView(entry);
  let gone = false;
  let pending = false;
  let name = entry.kind === "competitor" ? undefined : knownName(view, p);
  if (entry.kind === "doc") {
    gone = !p.canAgents || (!!p.docs && !p.docs.docs.some((d) => d.kind === entry.id));
    pending = !p.docs && p.canAgents;
  } else if (entry.kind === "agent") {
    gone = !p.canAgents || (!!p.agents && !p.agents.some((a) => a.key === entry.id));
    pending = !p.agents && p.canAgents;
  } else if (entry.kind === "competitor") {
    // Its own fresh fetch, not the shared cache: the menu may open before the competitors panel has loaded.
    if (competitors.state === "loading") pending = true;
    else if (competitors.state === "loaded") {
      name = competitors.names.get(entry.id);
      gone = !name && !competitors.names.has(entry.id);
    }
  }
  // Posts and tasks are never gone: their lists are pages, older ones still open (the peek says so on a real 404).
  return { entry, title: pending ? "…" : peekTitle(view, name), gone };
}

/** "Recent" beside Layout: the last items opened here, newest first. Reads storage and fetches titles only when opened. */
export function RecentMenu(p: Props) {
  const [list, setList] = useState<RecentEntry[]>([]);
  const [competitors, setCompetitors] = useState<Competitors>({ state: "loading" });
  const [now, setNow] = useState(0);
  // Picking an item opens the peek and focuses its title; Radix must not then hand focus back to this button.
  const picked = useRef(false);

  const onOpenChange = (open: boolean) => {
    if (!open) return;
    picked.current = false;
    const entries = readRecent(p.storageKey);
    setList(entries);
    setNow(Date.now());
    if (entries.some((e) => e.kind === "competitor")) {
      setCompetitors({ state: "loading" });
      fetchShared(`${p.base}/competitors`).then(
        (d) => setCompetitors({ state: "loaded", names: new Map(((d as { competitors?: { id: string; name: string }[] }).competitors ?? []).map((c) => [c.id, c.name])) }),
        () => setCompetitors({ state: "failed" }),
      );
    }
  };

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button type="button" id="recent-menu" className={tool}>
          <History className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Recent</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-recent align="end" className="w-72" onCloseAutoFocus={(e) => picked.current && e.preventDefault()}>
        <DropdownMenuLabel>Recently opened</DropdownMenuLabel>
        {list.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">Nothing opened yet.</p>
        ) : (
          list.map((e) => {
            const r = rowFor(e, p, competitors);
            return (
              <DropdownMenuItem key={`${e.kind}:${e.id}`} disabled={r.gone} onSelect={() => {
                  picked.current = true;
                  p.onOpen(entryToView(e));
                }} className="flex-col items-start gap-0">
                <span className="max-w-full truncate">{r.title}</span>
                <span className="text-xs text-muted-foreground">
                  {KIND_LABEL[e.kind]} · {r.gone ? "No longer available" : timeAgo(e.at, now)}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
