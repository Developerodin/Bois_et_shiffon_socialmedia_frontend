"use client";

import { useState } from "react";
import { History } from "lucide-react";
import type { AgentSummary } from "@/components/agents/api";
import type { ContextDocsResponse } from "@/components/context/api";
import type { ContentItem } from "@/components/workspace/content-panels";
import { fetchShared, sharedResponse } from "@/components/workspace/use-job";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { ago, entryToView, readRecent, type RecentEntry } from "@/lib/recent";
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

/** The title for an entry from what the Overview already holds; `gone` only when its list loaded, is readable, and lacks it. */
function rowFor(entry: RecentEntry, p: Props, competitors: Competitors): Row {
  const view = entryToView(entry);
  let name: string | undefined;
  let gone = false;
  let pending = false;
  if (entry.kind === "doc") {
    name = p.docs?.docs.find((d) => d.kind === entry.id)?.title;
    gone = !!p.docs && p.canAgents && !p.docs.docs.some((d) => d.kind === entry.id);
    pending = !p.docs && p.canAgents;
  } else if (entry.kind === "agent") {
    name = p.agents?.find((a) => a.key === entry.id)?.name;
    gone = !!p.agents && p.canAgents && !p.agents.some((a) => a.key === entry.id);
    pending = !p.agents && p.canAgents;
  } else if (entry.kind === "post") {
    const items = (sharedResponse(`${p.base}/content`) as { items?: ContentItem[] } | undefined)?.items;
    name = items?.find((i) => i.id === entry.id)?.title;
    gone = !!items && !items.some((i) => i.id === entry.id);
  } else {
    if (competitors.state === "loading") pending = true;
    else if (competitors.state === "loaded") {
      name = competitors.names.get(entry.id);
      gone = !name && !competitors.names.has(entry.id);
    }
  }
  return { entry, title: pending ? "…" : peekTitle(view, name), gone };
}

/** "Recent" beside Layout: the last items opened here, newest first. Reads storage and fetches titles only when opened. */
export function RecentMenu(p: Props) {
  const [list, setList] = useState<RecentEntry[]>([]);
  const [competitors, setCompetitors] = useState<Competitors>({ state: "loading" });
  const [now, setNow] = useState(0);

  const onOpenChange = (open: boolean) => {
    if (!open) return;
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
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Recently opened</DropdownMenuLabel>
        {list.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">Nothing opened yet.</p>
        ) : (
          list.map((e) => {
            const r = rowFor(e, p, competitors);
            return (
              <DropdownMenuItem key={`${e.kind}:${e.id}`} disabled={r.gone} onSelect={() => p.onOpen(entryToView(e))} className="flex-col items-start gap-0">
                <span className="max-w-full truncate">{r.title}</span>
                <span className="text-xs text-muted-foreground">
                  {e.kind === "post" ? "Post" : e.kind === "doc" ? "Document" : e.kind === "agent" ? "Agent" : "Competitor"} · {r.gone ? "No longer available" : ago(e.at, now)}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
