"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ArrowLeft, Coins, ExternalLink, Loader2, Plus, RotateCw, Trash2 } from "lucide-react";
import { errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { LoadFailed, useBrandData, usePerms } from "@/components/workspace/content-panels";
import { ScoreRing } from "@/components/workspace/score-ring";
import { readable } from "@/lib/agent-message";
import { cn } from "@/lib/utils";
import { safeHttpUrl } from "@espanda/shared";

type Audit = {
  id: string;
  domain: string;
  url: string;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null; siteChecks: number; lcpMs: number | null };
  findings: { id: string; severity: string; title: string; fix: string }[];
  aiCrawlers: { ua: string; purpose: string; allowed: boolean }[];
  approach: { positioning: string; audience: string; products: string[]; priceSignals: string; contentThemes: string[]; strengths: string[]; weaknesses: string[] };
  socials: { platform: string; url: string }[];
  sources: { url: string; title: string }[];
  pagesRead: number;
  createdAt: string;
  stale: boolean;
};
type Competitor = { id: string; name: string; domain: string; source: string; aiMentions: number | null; auditRunning: boolean; auditError: string | null; audit: Audit | null };
type Data = { credits: { balance: number; auditCost: number }; competitors: Competitor[] };

const checked = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

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
export function CompetitorsPanel({ base, onOpen, onFind }: { base: string; onOpen: (id: string) => void; onFind: () => void }) {
  const canRun = usePerms(base)?.includes("agents.run");
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
                {c.auditError && !c.auditRunning && <span className="text-destructive">Last audit failed: {readable(c.auditError)}</span>}
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

export function CompetitorView({ base, id, onBack }: { base: string; id: string; onBack: () => void }) {
  const canRun = usePerms(base)?.includes("agents.run");
  const { data, failed, reload } = useCompetitors(base);
  const c = data?.competitors.find((x) => x.id === id);
  const a = c?.audit;
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Workspace
        </Button>
        <span className="truncate text-sm text-muted-foreground">/ {c?.name ?? "Competitor"}</span>
      </div>
      {!data ? (
        failed ? <LoadFailed what="competitors" onRetry={() => void reload()} className="p-6" /> : <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : !c ? (
        <p className="p-6 text-sm text-muted-foreground">This competitor isn&rsquo;t tracked any more.</p>
      ) : !a ? (
        <div className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-muted-foreground">No audit for this competitor yet.</p>
          {c.auditError && !c.auditRunning && <p className="text-sm text-destructive">Last audit failed: {readable(c.auditError)}</p>}
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
                · last checked {checked(a.createdAt)} · {a.pagesRead} pages read
              </p>
              {a.stale && <p className="mt-1 text-xs text-warning">Over 30 days old: run a fresh audit for current numbers.</p>}
            </div>
            {canRun && <FreshAudit base={base} c={c} credits={data.credits} onDone={reload} />}
          </div>
          {c.auditError && !c.auditRunning && <p className="-mt-3 text-sm text-destructive">Last audit failed: {readable(c.auditError)}</p>}

          <div className="flex flex-wrap gap-5 rounded-xl border border-border p-4">
            <ScoreRing value={a.scores.performance} label="Performance" />
            <ScoreRing value={a.scores.accessibility} label="Accessibility" />
            <ScoreRing value={a.scores.bestPractices} label="Best practices" />
            <ScoreRing value={a.scores.seo} label="SEO" />
            <ScoreRing value={a.scores.siteChecks} label="Site checks" />
          </div>

          <section aria-labelledby="approach-h" className="rounded-xl border border-border p-4">
            <h2 id="approach-h" className="text-sm font-semibold">Their approach</h2>
            <p className="mt-2 text-sm">{a.approach.positioning}</p>
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
              {(
                [
                  ["Audience", a.approach.audience],
                  ["Products", a.approach.products.join(", ")],
                  ["Prices", a.approach.priceSignals],
                  ["Content themes", a.approach.contentThemes.join(", ")],
                  ["Strengths", a.approach.strengths.join(" · ")],
                  ["Gaps to use", a.approach.weaknesses.join(" · ")],
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
                    : "None linked from the site"}
                </dd>
              </div>
              <div className="contents">
                <dt className="text-muted-foreground">AI crawlers</dt>
                <dd>{a.aiCrawlers.filter((x) => !x.allowed).map((x) => x.ua).join(", ") || "All allowed"}{a.aiCrawlers.some((x) => !x.allowed) ? " blocked" : ""}</dd>
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
