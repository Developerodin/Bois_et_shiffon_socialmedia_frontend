"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Coins, ExternalLink, Loader2, Plus, RotateCw, Trash2 } from "lucide-react";
import { errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { LoadFailed, useBrandData } from "@/components/workspace/content-panels";
import { ScoreRing } from "@/components/workspace/score-ring";
import { readable } from "@/lib/agent-message";
import { blockedAuditNote, PARTIAL_AUDIT_NOTE, readApproach, type Approach } from "@/lib/competitor-audit";
import { cn } from "@/lib/utils";
import { safeHttpUrl } from "@/shared";

type Audit = {
  id: string;
  domain: string;
  url: string;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null; siteChecks: number | null; lcpMs: number | null };
  findings: { id: string; severity: string; title: string; fix: string }[];
  aiCrawlers: { ua: string; purpose: string; allowed: boolean }[];
  // A partial audit's approach may lack any field (search found nothing): read it through readApproach.
  approach: Partial<Approach>;
  socials: { platform: string; url: string }[];
  sources: { url: string; title: string }[];
  pagesRead: number;
  createdAt: string;
  stale: boolean;
  /** The site blocked our crawler: PageSpeed scores and a search-based approach only, no page checks or findings. */
  partial: boolean;
};
type Competitor = {
  id: string;
  name: string;
  domain: string;
  source: string;
  aiMentions: number | null;
  auditRunning: boolean;
  auditError: string | null;
  /** The latest audit failed because the site blocks automated readers; Audit is hidden until auditBlockedUntil (ISO). */
  auditBlocked: boolean;
  auditBlockedUntil: string | null;
  audit: Audit | null;
};
type Data = { credits: { balance: number; auditCost: number }; competitors: Competitor[] };

const checked = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The last audit's failure: a neutral note while the site blocks us (Audit is hidden then), else the error in red. */
function LastFailure({ c, className }: { c: Competitor; className?: string }) {
  if (!c.auditError || c.auditRunning) return null;
  return c.auditBlocked ? (
    <p className={cn("text-muted-foreground", className)}>{blockedAuditNote(c.domain, c.auditBlockedUntil)}</p>
  ) : (
    <p className={cn("text-destructive", className)}>Last audit failed: {readable(c.auditError)}</p>
  );
}

function useCompetitors(base: string) {
  const pick = useCallback((d: Data) => d, []);
  return useBrandData(base, "competitors", pick as (d: never) => Data);
}

/** Run a fresh audit: first click shows the price, second click spends. */
function FreshAudit({ base, c, credits, onDone }: { base: string; c: Competitor; credits: Data["credits"]; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (c.auditRunning)
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Audit running…
      </span>
    );
  // Another try would fail the same way and refund again; the row says when it can be tried (LastFailure).
  if (c.auditBlocked) return null;
  const short = credits.balance < credits.auditCost;
  async function run() {
    setBusy(true);
    setError(null);
    try {
      await request(`${base}/competitors/${encodeURIComponent(c.id)}/audit`, { method: "POST" });
      setConfirm(false);
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the audit."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-col items-end gap-1">
      {confirm ? (
        <span className="flex items-center gap-1.5">
          <Button size="sm" onClick={run} disabled={busy || short}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Coins aria-hidden="true" />} Spend {credits.auditCost} credits
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button size="sm" variant={c.audit ? "ghost" : "secondary"} onClick={() => setConfirm(true)}>
          <RotateCw aria-hidden="true" /> {c.audit ? "Fresh audit" : "Audit"} · {credits.auditCost} credits
        </Button>
      )}
      {confirm && short && <span className="text-xs text-destructive">You have {credits.balance} credits.</span>}
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

/** agents.run gates adding, auditing and removing: the routes refuse those without it. */
export function CompetitorsPanel({ base, canRun, onOpen, onFind }: { base: string; canRun: boolean; onOpen: (id: string) => void; onFind: () => void }) {
  const { data, failed, reload } = useCompetitors(base);
  const [adding, setAdding] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{ id: string; message: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAddPending(true);
    try {
      await request(`${base}/competitors`, { method: "POST", body: JSON.stringify({ name, website: site }) });
      setName("");
      setSite("");
      setAdding(false);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAddPending(false);
    }
  }
  async function remove(c: Competitor) {
    if (!window.confirm(`Stop tracking ${c.name}? Its audits stay in the shared library.`)) return;
    setRemoveError(null);
    try {
      await request(`${base}/competitors/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setRemoveError({ id: c.id, message: errorMessage(err, "Couldn't stop tracking it. Try again.") });
    }
  }

  if (!data) return failed ? <LoadFailed what="competitors" onRetry={() => void reload()} className="p-4" /> : <p className="p-4 text-sm text-muted-foreground">Loading competitors…</p>;
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Coins className="size-3.5" aria-hidden="true" />
          <span className="font-medium text-foreground tabular-nums">{data.credits.balance}</span> credits · audits shared by others are free
        </span>
        <span className="flex gap-1">
          {canRun && (
            <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}>
              <Plus aria-hidden="true" /> Add
            </Button>
          )}
          {canRun && (
            <Button size="sm" variant="ghost" onClick={onFind}>
              Find
            </Button>
          )}
        </span>
      </div>
      {adding && canRun && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-36 rounded-md border border-input bg-card px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Website</span>
            <input required value={site} onChange={(e) => setSite(e.target.value)} placeholder="tikamoon.com" className="h-9 w-44 rounded-md border border-input bg-card px-2 text-sm" />
          </label>
          <Button size="sm" type="submit" disabled={addPending}>{addPending ? "Adding…" : "Add competitor"}</Button>
          {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
        </form>
      )}
      {data.competitors.length === 0 ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted-foreground">No competitors yet. Find them from your GEO report and documents, or add one by hand.</p>
          <Button size="sm" variant="secondary" onClick={onFind}>Find competitors</Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {data.competitors.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => c.audit && onOpen(c.id)} disabled={!c.audit} className="min-w-0 text-left disabled:cursor-default">
                  <span className="block text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">{c.domain}</span>
                </button>
                {canRun && <FreshAudit base={base} c={c} credits={data.credits} onDone={reload} />}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {c.aiMentions != null && <span>Named by AI in {c.aiMentions} of your questions</span>}
                {c.audit ? (
                  <span className={cn(c.audit.stale && "text-warning")}>
                    Last checked {checked(c.audit.createdAt)}
                    {c.audit.stale ? " · may be out of date" : ""}
                  </span>
                ) : (
                  <span>Not audited yet</span>
                )}
                {c.audit?.partial && <span>Page checks unavailable</span>}
                <LastFailure c={c} />
              </div>
              {c.audit && (
                <button type="button" onClick={() => onOpen(c.id)} className="flex flex-wrap gap-3 rounded-lg py-1 text-left hover:bg-muted/50">
                  <ScoreRing value={c.audit.scores.performance} label="Perf." />
                  <ScoreRing value={c.audit.scores.accessibility} label="A11y" />
                  <ScoreRing value={c.audit.scores.bestPractices} label="Best pr." />
                  <ScoreRing value={c.audit.scores.seo} label="SEO" />
                </button>
              )}
              {canRun && (
                <button type="button" onClick={() => remove(c)} className="self-start py-0.5 text-xs text-muted-foreground hover:text-destructive" aria-label={`Stop tracking ${c.name}`}>
                  <Trash2 className="mr-1 inline size-3" aria-hidden="true" />
                  Stop tracking
                </button>
              )}
              {removeError?.id === c.id && <p role="alert" className="text-xs text-destructive">{removeError.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CompetitorView({ base, canRun, id, onLoaded }: { base: string; canRun: boolean; id: string; onLoaded?: () => void }) {
  const { data, failed, reload } = useCompetitors(base);
  const c = data?.competitors.find((x) => x.id === id);
  const found = !!c;
  useEffect(() => {
    if (found) onLoaded?.();
  }, [found, onLoaded]);
  const a = c?.audit;
  const approach = readApproach(a?.approach);
  return (
    <div>
      {!data ? (
        failed ? <LoadFailed what="competitors" onRetry={() => void reload()} className="p-6" /> : <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : !c ? (
        <p className="p-6 text-sm text-muted-foreground">This competitor isn&rsquo;t tracked any more.</p>
      ) : !a ? (
        <div className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-muted-foreground">No audit for this competitor yet.</p>
          <LastFailure c={c} className="text-sm" />
          {canRun && <FreshAudit base={base} c={c} credits={data.credits} onDone={reload} />}
        </div>
      ) : (
        <div className="flex flex-col gap-6 px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-medium tracking-tight">{c.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {(() => {
                  const u = safeHttpUrl(a.url);
                  return u ? (
                    <a href={u.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.domain} <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : (
                    c.domain
                  );
                })()}{" "}
                · last checked {checked(a.createdAt)}
                {a.partial ? "" : ` · ${a.pagesRead} pages read`}
              </p>
              {a.stale && <p className="mt-1 text-xs text-warning">Over 30 days old: run a fresh audit for current numbers.</p>}
            </div>
            {canRun && <FreshAudit base={base} c={c} credits={data.credits} onDone={reload} />}
          </div>
          <LastFailure c={c} className="-mt-3 text-sm" />
          {a.partial && <p className="-mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{PARTIAL_AUDIT_NOTE}</p>}

          <div className="flex flex-wrap gap-5 rounded-xl border border-border p-4">
            <ScoreRing value={a.scores.performance} label="Performance" />
            <ScoreRing value={a.scores.accessibility} label="Accessibility" />
            <ScoreRing value={a.scores.bestPractices} label="Best practices" />
            <ScoreRing value={a.scores.seo} label="SEO" />
            <ScoreRing value={a.scores.siteChecks} label="Site checks" />
          </div>

          <section aria-labelledby="approach-h" className="rounded-xl border border-border p-4">
            <h2 id="approach-h" className="text-sm font-semibold">Their approach</h2>
            <p className="mt-2 text-sm">{approach.positioning || (a.partial ? "Public search results didn’t describe this company." : "")}</p>
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
              {(
                [
                  ["Audience", approach.audience],
                  ["Products", approach.products.join(", ")],
                  ["Prices", approach.priceSignals],
                  ["Content themes", approach.contentThemes.join(", ")],
                  ["Strengths", approach.strengths.join(" · ")],
                  ["Gaps to use", approach.weaknesses.join(" · ")],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v || "-"}</dd>
                </div>
              ))}
              <div className="contents">
                <dt className="text-muted-foreground">Social profiles</dt>
                <dd className="flex flex-wrap gap-2">
                  {a.socials.length
                    ? a.socials.flatMap((s) => {
                        const u = safeHttpUrl(s.url);
                        return u ? [<a key={s.platform} href={u.href} target="_blank" rel="noreferrer" className="capitalize underline-offset-2 hover:underline">{s.platform}</a>] : [];
                      })
                    : a.partial
                      ? "Not checked: the site couldn’t be read"
                      : "None linked from the site"}
                </dd>
              </div>
              <div className="contents">
                <dt className="text-muted-foreground">AI crawlers</dt>
                {/* A partial audit without robots.txt has no crawler list; "All allowed" would be a guess. */}
                <dd>{!a.aiCrawlers.length ? "Not checked" : a.aiCrawlers.filter((x) => !x.allowed).map((x) => x.ua).join(", ") || "All allowed"}{a.aiCrawlers.some((x) => !x.allowed) ? " blocked" : ""}</dd>
              </div>
            </dl>
          </section>

          {a.findings.length > 0 && (
            <section aria-labelledby="cfind-h" className="rounded-xl border border-border p-4">
              <h2 id="cfind-h" className="text-sm font-semibold">Their site issues</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {a.findings.map((f) => (
                  <li key={f.id}>
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{f.severity}</span>
                    {f.title}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
