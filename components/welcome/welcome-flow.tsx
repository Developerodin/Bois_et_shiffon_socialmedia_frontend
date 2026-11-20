"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  EyeOff,
  FileSearch,
  Gauge,
  LayoutGrid,
  Loader2,
  Package,
  Quote,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { fetchEvents, type AgentEvent } from "@/components/agents/api";
import {
  createBrand,
  setActiveContext,
  fetchContextDocs,
  ProblemError,
  startResearch,
  type ContextDocsResponse,
} from "@/components/context/api";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { keepPolling, settleCheck, type CheckState } from "@/components/welcome/reading-state";
import { readable } from "@/lib/agent-message";
import { brandNameFromWebsite, normalizeWebsite } from "@/shared";
import { loadPlanCredits, withPrice } from "@/lib/plan-credits";
import { plainSummary } from "@/lib/plain-summary";
import { clock } from "@/lib/time";
import { cn } from "@/lib/utils";
import { isRunCancelled } from "@/components/languages/languages";

/** The five documents Research writes (titles match the server's), with what each holds (its GUIDANCE, in short). */
const DOC_META: { title: string; does: string; icon: LucideIcon }[] = [
  { title: "Product information", does: "What you sell, materials, prices and services", icon: Package },
  { title: "Marketing strategy", does: "Positioning, customers and what sets you apart", icon: Target },
  { title: "Competitor analysis", does: "Who else sells to your customers, with sources", icon: Users },
  { title: "Brand voice", does: "How you sound, and the words to use and avoid", icon: Quote },
  { title: "Content strategy", does: "Content pillars, formats and a posting mix", icon: LayoutGrid },
];
const DOCS = DOC_META.map((d) => d.title);
const SCORES = { title: "SEO and AI search scores", does: "How easily Google and AI assistants find you", icon: Gauge };
const POLL_MS = 2000;
/** Past this, offer a way out; the agent keeps reading in the background. */
const SLOW_AFTER_S = 5 * 60;

type Props = {
  workspaceId: string;
  canCreate: boolean;
  /** Resume a reading already in progress (from ?brand=…&run=…). */
  resume: { brandId: string; runId: string; website: string } | null;
};

export function WelcomeFlow({ workspaceId, canCreate, resume }: Props) {
  const [reading, setReading] = useState(resume);
  return reading ? (
    // Keyed by run: a retry starts the screen afresh (clock, log, checks, documents).
    <ReadingRoom key={reading.runId} workspaceId={workspaceId} {...reading} onRetry={(runId) => {
        // Keep the URL on the run being shown, so a refresh doesn't fall back to the old one.
        const q = new URLSearchParams(window.location.search);
        q.set("run", runId);
        window.history.replaceState(window.history.state, "", `?${q}`);
        setReading({ ...reading, runId });
      }} />
  ) : (
    <AddressStep workspaceId={workspaceId} canCreate={canCreate} onStarted={setReading} />
  );
}

function AddressStep({
  workspaceId,
  canCreate,
  onStarted,
}: {
  workspaceId: string;
  canCreate: boolean;
  onStarted: (r: { brandId: string; runId: string; website: string }) => void;
}) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Brand created by an earlier attempt: a retry after a later step failed must not create a second one.
  const created = useRef<{ brandId: string; runId: string; website: string } | null>(null);

  const website = normalizeWebsite(address);
  const suggestedName = website ? brandNameFromWebsite(website) : "";
  const brandName = nameTouched ? name : suggestedName;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!website) return setError("Enter your website address, like boisetchiffons.fr.");
    if (!brandName.trim()) return setError("Add your brand name.");
    setPending(true);
    setError(null);
    try {
      if (!created.current) {
        const { brand, researchRunId } = await createBrand(workspaceId, { displayName: brandName.trim(), websiteUrl: website });
        created.current = { brandId: brand.id, runId: researchRunId, website };
      }
      const started = created.current;
      await setActiveContext({ workspaceId, brandId: started.brandId });
      router.replace(`/welcome?${new URLSearchParams({ brand: started.brandId, run: started.runId, site: started.website })}`);
      onStarted(started);
    } catch (err) {
      setError(
        err instanceof ProblemError && err.status === 422
          ? err.message || "That website address doesn't look right."
          : err instanceof ProblemError && err.status === 403
            ? "Your role can't add brands. Ask a workspace owner or admin."
            : err instanceof ProblemError
              ? err.message // e.g. 429 "You've added 10 brands today…"
              : "Couldn't start reading your website. Check your connection and try again.",
      );
      setPending(false);
    }
  }

  if (!canCreate) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">No brand here yet.</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Your role can see brands but not add them. Ask a workspace owner or admin to add your brand&rsquo;s website,
          and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mx-auto grid w-full max-w-6xl gap-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-20"
    >
      <div className="flex min-w-0 flex-col">
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
          <label htmlFor="website">What&rsquo;s your website?</label>
        </h1>
        <p id="website-help" className="mt-3 max-w-[52ch] text-muted-foreground">
          We read it and draft the strategy your agents work from, then score it for SEO and AI search. It takes a few
          minutes.
        </p>

        <div className="group mt-12">
          <div className="flex items-baseline gap-2">
            <span aria-hidden="true" className="shrink-0 text-lg text-muted-foreground sm:text-2xl">
              https://
            </span>
            <input
              id="website"
              name="website"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              placeholder="yourbrand.com"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value.replace(/^https?:\/\//i, ""));
                setError(null);
              }}
              aria-describedby="website-help website-error"
              aria-invalid={!!error}
              className={cn(
                "min-w-0 flex-1 bg-transparent font-display font-medium tracking-tight text-foreground outline-none placeholder:text-muted-foreground",
                address.length > 22 ? "text-2xl sm:text-4xl" : address.length > 14 ? "text-3xl sm:text-5xl" : "text-4xl sm:text-6xl",
              )}
            />
          </div>
          {/* The accent baseline: hairline at rest, full accent rule while focused. */}
          <div className="relative mt-3 h-0.5 bg-border">
            <div className="absolute inset-0 origin-left scale-x-0 bg-primary transition-transform duration-300 ease-out group-focus-within:scale-x-100 motion-reduce:transition-none" />
          </div>
          <div className="mt-3 min-h-5 text-sm">
            <p id="website-error" role="alert" className="text-destructive">
              {error}
            </p>
            {!error && website && (
              <p className="rise-in text-muted-foreground">
                We&rsquo;ll start at <span className="font-medium text-foreground">{website.replace(/^https?:\/\//, "")}</span>
              </p>
            )}
          </div>
        </div>

        <label htmlFor="brand-name" className="mt-4 text-sm font-medium">
          Brand name
        </label>
        {/* The name sits beside the button it goes with, so the eye doesn't cross an empty gap to find the action. */}
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            id="brand-name"
            value={brandName}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
            placeholder="Your brand"
            maxLength={80}
            autoComplete="organization"
            aria-describedby="brand-help"
            className="h-11 rounded-full border border-input bg-card px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-72"
          />
          <Button type="submit" size="lg" disabled={pending} className="self-start sm:self-auto">
            {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {pending ? "Starting…" : "Read my website"}
            {pending ? null : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
        <p id="brand-help" className="mt-2 text-sm text-muted-foreground">
          Filled in from your website. Change it if it&rsquo;s not right.
        </p>
        <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <FileSearch className="size-4" aria-hidden="true" /> Up to 8 public pages
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden="true" /> Follows your robots.txt
          </li>
          <li className="flex items-center gap-2">
            <EyeOff className="size-4" aria-hidden="true" /> Nothing is posted
          </li>
        </ul>
      </div>

      {/* The same list the next screen fills in as each document is drafted. */}
      <section aria-labelledby="outcome-heading" className="min-w-0 lg:pt-1.5">
        <h2 id="outcome-heading" className="text-sm font-medium text-muted-foreground">
          What you&rsquo;ll get
        </h2>
        <ul className="mt-4 flex flex-col gap-4">
          {[...DOC_META, SCORES].map((d, i) => (
            <li key={d.title} className="rise-in flex items-start gap-3" style={{ animationDelay: `${i * 40}ms` }}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent" aria-hidden="true">
                <d.icon className="size-4 text-accent-foreground" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{d.title}</span>
                <span className="block text-sm text-muted-foreground">{d.does}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">Agents use them straight away. Review them when you can.</p>
      </section>
    </form>
  );
}

type DocState = "waiting" | "drafting" | "drafted";

function ReadingRoom({
  workspaceId,
  brandId,
  runId,
  website,
  onRetry,
}: {
  workspaceId: string;
  brandId: string;
  runId: string;
  website: string;
  onRetry: (runId: string) => void;
}) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [docs, setDocs] = useState<ContextDocsResponse | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryPrice = useRunPrice(workspaceId, "research");
  const [checks, setChecks] = useState<Record<string, CheckState>>({ seo: "waiting", geo: "waiting" });
  // Polls in a row where the brand's research run wasn't this one, and polls in a row that failed.
  const [misses, setMisses] = useState(0);
  const [fails, setFails] = useState(0);
  const cursor = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // Follow the newest line only while the reader is already at the bottom (as agent-log does).
  const stickToBottom = useRef(true);

  // The brand's research run isn't the one in the URL (an old link, or someone started another reading).
  // Two polls in a row, so one odd response doesn't stop the screen.
  const mismatch = misses >= 2;
  const status = docs?.research?.runId === runId ? docs.research.status : "QUEUED";
  const finished = status === "SUCCEEDED" || status === "FAILED";
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));
  // A brand with no website never logs site checks: once research is done, give them a short grace, not 10 minutes.
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  useEffect(() => {
    if (finished && finishedAt === null) setFinishedAt(Date.now());
  }, [finished, finishedAt]);
  const sinceFinished = finishedAt === null ? 0 : Math.max(0, Math.round((now - finishedAt) / 1000));
  const shown = Object.fromEntries(CHECKS.map((c) => [c.key, settleCheck(checks[c.key], elapsed, sinceFinished)]));
  const polling = !mismatch && keepPolling({ finished, checks: CHECKS.map((c) => shown[c.key]), elapsedS: elapsed });
  const active = !finished && polling;

  useEffect(() => {
    if (!polling) return;
    const ctrl = new AbortController();
    const tick = async () => {
      try {
        const [ev, d] = await Promise.all([
          fetchEvents(workspaceId, brandId, cursor.current, ctrl.signal),
          fetchContextDocs(workspaceId, brandId, ctrl.signal),
        ]);
        if (ev.events.length) cursor.current = ev.events[ev.events.length - 1].id;
        // This reading's own lines, plus the site checks' (they run beside it under their own runs).
        const mine = ev.events.filter((e) => e.runId === runId || e.agentKey in CHECK_KEYS);
        // Overlapping ticks (slow fetch, dev double-effect) can return the same events twice.
        if (mine.length) setEvents((prev) => [...prev, ...mine.filter((e) => !prev.some((p) => p.id === e.id))]);
        const site = ev.events.filter((e) => e.agentKey in CHECK_KEYS);
        if (site.length) {
          setChecks((prev) => {
            const next = { ...prev };
            for (const e of site) next[e.agentKey] = e.level === "SUCCESS" ? "done" : e.level === "ERROR" ? "failed" : "running";
            return next;
          });
        }
        setDocs(d);
        setMisses((m) => (d.research?.runId === runId ? 0 : m + 1));
        setFails(0);
      } catch {
        // Network error: the next tick tries again; a few in a row say so on screen.
        if (!ctrl.signal.aborted) setFails((n) => n + 1);
      }
    };
    void tick();
    const timer = setInterval(() => {
      setNow(Date.now());
      void tick();
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      ctrl.abort();
    };
  }, [workspaceId, brandId, runId, polling]);

  useEffect(() => {
    // Scrolls the list itself (moving the element into view also moved the page). One layout read per batch of lines, not per line.
    if (!stickToBottom.current) return;
    const id = requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [events.length]);

  function onLogScroll() {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  // A doc counts for this run when its latest version is newer than the run's first log line.
  const firstOwn = events.find((e) => e.runId === runId);
  const runStart = firstOwn ? new Date(firstOwn.createdAt).getTime() - 1000 : startedAt - 60_000;
  // Site-check lines from an earlier reading of this brand stay out.
  const feed = useMemo(
    () =>
      events
        .filter((e) => e.runId === runId || new Date(e.createdAt).getTime() >= runStart)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [events, runId, runStart],
  );
  const own = useMemo(() => feed.filter((e) => e.runId === runId), [feed, runId]);
  // Research writes the five in parallel ("Drafting <title>" for each), so several can be drafting at once.
  const docStates: DocState[] = useMemo(
    () =>
      DOCS.map((title) => {
        const entry = docs?.docs.find((d) => d.title === title);
        if (entry?.latest && new Date(entry.latest.createdAt).getTime() >= runStart) return "drafted";
        return !finished && own.some((e) => e.message === `Drafting ${title}`) ? "drafting" : "waiting";
      }),
    [docs, runStart, finished, own],
  );
  const pagesRead = own.filter((e) => e.level === "INFO" && /^Read /.test(e.message)).length;
  // Reading is over once Research says how many pages it read (or found), or starts drafting.
  const readDone =
    status === "SUCCEEDED" || own.some((e) => /^(Read|Found) \d+ page|^Couldn't find/.test(e.message)) || docStates.some((s) => s !== "waiting");
  const drafted = docStates.filter((s) => s === "drafted").length;
  // A finished check's score, from its last line ("SEO report ready — 84/100, …"). Shown as reported, never estimated.
  const scores = Object.fromEntries(
    CHECKS.map((c) => {
      const line = [...feed].reverse().find((e) => e.agentKey === c.key && e.level === "SUCCESS" && /\d{1,3}\/100/.test(e.message));
      return [c.key, line ? Number(line.message.match(/(\d{1,3})\/100/)![1]) : null];
    }),
  );
  const scored = CHECKS.filter((c) => shown[c.key] === "done" || shown[c.key] === "failed").length;
  const progress = ((readDone ? 1 : 0) + drafted + scored) / (1 + DOCS.length + CHECKS.length);

  const failure = [...own].reverse().find((e) => e.level === "ERROR");
  const siteHost = new URL(website).host;
  const host = siteHost.replace(/^www\./, "");

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const { run } = await startResearch(workspaceId, brandId);
      onRetry(run.id);
      void loadPlanCredits(workspaceId, true);
    } catch (err) {
      if (!isRunCancelled(err)) setRetryError(err instanceof ProblemError ? err.message : "Couldn't restart. Check your connection and try again.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <SiteIcon host={siteHost} letter={host[0]} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-medium tracking-tight break-all sm:text-4xl">{host}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <p aria-live="polite" className="flex items-center gap-2">
                {active ? <span className="status-pulse size-2 rounded-full bg-primary" aria-hidden="true" /> : null}
                {status === "SUCCEEDED" ? <Check className="size-4 text-success" aria-hidden="true" /> : null}
                {statusLabel({ mismatch, status, polling, unreachable: fails >= 3, started: events.length > 0 })}
              </p>
              {active ? <ElapsedClock elapsed={elapsed} /> : null}
            </div>
          </div>
        </div>

        {/* Real steps only: the site read, each document drafted, each score settled. Nothing is estimated. */}
        <div>
          <div
            role="progressbar"
            aria-label="Reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full origin-left rounded-full bg-primary transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${Math.max(progress, active ? 0.02 : 0)})` }}
            />
          </div>
          <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <Track
              label="Read your site"
              state={readDone ? "done" : active ? "active" : "waiting"}
              detail={pagesRead ? `${pagesRead} ${pagesRead === 1 ? "page" : "pages"} read` : readDone ? "Read" : "Opening pages"}
            />
            <Track
              label="Draft your strategy"
              state={drafted === DOCS.length ? "done" : readDone && active ? "active" : "waiting"}
              detail={`${drafted} of ${DOCS.length} drafted`}
            />
            <Track
              label="Score it for search"
              state={scored === CHECKS.length ? "done" : CHECKS.some((c) => shown[c.key] === "running") ? "active" : "waiting"}
              detail={`${scored} of ${CHECKS.length} scored`}
            />
          </ol>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="log-heading" className="min-w-0 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
          <h2 id="log-heading" className="flex items-center gap-2 text-sm font-semibold">
            Live from the agents
            {active && <span className="status-pulse size-1.5 rounded-full bg-primary" aria-hidden="true" />}
          </h2>
          <ol
            ref={listRef}
            onScroll={onLogScroll}
            className="mt-3 flex max-h-[30rem] flex-col gap-2 overflow-y-auto text-sm leading-relaxed"
          >
            {feed.length === 0 && (
              <li className="text-muted-foreground">
                <span className={cn(active && "typing-cursor")}>Opening {host}</span>
              </li>
            )}
            {feed.map((e, i) => (
              <li key={e.id} className="log-line-in flex gap-3">
                <time className="w-16 shrink-0 font-mono text-xs leading-6 tabular-nums text-muted-foreground" dateTime={e.createdAt}>
                  {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
                <span className="mt-0.5 h-5 w-14 shrink-0 rounded-md bg-muted text-center font-mono text-[11px] leading-5 text-muted-foreground">
                  {AGENT_TAG[e.agentKey] ?? e.agentKey}
                </span>
                <span
                  className={cn(
                    "min-w-0 break-words",
                    e.level === "ERROR" && "text-destructive",
                    e.level === "WARN" && "text-warning-ink",
                    e.level === "SUCCESS" && "text-success-ink",
                    active && i === feed.length - 1 && "typing-cursor",
                  )}
                >
                  {readable(e.message)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="docs-heading" className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
            <h2 id="docs-heading" className="text-sm font-semibold">
              Your strategy documents
            </h2>
            <ul className="mt-3 flex flex-col gap-4">
              {DOC_META.map((d, i) => {
                const state = docStates[i];
                const summary = state === "drafted" ? plainSummary(docs?.docs.find((x) => x.title === d.title)?.latest?.markdown) : null;
                return (
                  <li key={d.title} className="flex items-start gap-3">
                    <span
                      className={cn("grid size-8 shrink-0 place-items-center rounded-lg", state === "waiting" ? "bg-muted" : "bg-accent")}
                      aria-hidden="true"
                    >
                      <d.icon className={cn("size-4", state === "waiting" ? "text-muted-foreground" : "text-accent-foreground")} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className={cn("text-sm font-medium", state === "waiting" && "text-muted-foreground")}>{d.title}</span>
                        <DocStatus state={state} />
                      </div>
                      {state === "drafting" && (
                        <div className="mt-2 flex flex-col gap-1.5" aria-hidden="true">
                          <span className="h-2 w-full rounded-full bg-muted motion-safe:animate-pulse" />
                          <span className="h-2 w-2/3 rounded-full bg-muted motion-safe:animate-pulse" />
                        </div>
                      )}
                      {summary && <p className="rise-in mt-1 line-clamp-2 text-sm text-muted-foreground">{summary}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="checks-heading" className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
            <h2 id="checks-heading" className="text-sm font-semibold">
              Site scores
            </h2>
            <ul className="mt-3 flex flex-col gap-4">
              {CHECKS.map((c) => {
                const score = shown[c.key] === "done" ? scores[c.key] : null;
                return (
                  <li key={c.key}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn("text-sm font-medium", shown[c.key] === "waiting" && "text-muted-foreground")}>{c.title}</span>
                      {score !== null ? (
                        <span className="rise-in font-mono text-sm tabular-nums">
                          <span className="text-base font-semibold">{score}</span>
                          <span className="text-muted-foreground">/100</span>
                        </span>
                      ) : (
                        <CheckStatus state={shown[c.key]} />
                      )}
                    </div>
                    {score !== null && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className="grow-x h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      {status === "SUCCEEDED" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[60ch]">
            Your five documents are ready and agents are already using them. Fix anything that&rsquo;s off; edits apply on the next run.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/context">See documents</Link>
            </Button>
            <Button asChild size="lg">
              <Link href="/">
                Go to workspace <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      )}
      {mismatch && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="max-w-[60ch]">
            {retryError ??
              (docs?.research
                ? "This link is for an earlier reading of your website. A newer one has started since."
                : "We couldn’t find this reading of your website. Read it again, or go to your workspace.")}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/">Go to workspace</Link>
            </Button>
            {docs?.research ? (
              <Button onClick={() => onRetry(docs.research!.runId)}>Follow the latest reading</Button>
            ) : (
              <Button onClick={retry} disabled={retrying}>
                {retrying ? "Starting…" : withPrice("Read it again", retryPrice)}
              </Button>
            )}
          </div>
        </div>
      )}
      {!mismatch && !finished && elapsed >= SLOW_AFTER_S && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[60ch]">
            This is taking longer than usual. You don&rsquo;t need to wait here: reading carries on, and the drafts appear
            in Context as they&rsquo;re ready.
          </p>
          <Button variant="outline" asChild>
            <Link href="/context">Go to Context</Link>
          </Button>
        </div>
      )}
      {status === "FAILED" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="max-w-[60ch]">
            {retryError ?? <>Reading stopped{failure ? `: ${readable(failure.message)}` : "."} Documents already drafted are kept.</>}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/context">See what was drafted</Link>
            </Button>
            <Button onClick={retry} disabled={retrying}>
              {retrying ? "Restarting…" : withPrice("Try again", retryPrice)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const AGENT_TAG: Record<string, string> = { research: "Research", seo: "SEO", geo: "GEO" };

// The 2 s clock sits outside the aria-live status so it is not re-announced on every tick.
function ElapsedClock({ elapsed }: { elapsed: number }) {
  return (
    <span aria-hidden="true" className="font-mono tabular-nums">
      · {clock(elapsed)}
    </span>
  );
}

/** The site's own favicon; its first letter when the site has none or blocks it. */
function SiteIcon({ host, letter }: { host: string; letter: string | undefined }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-hidden="true">
      {failed ? (
        <span className="font-display text-xl font-medium">{letter?.toUpperCase()}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- any site's favicon, unknown size and host
        <img src={`https://${host}/favicon.ico`} alt="" className="size-6 object-contain" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

function Track({ label, detail, state }: { label: string; detail: string; state: "waiting" | "active" | "done" }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full border",
          state === "done" && "border-success bg-success text-card",
          state === "active" && "border-primary",
          state === "waiting" && "border-border",
        )}
        aria-hidden="true"
      >
        {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <span className="status-pulse size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0">
        <span className={cn("block font-medium", state === "waiting" && "text-muted-foreground")}>{label}</span>
        <span className="block text-xs text-muted-foreground">
          <span className="sr-only">{state === "done" ? "Done. " : state === "active" ? "In progress. " : "Not started. "}</span>
          {detail}
        </span>
      </span>
    </li>
  );
}

function statusLabel(r: { mismatch: boolean; status: string; polling: boolean; unreachable: boolean; started: boolean }) {
  if (r.mismatch) return "Not found";
  if (r.status === "SUCCEEDED") return "Read";
  if (r.status === "FAILED") return "Stopped";
  if (!r.polling) return "Still reading in the background";
  if (r.unreachable) return "Can’t reach the server. Retrying.";
  if (r.status === "RUNNING") return "Reading";
  return r.started ? "Waiting to retry" : "Starting";
}

function DocStatus({ state }: { state: DocState }) {
  if (state === "drafted") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-success">
        <Check className="size-4" aria-hidden="true" /> Drafted
      </span>
    );
  }
  if (state === "drafting") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-primary">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Drafting
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">Waiting</span>;
}

/** SEO and GEO start with Research when a brand is created (server/services/create-brand.ts). */
const CHECKS = [
  { key: "seo", title: "SEO audit" },
  { key: "geo", title: "AI search visibility (GEO)" },
];
const CHECK_KEYS = Object.fromEntries(CHECKS.map((c) => [c.key, true]));

function CheckStatus({ state }: { state: CheckState }) {
  if (state === "done") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-success">
        <Check className="size-4" aria-hidden="true" /> Done
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-primary">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Checking
      </span>
    );
  }
  if (state === "failed") return <span className="text-sm text-destructive">Stopped</span>;
  if (state === "late") return <span className="text-sm text-muted-foreground">Still running. Check Analytics later.</span>;
  return <span className="text-sm text-muted-foreground">Waiting</span>;
}
