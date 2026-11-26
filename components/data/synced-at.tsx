"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock, LoaderCircle, RefreshCw } from "lucide-react";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { type DataSourceDto } from "@/shared";
import { timeAgo } from "@/lib/time";

/** How often the sources are read again while a run is queued or running. */
const POLL_MS = 5_000;

/** "12:04" today, "25 Nov, 12:04" another day, in the viewer's locale. */
function clockTime(iso: string) {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(undefined, today ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "12:04 – 12:06", or only the end when the start isn't recorded (runs from before it was). */
function runSpan(startedAt: string | null | undefined, at: string) {
  return startedAt ? `${clockTime(startedAt)} – ${clockTime(at)}` : `ended ${clockTime(at)}`;
}

/**
 * Reloads a tab's numbers when one of its sources finishes a run (its lastResult.at moves), not on the first render.
 * useLoad keeps the old numbers on screen while the new ones load, so nothing flashes.
 */
export function useReloadWhenSynced(sources: (DataSourceDto | undefined)[], reload: () => void) {
  const ended = sources.map((s) => s?.lastResult?.at ?? "").join("|");
  const seen = useRef(ended);
  useEffect(() => {
    if (seen.current === ended) return;
    seen.current = ended;
    reload();
  }, [ended, reload]);
}

/**
 * A source's sync state and Sync now. Three states, from the server (`source.sync` comes from the job table):
 * - running: "Syncing… started 12:04", the button off;
 * - queued: "Sync queued, starts 12:05" (Sync now, or a run that stopped partway carrying on), the button off;
 * - idle: "Updated 3 h ago" from the last success, and when the last run started and ended.
 * While queued or running, the sources are read again every 5 s (`onChanged`); when the run ends, "Sync finished"
 * is announced and the tab reloads its numbers (useReloadWhenSynced). Sync now queues a job (POST …/sync):
 * `queued: false` = synced in the last 5 minutes or already queued; 429 = 3 presses this hour (the server says so).
 * `name` tells several sources of one kind apart (two ad accounts). The reason's text is the server's fixed one
 * (`lastResult.error`, shared DATA_SYNC_ERRORS); `reason` only picks the tone and the Connections link.
 */
export function SyncedAt({ source, syncUrl, name, onChanged }: { source: DataSourceDto; syncUrl: string; name?: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const last = source.lastResult;
  const okAt = last?.okAt ?? null;
  const reason = last?.reason ?? null;
  const run = source.sync ?? null;

  // Poll while a run is queued or running; the server's answer ends it.
  useEffect(() => {
    if (!run) return;
    const t = window.setInterval(onChanged, POLL_MS);
    return () => window.clearInterval(t);
  }, [run, onChanged]);

  // A run seen going and now gone: say it finished (the numbers reload through useReloadWhenSynced).
  const wasRunning = useRef(!!run);
  useEffect(() => {
    if (run) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      setNote({ text: reason ? "Sync finished with a problem (below)." : "Sync finished. The numbers are up to date.", error: false });
    }
  }, [run, reason]);

  const sync = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { queued } = await request<{ queued: boolean }>(syncUrl, { method: "POST" });
      if (!queued) setNote({ text: "Synced in the last few minutes, or a sync is already queued.", error: false });
      onChanged(); // picks up the queued run, which starts the polling
    } catch (e) {
      const recently = e instanceof ApiError && e.status === 429;
      setNote({ text: errorMessage(e, "Couldn't start a sync. Try again."), error: !recently });
    } finally {
      setBusy(false);
    }
  };

  const label = name ? `${name}: ` : "";
  let status: React.ReactNode;
  if (run?.state === "running") {
    status = (
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin text-primary" />
        {label}Syncing…{run.since ? ` started ${clockTime(run.since)}` : ""}
      </span>
    );
  } else if (run?.state === "queued") {
    const soon = !run.since || Date.parse(run.since) <= Date.now() + 30_000;
    status = (
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <Clock aria-hidden="true" className="size-4 text-primary" />
        {label}Sync queued, {soon ? "starts in a moment" : `starts ${clockTime(run.since!)}`}
      </span>
    );
  } else {
    status = (
      <span className="text-muted-foreground">
        {label}
        {okAt ? `Updated ${timeAgo(okAt)}` : "Not synced yet"}
        {last?.at ? <span className="whitespace-nowrap"> · last sync {runSpan(last.startedAt, last.at)}</span> : null}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* One live region for the state, so a screen reader hears "Syncing…" and the finish without polling noise. */}
        <span role="status" aria-live="polite">{status}</span>
        <Button size="sm" variant="outline" className="print:hidden" disabled={busy || !!run} onClick={() => void sync()}>
          <RefreshCw aria-hidden="true" />
          {busy ? "Starting…" : run?.state === "running" ? "Syncing…" : run ? "Queued" : "Sync now"}
        </Button>
      </div>
      {reason && last?.error && !run ? (
        <p className={reason === "partial" ? "text-muted-foreground" : "text-warning"}>
          {last.error}{" "}
          {reason === "reconnect" || reason === "permission" ? (
            <Link href="/connections" className="font-medium underline underline-offset-2 print:hidden">
              Open Connections
            </Link>
          ) : null}
        </p>
      ) : null}
      {note ? (
        <p role={note.error ? "alert" : "status"} className={note.error ? "text-xs text-destructive print:hidden" : "text-xs text-muted-foreground print:hidden"}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
