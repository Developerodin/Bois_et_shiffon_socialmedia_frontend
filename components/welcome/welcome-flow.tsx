"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { fetchEvents, type AgentEvent } from "@/components/agents/api";
import {
  createBrand,
  setActiveContext,
  fetchContextDocs,
  ProblemError,
  startResearch,
  type ContextDocsResponse,
} from "@/components/context/api";
import { Button } from "@/components/ui/button";
import { keepPolling, settleCheck, type CheckState } from "@/components/welcome/reading-state";
import { readable } from "@/lib/agent-message";
import { brandNameFromWebsite, normalizeWebsite } from "@espanda/shared";
import { cn } from "@/lib/utils";

const DOCS = ["Product information", "Marketing strategy", "Competitor analysis", "Brand voice", "Content strategy"];
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
    <form onSubmit={onSubmit} noValidate className="mx-auto flex w-full max-w-3xl flex-col">
      <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
        <label htmlFor="website">What&rsquo;s your website?</label>
      </h1>
      <p id="website-help" className="mt-3 max-w-[60ch] text-muted-foreground">
        We read it and write five strategy documents your agents work from: product, marketing strategy, competitors,
        brand voice and content. We also score it for SEO and AI search. It takes a few minutes.
      </p>

      <div className="group mt-12">
        <div className="flex items-baseline gap-3">
          <span aria-hidden="true" className="shrink-0 font-mono text-sm text-muted-foreground sm:text-base">
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
              "min-w-0 flex-1 bg-transparent font-display font-medium tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40",
              address.length > 22 ? "text-2xl sm:text-4xl" : address.length > 14 ? "text-3xl sm:text-5xl" : "text-4xl sm:text-6xl",
            )}
          />
        </div>
        {/* The brass baseline: hairline at rest, full brass rule while focused. */}
        <div className="relative mt-3 h-0.5 bg-border">
          <div className="absolute inset-0 origin-left scale-x-0 bg-primary transition-transform duration-300 ease-out group-focus-within:scale-x-100 motion-reduce:transition-none" />
        </div>
        <p id="website-error" role="alert" className="mt-3 min-h-5 text-sm text-destructive">
          {error}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-1.5 text-sm sm:w-72">
          <span className="text-muted-foreground">Brand name</span>
          <input
            value={brandName}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
            placeholder="Filled in from your website"
            maxLength={80}
            className="h-10 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <Button type="submit" size="lg" disabled={pending} className="self-start sm:self-auto">
          {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {pending ? "Starting…" : "Read my website"}
          {pending ? null : <ArrowRight aria-hidden="true" />}
        </Button>
      </div>

      <p className="mt-16 text-xs text-muted-foreground">
        We read up to 8 public pages and follow your site&rsquo;s robots.txt. Nothing is posted anywhere.
      </p>
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
  const [checks, setChecks] = useState<Record<string, CheckState>>({ seo: "waiting", geo: "waiting" });
  // Polls in a row where the brand's research run wasn't this one, and polls in a row that failed.
  const [misses, setMisses] = useState(0);
  const [fails, setFails] = useState(0);
  const cursor = useRef<string | null>(null);
  const logEnd = useRef<HTMLLIElement>(null);

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
        const mine = ev.events.filter((e) => e.runId === runId);
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
    logEnd.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  // A doc counts for this run when its latest version is newer than the run's first log line.
  const runStart = events[0] ? new Date(events[0].createdAt).getTime() - 1000 : startedAt - 60_000;
  const docStates: DocState[] = useMemo(() => {
    const drafted = DOCS.map((title) => {
      const entry = docs?.docs.find((d) => d.title === title);
      return !!entry?.latest && new Date(entry.latest.createdAt).getTime() >= runStart;
    });
    const firstOpen = drafted.indexOf(false);
    return drafted.map((d, i) => (d ? "drafted" : status === "RUNNING" && i === firstOpen ? "drafting" : "waiting"));
  }, [docs, runStart, status]);

  const failure = [...events].reverse().find((e) => e.level === "ERROR");
  const host = new URL(website).hostname.replace(/^www\./, "");

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const { run } = await startResearch(workspaceId, brandId);
      onRetry(run.id);
    } catch (err) {
      setRetryError(err instanceof ProblemError ? err.message : "Couldn't restart. Check your connection and try again.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <h1 className="font-display text-4xl font-medium tracking-tight break-all sm:text-5xl">{host}</h1>
        <p aria-live="polite" className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          {active ? <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" /> : null}
          {statusLabel({ mismatch, status, polling, unreachable: fails >= 3, started: events.length > 0 })}
          {active ? ` · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : null}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="log-heading" className="min-w-0">
          <h2 id="log-heading" className="text-sm font-medium text-muted-foreground">
            What the agent is doing
          </h2>
          <ol className="mt-4 flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto text-sm leading-relaxed">
            {events.length === 0 && <li className="text-muted-foreground">Waiting for the first page…</li>}
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <time className="shrink-0 tabular-nums text-muted-foreground/70" dateTime={e.createdAt}>
                  {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
                <span
                  className={cn(
                    "min-w-0 break-words",
                    e.level === "ERROR" && "text-destructive",
                    e.level === "WARN" && "text-warning",
                    e.level === "SUCCESS" && "text-success",
                  )}
                >
                  {readable(e.message)}
                </span>
              </li>
            ))}
            <li ref={logEnd} aria-hidden="true" />
          </ol>
        </section>

        <section aria-labelledby="docs-heading">
          <h2 id="docs-heading" className="text-sm font-medium text-muted-foreground">
            Your strategy documents
          </h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {DOCS.map((title, i) => (
              <li key={title} className="flex items-center justify-between gap-4 py-3.5">
                <span className={cn("text-base", docStates[i] === "waiting" && "text-muted-foreground")}>{title}</span>
                <DocStatus state={docStates[i]} />
              </li>
            ))}
          </ul>

          <h2 id="checks-heading" className="mt-8 text-sm font-medium text-muted-foreground">
            Site scores
          </h2>
          <ul aria-labelledby="checks-heading" className="mt-4 divide-y divide-border border-y border-border">
            {CHECKS.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-4 py-3.5">
                <span className={cn("text-base", shown[c.key] === "waiting" && "text-muted-foreground")}>{c.title}</span>
                <CheckStatus state={shown[c.key]} />
              </li>
            ))}
          </ul>
        </section>
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
                {retrying ? "Starting…" : "Read it again"}
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
              {retrying ? "Restarting…" : "Try again"}
            </Button>
          </div>
        </div>
      )}
    </div>
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
