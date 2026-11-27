"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import type { AgentSummary } from "@/components/agents/api";
import { ensureWorkLanguage, isRunCancelled } from "@/components/languages/languages";
import { errorMessage, request } from "@/components/settings/api";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { CHANNEL_LABEL, LoadGate, useBrandData, type ContentItem } from "@/components/workspace/content-panels";
import { QualityCheck } from "@/components/workspace/quality-check";
import { RunWatch } from "@/components/agents/drawer/scout-outputs";
import { qualityCounts, qualityGroups } from "@/components/agents/drawer/drawer-lists";
import { STAGE_LABEL, stageState } from "@/lib/agent-workflow";
import { loadPlanCredits, withPrice } from "@/lib/plan-credits";
import { dayTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type DrawerOutputsProps = { base: string; workspaceId: string; brandId: string; perms: string[]; agent: AgentSummary | null; onOpenPost: (id: string) => void; onRan: () => void };

// Module-level: useBrandData restarts its polling when `pick` changes.
const pickPosts = (d: { items: ContentItem[] }) => d.items;
const SCOPE = "Across all posts now (the calendar's open posts and the last 30 days), not one run.";
const COLLAPSED = 5;
const noop = () => {};

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <span className={cn("text-lg font-semibold tabular-nums", value > 0 && tone === "bad" && "text-destructive", value > 0 && tone === "warn" && "text-warning-ink")}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

const products = (i: ContentItem): string[] => {
  const p = (i.brief as { products?: unknown } | null)?.products;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string" && !!x) : [];
};

/** Quality's Overview: the posts' check state now (brand-wide), then the agent's last run on its own line. */
export function QualityOverview({ base, agent }: DrawerOutputsProps) {
  const { data, failed, reload } = useBrandData(base, "content", pickPosts as (d: never) => ContentItem[]);
  const c = useMemo(() => (data ? qualityCounts(data) : null), [data]);
  const run = agent?.lastRun;
  const at = run?.finishedAt ?? run?.startedAt;
  return (
    <div className="flex flex-col gap-4 p-4">
      <LoadGate ready={!!c} failed={failed} what="posts" onRetry={() => void reload()} rows={3}>
        {c && (
          <section aria-labelledby="quality-ov-h" className="flex flex-col gap-2">
            <h3 id="quality-ov-h" className="text-sm font-semibold">Review queue</h3>
            <p className="text-xs text-muted-foreground">{SCOPE}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Checked" value={c.checked} />
              <Stat label="Passed" value={c.passed} />
              <Stat label="Blocked" value={c.blocked} tone="bad" />
              <Stat label="Passed with notes" value={c.warnings} tone="warn" />
              <Stat label="Awaiting approval" value={c.awaitingApproval} />
              <Stat label="Waiting for a check" value={c.toCheck} />
            </div>
            <p className="text-sm">
              {c.blocked
                ? `Next: fix ${c.blocked} blocked ${c.blocked === 1 ? "draft" : "drafts"} (Outputs). Blocked drafts never go to approval.`
                : c.awaitingApproval
                  ? `Next: ${c.awaitingApproval} ${c.awaitingApproval === 1 ? "post awaits" : "posts await"} your approval.`
                  : c.toCheck
                    ? `${c.toCheck} ${c.toCheck === 1 ? "draft waits" : "drafts wait"} for the check.`
                    : "Nothing waiting for review."}
            </p>
          </section>
        )}
      </LoadGate>
      {agent && (
        <section aria-labelledby="quality-run-h" className="flex flex-col gap-1">
          <h3 id="quality-run-h" className="text-sm font-semibold">Agent</h3>
          <p className="text-xs text-muted-foreground">
            Last run: {STAGE_LABEL[stageState(run)]}
            {at ? ` · ${dayTime(at)}` : run ? "" : " · never run"}
            {run?.status === "FAILED" && run.error && !run.nothingToDo ? ` · ${run.error}` : ""}
          </p>
        </section>
      )}
    </div>
  );
}

/** One post's row: title, channel, date, version; `children` under it; Open post and the check details on the right. */
function PostRow({ item, open, onToggle, onOpenPost, children, actions }: { item: ContentItem; open: boolean; onToggle: () => void; onOpenPost: (id: string) => void; children?: ReactNode; actions?: ReactNode }) {
  const names = products(item);
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="break-words text-sm font-medium">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {CHANNEL_LABEL[item.channel] ?? item.channel} · {item.scheduledFor ? dayTime(item.scheduledFor) : "No date"}
          {item.latest ? ` · v${item.latest.version}` : ""}
          {names.length ? ` · ${names.join(", ")}` : ""}
        </p>
      </div>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onOpenPost(item.id)}>Open post</Button>
        {actions}
        {item.latest?.check && (
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={onToggle}>
            <ChevronRight aria-hidden className={cn("transition-transform motion-reduce:transition-none", open && "rotate-90")} />
            Check details
          </Button>
        )}
      </div>
      {/* One open at a time: QualityCheck's heading id is fixed. */}
      {open && item.latest?.check && (
        <div className="rounded-lg border border-border p-3">
          <QualityCheck check={item.latest.check} />
        </div>
      )}
    </li>
  );
}

/** The checks of one level on a draft: name, then the check's note (what's wrong and what to change). */
function Findings({ item, level }: { item: ContentItem; level: "blocker" | "warn" }) {
  const rows = item.latest?.check?.results.filter((r) => r.status === level) ?? [];
  if (!rows.length) return null;
  return (
    <ul className={cn("flex flex-col gap-1 rounded-md px-3 py-2 text-xs", level === "blocker" ? "bg-destructive/5" : "bg-warning/10")}>
      {rows.map((r, i) => (
        <li key={i} className="break-words">
          <span className={cn("font-medium", level === "blocker" ? "text-destructive" : "text-warning-ink")}>{r.check}: </span>
          <span className="text-muted-foreground">{r.note}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ id, title, count, note, children }: { id: string; title: string; count: number; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <div className="flex flex-col gap-0.5 px-4 pb-2 pt-4">
        <h3 id={id} className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground">· {count}</span>
        </h3>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <ul className="divide-y divide-border border-y border-border">{children}</ul>
    </section>
  );
}

/**
 * Quality's Outputs, review first: A blocked drafts (each blocking check with its note, Fix with the Creator for this
 * post), B posts that passed and await approval, C those that passed with notes. Groups come from the same queue the
 * workflow strip counts. Blocked drafts are never offered for approval here.
 */
export function QualityOutputs({ base, workspaceId, perms, onOpenPost, onRan }: DrawerOutputsProps) {
  const { data, failed, reload } = useBrandData(base, "content", pickPosts as (d: never) => ContentItem[]);
  const groups = useMemo(() => (data ? qualityGroups(data) : null), [data]);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  // Posts we sent to the Creator (version then, run), until their version changes or the run fails.
  const [sent, setSent] = useState<Map<string, { version: number; runId: string }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const canRun = perms.includes("agents.run");
  const creatorPrice = useRunPrice(workspaceId, "creator");
  const canRead = perms.includes("agents.read");
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  // A failed run (or one with nothing to do) gives the row its Fix button back, with the reason.
  const creatorFailed = useCallback((id: string, why: string) => {
    setSent((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
    setError(why);
  }, []);

  // The Creator rewrites the one post (its input takes itemId), as the post's own "Fix with the Creator" does brand-wide.
  async function fix(item: ContentItem) {
    setError(null);
    setFixing(item.id);
    try {
      await ensureWorkLanguage(base);
      // The engine folds starts by input, so each post's Fix is its own run.
      const { run } = await request<{ run: { id: string } }>(`${base}/agents/creator/runs`, { method: "POST", body: JSON.stringify({ input: { itemId: item.id } }) });
      setSent((m) => new Map(m).set(item.id, { version: item.latest?.version ?? 0, runId: run.id }));
      if (workspaceId) void loadPlanCredits(workspaceId, true);
      onRan();
    } catch (e) {
      if (!isRunCancelled(e)) setError(errorMessage(e, "Couldn't start the Creator. Try again."));
    } finally {
      setFixing(null);
    }
  }

  const passed = groups ? (showAll ? groups.passed : groups.passed.slice(0, COLLAPSED)) : [];
  const empty = groups && !groups.blocked.length && !groups.passed.length && !groups.warnings.length;

  return (
    <div className="flex flex-col pb-4">
      <p className="px-4 pt-4 text-xs text-muted-foreground">{SCOPE}</p>
      {error && <p role="alert" className="px-4 pt-2 text-sm text-destructive">{error}</p>}
      <LoadGate ready={!!groups} failed={failed} what="posts" onRetry={() => void reload()} rows={3} className="px-4 pt-3">
        {empty && <p className="px-4 py-6 text-sm text-muted-foreground">No drafts are blocked or awaiting approval right now.</p>}
        {groups && groups.blocked.length > 0 && (
          <Section id="q-blocked-h" title="Blocked drafts" count={groups.blocked.length} note="These need fixes before they can go to approval.">
            {groups.blocked.map((p) => {
              const s = sent.get(p.id);
              const waiting = !!s && s.version === (p.latest?.version ?? 0);
              return (
                <PostRow
                  key={p.id}
                  item={p}
                  open={open === p.id}
                  onToggle={() => toggle(p.id)}
                  onOpenPost={onOpenPost}
                  actions={
                    canRun ? (
                      waiting ? (
                        // No spinner: a run that ends with nothing to do leaves the version as it was; a failed run gives Fix back.
                        <span role="status" className="text-xs text-muted-foreground">
                          Sent to the Creator: see its Activity
                          {canRead && <RunWatch base={base} runId={s.runId} onFailed={(why) => creatorFailed(p.id, why)} onDone={noop} />}
                        </span>
                      ) : (
                        <Button size="sm" onClick={() => void fix(p)} disabled={!!fixing}>
                          <Sparkles aria-hidden /> {fixing === p.id ? "Starting…" : withPrice("Fix with the Creator", creatorPrice)}
                        </Button>
                      )
                    ) : null
                  }
                >
                  <Findings item={p} level="blocker" />
                </PostRow>
              );
            })}
          </Section>
        )}
        {groups && groups.passed.length > 0 && (
          <Section id="q-passed-h" title="Passed, awaiting approval" count={groups.passed.length}>
            {passed.map((p) => (
              <PostRow key={p.id} item={p} open={open === p.id} onToggle={() => toggle(p.id)} onOpenPost={onOpenPost} />
            ))}
            {groups.passed.length > COLLAPSED && (
              <li className="px-4 py-2">
                <Button size="sm" variant="ghost" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? "Show fewer" : `Show all ${groups.passed.length}`}
                </Button>
              </li>
            )}
          </Section>
        )}
        {groups && groups.warnings.length > 0 && (
          <Section id="q-warn-h" title="Passed with notes" count={groups.warnings.length} note="Awaiting approval; worth a look before you approve.">
            {groups.warnings.map((p) => (
              <PostRow key={p.id} item={p} open={open === p.id} onToggle={() => toggle(p.id)} onOpenPost={onOpenPost}>
                <Findings item={p} level="warn" />
              </PostRow>
            ))}
          </Section>
        )}
      </LoadGate>
    </div>
  );
}
