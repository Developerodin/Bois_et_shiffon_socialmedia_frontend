"use client";

import type { ReactNode } from "react";
import { ListSkeleton } from "@/components/settings/shared";
import { LoadFailed } from "@/components/ui/load-failed";
import type { ContentItem } from "@/components/workspace/content-panels";
import { StageQueue } from "@/components/workspace/content-panels";
import { readable } from "@/lib/agent-message";
import { runPosts } from "@/lib/agent-drawer";
import { nothingToDo } from "@/lib/agent-runs";
import type { DrawerData } from "@/components/agents/drawer/types";

/** A titled block of the drawer with its scope said under the title ("Latest run", "Waiting now across all posts"). */
export function DrawerSection({ id, title, scope, children }: { id: string; title: string; scope?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h3 id={id} className="text-sm font-semibold">{title}</h3>
        {scope && <p className="text-xs text-muted-foreground">{scope}</p>}
      </div>
      {children}
    </section>
  );
}

/** "Open post": opens the post in place (the calendar's peek, or /calendar from Channels). */
export function OpenPost({ id, onOpenPost }: { id: string; onOpenPost: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpenPost(id)} className="shrink-0 rounded-sm text-xs font-medium text-primary-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      Open post
    </button>
  );
}

/**
 * The latest run's posts read against the posts list: `items` the list has, `missing` the ones it doesn't (the list is
 * capped, or the post was deleted), named by their log line. null while either is still being read.
 */
export function runItems(d: DrawerData): { items: ContentItem[]; missing: { id: string; line: string }[] } | null {
  if (!d.run.events || !d.posts) return null;
  const byId = new Map(d.posts.map((p) => [p.id, p]));
  const items: ContentItem[] = [];
  const missing: { id: string; line: string }[] = [];
  for (const r of runPosts(d.run.events)) {
    const p = byId.get(r.id);
    if (p) items.push(p);
    else missing.push(r);
  }
  return { items, missing };
}

/**
 * The latest run's outputs, with every state said plainly: not run, running, nothing to do, failed, loading, a read
 * that failed, no posts, or the posts (`children` renders the ones the list has; the rest are listed by log line).
 */
export function LatestRun({ d, noun, children }: { d: DrawerData; noun: string; children: (items: ContentItem[]) => ReactNode }) {
  const last = d.agent?.lastRun;
  const going = last?.status === "RUNNING" || last?.status === "QUEUED";
  let body: ReactNode;
  if (!last) body = <p className="text-sm text-muted-foreground">It hasn&rsquo;t run yet for this business.</p>;
  else if (d.run.failed && !d.run.events) body = <LoadFailed what="its latest run" onRetry={d.run.retry} />;
  else if (d.postsFailed && !d.posts) body = <LoadFailed what="your posts" onRetry={d.reloadPosts} />;
  else {
    const read = runItems(d);
    if (!read) body = <ListSkeleton label="Loading its latest run" rows={2} />;
    else if (!read.items.length && !read.missing.length) {
      body = (
        <p className="text-sm text-muted-foreground">
          {going ? `Working now. Its ${noun} show here as it goes.` : nothingToDo(d.agent ?? undefined) ? `Nothing to do on its latest run: ${readable(last.error ?? "")}` : last.status === "FAILED" ? `Its latest run failed before it made any ${noun}.` : `Its latest run made no ${noun}.`}
        </p>
      );
    } else {
      body = (
        <>
          {going && <p className="text-xs text-muted-foreground">Still working: more may appear.</p>}
          {read.items.length > 0 && children(read.items)}
          {read.missing.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">Not in the loaded posts list (older, or since deleted) · {read.missing.length}</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {read.missing.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{readable(m.line)}</span>
                    <OpenPost id={m.id} onOpenPost={d.onOpenPost} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      );
    }
  }
  return (
    <DrawerSection id={`run-${d.agentKey}-h`} title={`Latest run: ${noun}`} scope="What its most recent run produced">
      {body}
    </DrawerSection>
  );
}

/** The brand-wide queue after this agent's stage, without the latest run's posts (listed above). */
export function WaitingNow({ d }: { d: DrawerData }) {
  const exclude = d.run.events ? runPosts(d.run.events).map((r) => r.id) : [];
  return <StageQueue base={d.base} agentKey={d.agentKey} exclude={exclude} onOpenPost={d.onOpenPost} title="Waiting now across all posts" />;
}

/** A small "label value" pair for summary strips. */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
