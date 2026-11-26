"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Coins, ExternalLink, Loader2, MoreHorizontal, Plus, RotateCw, Search, Trash2, X } from "lucide-react";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { LoadFailed, useBrandData } from "@/components/workspace/content-panels";
import { ScoreRing, scoreTone } from "@/components/workspace/score-ring";
import { auditAllSummary, lastFailureNote, PARTIAL_AUDIT_NOTE, planAuditAll, readApproach, rowStatus, type Approach } from "@/lib/competitor-audit";
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
  /** The latest failure was the site blocking us (ISO), even after the block lifted. */
  auditBlockedAt: string | null;
  audit: Audit | null;
};
type Data = { credits: { balance: number; auditCost: number }; competitors: Competitor[] };

const checked = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The last audit's failure: a neutral note when the site blocked us (lastFailureNote), else the error in red. */
function LastFailure({ c, className }: { c: Competitor; className?: string }) {
  const note = c.auditRunning ? null : lastFailureNote(c);
  if (!note) return null;
  return <p className={cn(note.soft ? "text-muted-foreground" : "text-destructive", className)}>{note.text}</p>;
}

function useCompetitors(base: string) {
  const pick = useCallback((d: Data) => d, []);
  return useBrandData(base, "competitors", pick as (d: never) => Data);
}

/** Run a fresh audit: first click shows the price, second click spends. `compact` is the list row's icon form. */
function FreshAudit({ base, c, credits, onDone, compact }: { base: string; c: Competitor; credits: Data["credits"]; onDone: () => void; compact?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In a row the status column already says "auditing…"; the spinner only marks the button's place.
  if (c.auditRunning)
    return compact ? (
      <span className="flex size-9 items-center justify-center text-muted-foreground pointer-coarse:size-11">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Audit running…
      </span>
    );
  // Another try would fail the same way and refund again; the row says when it can be tried (LastFailure).
  if (c.auditBlocked) return null;
  const short = credits.balance < credits.auditCost;
  const label = `${c.audit ? "Fresh audit" : "Audit"} · ${credits.auditCost} credits`;
  async function run() {
    setBusy(true);
    setError(null);
    try {
      await request(`${base}/competitors/${encodeURIComponent(c.id)}/audit`, { method: "POST" });
      setConfirm(false);
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the audit."));
      // The server refused (no credits spent): the site blocked us lately. Reload so the row hides Audit and says when.
      if (e instanceof ApiError && e.code === "audit.siteBlocked") onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className={cn("flex flex-col items-end gap-1", compact && "max-w-56")}>
      {confirm ? (
        <span className="flex items-center gap-1.5">
          <Button size="sm" onClick={run} disabled={busy || short} aria-label={compact ? `Spend ${credits.auditCost} credits auditing ${c.name}` : undefined}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Coins aria-hidden="true" />} Spend {credits.auditCost}
            {compact ? "" : " credits"}
          </Button>
          {compact ? (
            <Button size="icon" variant="ghost" onClick={() => setConfirm(false)} aria-label="Cancel" title="Cancel">
              <X aria-hidden="true" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          )}
        </span>
      ) : compact ? (
        <Button size="icon" variant="ghost" onClick={() => setConfirm(true)} aria-label={`${label}: ${c.name}`} title={label}>
          <RotateCw aria-hidden="true" />
        </Button>
      ) : (
        <Button size="sm" variant={c.audit ? "ghost" : "secondary"} onClick={() => setConfirm(true)}>
          <RotateCw aria-hidden="true" /> {label}
        </Button>
      )}
      {confirm && short && <span className="text-xs text-destructive">You have {credits.balance} credits.</span>}
      {error && <span role="alert" className="text-right text-xs text-destructive">{error}</span>}
    </span>
  );
}

const SCORES = [
  ["performance", "Perf.", "Performance"],
  ["accessibility", "A11y", "Accessibility"],
  ["bestPractices", "Best pr.", "Best practices"],
  ["seo", "SEO", "SEO"],
] as const;

/**
 * The row's columns from 48rem of panel width (a container query, since the assistant panel and the peek change the
 * room): competitor | AI mentions | four scores | checked | actions. Narrower, a row is a two-line card.
 */
const COLS = "@3xl:grid-cols-[minmax(0,1fr)_3.5rem_repeat(4,4.25rem)_6.5rem_5.5rem]";

/** One score as a chip: a dot in the score's colour plus the number; the label shows on the phone card, else in the header. */
function ScoreChip({ value, short, long }: { value: number | null; short: string; long: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs" title={long}>
      <span className={cn("size-2 shrink-0 rounded-full bg-current", scoreTone(value))} aria-hidden="true" />
      <span className="font-semibold tabular-nums text-foreground">{value ?? "–"}</span>
      <span className="text-muted-foreground @3xl:sr-only">
        <span aria-hidden="true">{short}</span>
        <span className="sr-only">{long}</span>
      </span>
    </span>
  );
}

/** Audit all: confirm the price, then start what the credits cover (planAuditAll); the server starts them in that order. */
function AuditAll({ base, data, onDone }: { base: string; data: Data; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = planAuditAll(data.competitors, data.credits);
  const n = plan.candidates.length;
  const k = plan.affordable.length;
  const sites = (count: number) => `${count} ${count === 1 ? "site" : "sites"}`;
  async function run() {
    setBusy(true);
    setError(null);
    try {
      // Only the sites confirmed, in plan order: the server starts them until credits run out (a spend elsewhere meanwhile).
      const r = await request<{ started: string[]; skipped: { id: string; reason: string }[] }>(`${base}/competitors/audit-all`, {
        method: "POST",
        body: JSON.stringify({ competitorIds: plan.affordable.map((c) => c.id) }),
      });
      setOpen(false);
      // The ones left out of the request wait for credits too.
      const skipped = [...r.skipped, ...plan.waiting.map((c) => ({ id: c.id, reason: "credits" }))];
      toast({ title: auditAllSummary({ started: r.started, skipped }), tone: r.started.length ? "success" : "warning" });
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the audits."));
    } finally {
      setBusy(false);
    }
  }
  function onOpenChange(o: boolean) {
    setOpen(o);
    setError(null);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button size="sm" variant="ghost" onClick={() => onOpenChange(true)}>
        <RotateCw aria-hidden="true" /> Audit all
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Audit all</DialogTitle>
          <DialogDescription>
            {n === 0
              ? "Every competitor has a fresh audit, is being audited, or blocks automated readers for now."
              : `Audit ${sites(n)} · ${n} × ${plan.cost} credits (you have ${data.credits.balance}).`}
          </DialogDescription>
        </DialogHeader>
        {n > 0 && (
          <div className="flex flex-col gap-2 text-sm">
            {k === 0 ? (
              <p>Each audit costs {plan.cost} credits. Add credits to audit these sites; nothing starts until then.</p>
            ) : k < n ? (
              <p>
                Your credits cover {sites(k)}. These go first, the ones AI names most before the rest; the other {n - k} wait for credits.
              </p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {plan.candidates.map((c, i) => (
                <li key={c.id} className={cn("flex items-baseline justify-between gap-3", i >= k && "text-muted-foreground")}>
                  <span className="min-w-0 truncate">
                    {c.name} <span className="text-xs text-muted-foreground">{c.domain}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{i >= k ? "waits" : c.audit ? "out of date" : "never audited"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {k === 0 ? "Close" : "Cancel"}
          </Button>
          {k > 0 && (
            <Button onClick={run} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Coins aria-hidden="true" />}
              {k === n ? `Audit ${sites(n)}` : `Audit ${sites(k)} (${k} × ${plan.cost} credits)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Fewer than this many tracked competitors and the list asks for more (Find more). */
const FEW = 3;

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
  const few = data.competitors.length > 0 && data.competitors.length < FEW;
  return (
    <div className="@container flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Coins className="size-3.5" aria-hidden="true" />
          <span className="font-medium text-foreground tabular-nums">{data.credits.balance}</span> credits · audits shared by others are free
        </span>
        {canRun && (
          <span className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              <Plus aria-hidden="true" /> Add
            </Button>
            <Button size="sm" variant="ghost" onClick={onFind} aria-label="Find more competitors">
              <Search aria-hidden="true" /> Find more
            </Button>
            {data.competitors.length > 0 && <AuditAll base={base} data={data} onDone={reload} />}
          </span>
        )}
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
          {canRun && (
            <Button size="sm" variant="secondary" onClick={onFind}>
              <Search aria-hidden="true" /> Find competitors
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Column labels for sighted readers; each chip and cell names itself for screen readers. Sticks as the page scrolls. */}
          <div aria-hidden="true" className={cn("sticky top-0 z-20 hidden gap-x-3 border-b border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground @3xl:grid", COLS)}>
            <span>Competitor</span>
            <span>AI</span>
            {SCORES.map(([key, short]) => (
              <span key={key}>{short}</span>
            ))}
            <span>Checked</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {data.competitors.map((c) => {
              const status = rowStatus(c);
              return (
                <li key={c.id} className={cn("relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-muted/50", COLS)}>
                  {/* The name's button covers the row (after:inset-0), so the whole row opens the peek; the actions sit above it. */}
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="min-w-0 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                  >
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.domain}</span>
                  </button>
                  <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground @3xl:contents">
                    {c.aiMentions != null && (
                      <span className="tabular-nums @3xl:col-start-2 @3xl:row-start-1" title={`Named by AI in ${c.aiMentions} of your questions`}>
                        <span aria-hidden="true">
                          <span className="@3xl:hidden">AI </span>
                          {c.aiMentions}×
                        </span>
                        <span className="sr-only">Named by AI in {c.aiMentions} of your questions</span>
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 @3xl:col-span-4 @3xl:col-start-3 @3xl:row-start-1 @3xl:grid @3xl:grid-cols-subgrid">
                      {status.kind === "scores" ? (
                        <>
                          {SCORES.map(([key, short, long]) => (
                            <ScoreChip key={key} value={c.audit?.scores[key] ?? null} short={short} long={long} />
                          ))}
                          {status.partial && <span className="@3xl:col-span-4">page checks unavailable</span>}
                          {status.note && <span className={cn("line-clamp-2 @3xl:col-span-4", !status.note.soft && "text-destructive")}>{status.note.text}</span>}
                        </>
                      ) : (
                        <span className={cn("@3xl:col-span-4", status.kind === "failed" && "line-clamp-2", status.kind === "failed" && !status.soft && "text-destructive")}>
                          {status.kind === "running" && <Loader2 className="mr-1 inline size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                          {status.text}
                        </span>
                      )}
                    </div>
                    {c.audit && (
                      <span className={cn("@3xl:col-start-7 @3xl:row-start-1", c.audit.stale && "text-warning")}>
                        <span className="@3xl:sr-only">Checked </span>
                        {checked(c.audit.createdAt)}
                        {c.audit.stale && <span className="sr-only"> (may be out of date)</span>}
                      </span>
                    )}
                  </div>
                  {canRun && (
                    <div className="relative z-10 col-start-2 row-start-1 flex items-center justify-end gap-0.5 @3xl:col-start-8">
                      <FreshAudit base={base} c={c} credits={data.credits} onDone={reload} compact />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`More for ${c.name}`} title="More">
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void remove(c)} className="text-destructive focus:text-destructive">
                            <Trash2 aria-hidden="true" /> Stop tracking
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                  {removeError?.id === c.id && (
                    <p role="alert" className="col-span-full text-xs text-destructive">
                      {removeError.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {few && canRun && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">Compare against a few more: the competitors agent finds them from your GEO report and documents.</span>
              <Button size="sm" variant="secondary" onClick={onFind}>
                <Search aria-hidden="true" /> Find more competitors
              </Button>
            </div>
          )}
        </>
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
