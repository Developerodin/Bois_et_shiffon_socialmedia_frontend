"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink, TriangleAlert, X } from "lucide-react";
import { request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ───────────── shared types + data ───────────── */

export type Opportunity = {
  id: string;
  title: string;
  summary: string;
  angle: string;
  channels: string[];
  decision: "RECOMMEND" | "HOLD" | "REJECT";
  reason: string;
  score: number;
  timing: string | null;
  sources: { url: string; title: string }[];
  status: "NEW" | "SHORTLISTED" | "DISMISSED" | "PLANNED";
};
type Check = { check: string; status: "pass" | "warn" | "blocker"; note: string };
export type ContentItem = {
  id: string;
  title: string;
  channel: string;
  status: string;
  scheduledFor: string | null;
  pillar: string | null;
  brief: Record<string, unknown> | null;
  opportunity: { title: string } | null;
  latest: {
    version: number;
    body: { hook: string; caption: string; hashtags: string[]; slides: string[]; script: string[]; pinTitle: string; altText: string };
    check: { overall: "PASS" | "WARN" | "BLOCKER"; results: Check[] } | null;
  } | null;
};

const POLL_MS = 6000;

// Last response per URL, shared by every panel on the page: a post opened from the calendar shows at once.
const lastResponse = new Map<string, unknown>();

/** Poll a brand API path; `reload` refetches now. Starts from the last response any panel got. */
export function useBrandData<T>(base: string, path: string, pick: (d: never) => T) {
  const url = `${base}/${path}`;
  const [data, setData] = useState<T | null>(() => (lastResponse.has(url) ? pick(lastResponse.get(url) as never) : null));
  const load = useCallback(
    () =>
      request<never>(url).then(
        (d) => {
          lastResponse.set(url, d);
          setData(pick(d));
        },
        () => undefined,
      ),
    [url, pick],
  );
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  return { data, reload: load };
}

export const CHANNEL_LABEL: Record<string, string> = {
  INSTAGRAM_POST: "Instagram post",
  INSTAGRAM_CAROUSEL: "Instagram carousel",
  INSTAGRAM_REEL: "Instagram Reel",
  FACEBOOK_POST: "Facebook",
  PINTEREST_PIN: "Pinterest",
  THREADS_POST: "Threads",
};
export const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  BRIEF_READY: "Brief ready",
  DRAFT_REVIEW: "Draft in review",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  REVIEWED: "Reviewed",
  REJECTED: "Rejected",
  BLOCKED: "Blocked",
};
const STATUS_TONE: Record<string, string> = {
  AWAITING_APPROVAL: "bg-primary/15 text-primary",
  APPROVED: "bg-success/15 text-success",
  PUBLISHED: "bg-success/15 text-success",
  BLOCKED: "bg-destructive/15 text-destructive",
  REJECTED: "bg-destructive/15 text-destructive",
};
const DECISION: Record<Opportunity["decision"], { label: string; tone: string }> = {
  RECOMMEND: { label: "Recommend", tone: "bg-success/15 text-success" },
  HOLD: { label: "Hold", tone: "bg-warning/15 text-warning" },
  REJECT: { label: "Reject", tone: "bg-muted text-muted-foreground" },
};
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/* ───────────── Ideas panel ───────────── */

export function IdeasPanel({ base, onRunScout }: { base: string; onRunScout: () => void }) {
  const pick = useCallback((d: { opportunities: Opportunity[] }) => d.opportunities, []);
  const { data, reload } = useBrandData(base, "opportunities", pick as (d: never) => Opportunity[]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [error, setError] = useState<string | null>(null);

  async function set(id: string, status: Opportunity["status"]) {
    setError(null);
    try {
      await request(`${base}/opportunities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await reload();
    } catch {
      setError("Couldn't update that idea. Your role may not allow it.");
    }
  }

  if (!data) return <p className="p-4 text-sm text-muted-foreground">Loading ideas…</p>;
  const shown = data.filter((o) => (filter === "all" ? true : o.status === "NEW" || o.status === "SHORTLISTED"));
  const shortlisted = data.filter((o) => o.status === "SHORTLISTED").length;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
        <span className="text-muted-foreground">
          {shortlisted} shortlisted · the Planner turns shortlisted ideas into posts
        </span>
        <div role="tablist" aria-label="Filter ideas" className="flex rounded-md bg-muted p-0.5">
          {(["open", "all"] as const).map((f) => (
            <button key={f} role="tab" type="button" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("rounded px-2 py-1", filter === f ? "bg-background text-foreground" : "text-muted-foreground")}>
              {f === "open" ? "To decide" : "All"}
            </button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="px-4 pt-3 text-sm text-destructive">{error}</p>}
      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">{data.length ? "No open ideas. Switch to All to see past ones." : "No ideas yet. The Opportunities agent finds what to post about."}</p>
          <Button size="sm" variant="secondary" onClick={onRunScout}>
            Find ideas
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((o) => (
            <li key={o.id} className={cn("flex flex-col gap-2 px-4 py-3.5", o.status === "DISMISSED" && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={cn("rounded-full px-2 py-0.5 font-medium", DECISION[o.decision].tone)}>{DECISION[o.decision].label}</span>
                {o.timing && <span className="text-muted-foreground">{o.timing}</span>}
                {o.status !== "NEW" && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{o.status === "SHORTLISTED" ? "Shortlisted" : o.status === "PLANNED" ? "Planned" : "Dismissed"}</span>}
              </div>
              <p className="text-sm font-medium">{o.title}</p>
              <p className="text-sm text-muted-foreground">{o.summary}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Why: </span>
                {o.reason}
              </p>
              <p className="text-xs text-muted-foreground">{o.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(" · ")}</p>
              {o.sources.length > 0 && (
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {o.sources.slice(0, 3).map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 py-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                        {s.title || new URL(s.url).hostname} <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {o.status !== "PLANNED" && (
                <div className="flex gap-2 pt-1">
                  {o.status === "SHORTLISTED" ? (
                    <Button size="sm" variant="secondary" onClick={() => set(o.id, "NEW")}>
                      Remove from shortlist
                    </Button>
                  ) : o.status === "DISMISSED" ? (
                    <Button size="sm" variant="ghost" onClick={() => set(o.id, "NEW")}>
                      Undo dismiss
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => set(o.id, "SHORTLISTED")}>
                        <Check aria-hidden="true" /> Shortlist
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => set(o.id, "DISMISSED")}>
                        <X aria-hidden="true" /> Dismiss
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────── Content (calendar) panel ───────────── */

export function ContentPanel({ base, onOpen, onRunPlanner }: { base: string; onOpen: (id: string) => void; onRunPlanner: () => void }) {
  const pick = useCallback((d: { items: ContentItem[] }) => d.items, []);
  const { data } = useBrandData(base, "content", pick as (d: never) => ContentItem[]);
  if (!data) return <p className="p-4 text-sm text-muted-foreground">Loading calendar…</p>;
  if (!data.length) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-muted-foreground">Nothing planned yet. Shortlist ideas, then run the Planner to fill your calendar.</p>
        <Button size="sm" variant="secondary" onClick={onRunPlanner}>
          Plan posts
        </Button>
      </div>
    );
  }
  const groups = new Map<string, ContentItem[]>();
  for (const i of data) {
    const k = i.scheduledFor ? i.scheduledFor.slice(0, 10) : "unscheduled";
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return (
    <ol className="flex flex-col">
      {[...groups].map(([k, list]) => (
        <li key={k}>
          <p className="sticky top-0 z-[1] bg-background/95 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">{k === "unscheduled" ? "No date" : day(k)}</p>
          <ul className="divide-y divide-border">
            {list.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onOpen(i.id)} className="flex w-full flex-col gap-1 px-4 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground">{CHANNEL_LABEL[i.channel] ?? i.channel}</span>
                    <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_TONE[i.status] ?? "bg-muted text-muted-foreground")}>
                      {i.latest?.check?.overall === "BLOCKER" && i.status === "DRAFT_REVIEW" ? "Needs fixes" : (STATUS_LABEL[i.status] ?? i.status)}
                    </span>
                  </span>
                  <span className="text-sm">{i.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/* ───────────── Centre: one post ───────────── */

export function ContentView({ base, id, onBack }: { base: string; id: string; onBack: () => void }) {
  const pick = useCallback((d: { items: ContentItem[] }) => d.items, []);
  const { data } = useBrandData(base, "content", pick as (d: never) => ContentItem[]);
  const item = data?.find((i) => i.id === id);
  const brief = (item?.brief ?? {}) as { goal?: string; audience?: string; keyMessage?: string; products?: string[]; cta?: string; visual?: string; questions?: string[]; angle?: string };
  const b = item?.latest?.body;

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Workspace
        </Button>
        <span className="truncate text-sm text-muted-foreground">/ {item?.title ?? "Post"}</span>
      </div>
      {!item ? (
        <p className="p-6 text-sm text-muted-foreground">{data ? "This post no longer exists." : "Loading…"}</p>
      ) : (
        <div className="flex flex-col gap-6 px-6 py-6">
          <div>
            <p className="text-xs text-muted-foreground">
              {CHANNEL_LABEL[item.channel]} · {item.scheduledFor ? day(item.scheduledFor) : "no date"} · {STATUS_LABEL[item.status] ?? item.status}
              {item.latest ? ` · draft v${item.latest.version}` : ""}
            </p>
            <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">{item.title}</h1>
            {item.opportunity && <p className="mt-1 text-sm text-muted-foreground">From the idea: {item.opportunity.title}</p>}
          </div>

          <section aria-labelledby="brief-h" className="rounded-xl border border-border p-4">
            <h2 id="brief-h" className="text-sm font-semibold">Brief</h2>
            {brief.keyMessage ? (
              <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
                {(
                  [
                    ["Goal", brief.goal],
                    ["Audience", brief.audience],
                    ["Message", brief.keyMessage],
                    ["Products", brief.products?.length ? brief.products.join(", ") : "None named (team to choose)"],
                    ["Ask", brief.cta],
                    ["Visual", brief.visual],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                {brief.questions?.length ? (
                  <div className="contents">
                    <dt className="text-muted-foreground">Questions</dt>
                    <dd>
                      <ul className="list-disc pl-4">{brief.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Angle: {brief.angle ?? "-"}. The Brief writer hasn&rsquo;t written the brief yet.</p>
            )}
          </section>

          <section aria-labelledby="draft-h" className="rounded-xl border border-border p-4">
            <h2 id="draft-h" className="text-sm font-semibold">Draft {item.latest ? `v${item.latest.version}` : ""}</h2>
            {!b ? (
              <p className="mt-2 text-sm text-muted-foreground">No draft yet. The Creator writes it once the brief is ready.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3 text-sm">
                {b.pinTitle && <p className="font-medium">{b.pinTitle}</p>}
                <p className="whitespace-pre-wrap">{b.caption}</p>
                {b.hashtags.length > 0 && <p className="text-muted-foreground">{b.hashtags.join(" ")}</p>}
                {b.slides.length > 0 && (
                  <ol className="grid gap-2 sm:grid-cols-2">
                    {b.slides.map((s, i) => (
                      <li key={i} className="rounded-lg bg-muted px-3 py-2">
                        <span className="text-xs text-muted-foreground">Slide {i + 1}</span>
                        <p>{s}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {b.script.length > 0 && (
                  <ol className="list-decimal pl-5">{b.script.map((s, i) => <li key={i}>{s}</li>)}</ol>
                )}
                {b.altText && <p className="text-xs text-muted-foreground">Alt text: {b.altText}</p>}
              </div>
            )}
          </section>

          {item.latest?.check && (
            <section aria-labelledby="qc-h" className="rounded-xl border border-border p-4">
              <h2 id="qc-h" className="text-sm font-semibold">
                Quality check · {item.latest.check.overall === "PASS" ? "passed" : item.latest.check.overall === "WARN" ? "passed with notes" : "needs fixes"}
              </h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {item.latest.check.results.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    {r.status === "pass" ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Pass" />
                    ) : (
                      <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", r.status === "blocker" ? "text-destructive" : "text-warning")} aria-label={r.status === "blocker" ? "Blocker" : "Warning"} />
                    )}
                    <span>
                      <span className="font-medium">{r.check}: </span>
                      <span className="text-muted-foreground">{r.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {item.status === "AWAITING_APPROVAL" && (
                <p className="mt-3 text-xs text-muted-foreground">Approval and publishing come next: an approver will sign off this exact version.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
