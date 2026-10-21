"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { setActiveBrand } from "@/app/(shell)/actions/shell-context";
import { fetchEvents, type AgentEvent } from "@/components/agents/api";
import {
  createBrand,
  fetchContextDocs,
  ProblemError,
  startResearch,
  type ContextDocsResponse,
} from "@/components/context/api";
import { Button } from "@/components/ui/button";
import { readable } from "@/lib/agent-message";
import { brandNameFromWebsite, normalizeWebsite } from "@/lib/website";
import { cn } from "@/lib/utils";

const DOCS = ["Product information", "Marketing strategy", "Competitor analysis", "Brand voice", "Content strategy"];
const POLL_MS = 2000;

type Props = {
  workspaceId: string;
  canCreate: boolean;
  /** Resume a reading already in progress (from ?brand=…&run=…). */
  resume: { brandId: string; runId: string; website: string } | null;
};

export function WelcomeFlow({ workspaceId, canCreate, resume }: Props) {
  const [reading, setReading] = useState(resume);
  return reading ? (
    <ReadingRoom workspaceId={workspaceId} {...reading} onRetry={(runId) => setReading({ ...reading, runId })} />
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
      const { brand, researchRunId } = await createBrand(workspaceId, { displayName: brandName.trim(), websiteUrl: website });
      await setActiveBrand(workspaceId, brand.id);
      router.replace(`/welcome?${new URLSearchParams({ brand: brand.id, run: researchRunId, site: website })}`);
      onStarted({ brandId: brand.id, runId: researchRunId, website });
    } catch (err) {
      setError(
        err instanceof ProblemError && err.status === 422
          ? err.message || "That website address doesn't look right."
          : err instanceof ProblemError && err.status === 403
            ? "Your role can't add brands. Ask a workspace owner or admin."
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
        We read it and draft five strategy documents for you to check: product, marketing strategy, competitors,
        brand voice and content. It takes about two minutes.
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
  const cursor = useRef<string | null>(null);
  const logEnd = useRef<HTMLLIElement>(null);

  const status = docs?.research?.runId === runId ? docs.research.status : "QUEUED";
  const finished = status === "SUCCEEDED" || status === "FAILED";

  useEffect(() => {
    cursor.current = null;
    setEvents([]);
  }, [runId]);

  useEffect(() => {
    if (finished) return;
    const ctrl = new AbortController();
    const tick = async () => {
      try {
        const [ev, d] = await Promise.all([
          fetchEvents(workspaceId, brandId, cursor.current, ctrl.signal),
          fetchContextDocs(workspaceId, brandId, ctrl.signal),
        ]);
        if (ev.events.length) cursor.current = ev.events[ev.events.length - 1].id;
        const mine = ev.events.filter((e) => e.runId === runId);
        if (mine.length) setEvents((prev) => [...prev, ...mine]);
        setDocs(d);
      } catch {
        // Transient network error: the next tick tries again.
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
  }, [workspaceId, brandId, runId, finished]);

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

  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));
  const failure = [...events].reverse().find((e) => e.level === "ERROR");
  const host = new URL(website).hostname.replace(/^www\./, "");

  async function retry() {
    setRetrying(true);
    try {
      const { run } = await startResearch(workspaceId, brandId);
      onRetry(run.id);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <h1 className="font-display text-4xl font-medium tracking-tight break-all sm:text-5xl">{host}</h1>
        <p aria-live="polite" className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          {finished ? null : <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />}
          {status === "SUCCEEDED" ? "Read" : status === "FAILED" ? "Stopped" : status === "RUNNING" ? "Reading" : events.length ? "Waiting to retry" : "Starting"}
          {finished ? null : ` · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="log-heading" className="min-w-0">
          <h2 id="log-heading" className="text-sm font-medium text-muted-foreground">
            What the agent is doing
          </h2>
          <ol className="mt-4 flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto font-mono text-[13px] leading-relaxed">
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
        </section>
      </div>

      {status === "SUCCEEDED" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[60ch]">
            Your five drafts are ready. Check each one and confirm it; agents only use confirmed documents.
          </p>
          <Button asChild size="lg">
            <Link href="/context">
              Review documents <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
      {status === "FAILED" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="max-w-[60ch]">
            Reading stopped{failure ? `: ${readable(failure.message)}` : "."} Documents already drafted are kept.
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
