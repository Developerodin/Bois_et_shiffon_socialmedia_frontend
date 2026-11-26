"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clock, LoaderCircle, RefreshCw } from "lucide-react";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { type DataSourceDto, type DataSyncResult, type DataSyncRun } from "@/shared";
import { clockTime, timeAgo } from "@/lib/time";

/** "12:04 – 12:06", or only the end when the start isn't recorded (runs from before it was). */
function runSpan(startedAt: string | null | undefined, at: string, now: number) {
  return startedAt ? `${clockTime(startedAt, now)} – ${clockTime(at, now)}` : `ended ${clockTime(at, now)}`;
}

/** A queued run due within this long reads "starts in a moment" rather than a time. */
const SOON_MS = 30_000;

/**
 * What SyncedAt says, as text: the state's kind and its line, and in the idle state the last run's span
 * ("last sync 12:04 – 12:06"; null before any run ended). Pure, so it can be checked without rendering.
 */
export function syncStatus(run: DataSyncRun, last: DataSyncResult | null, now = Date.now()): { kind: "running" | "queued" | "idle"; text: string; lastSync: string | null } {
  if (run?.state === "running") return { kind: "running", text: `Syncing…${run.since ? ` started ${clockTime(run.since, now)}` : ""}`, lastSync: null };
  if (run?.state === "queued") {
    const soon = !run.since || Date.parse(run.since) <= now + SOON_MS;
    return { kind: "queued", text: `Sync queued, ${soon ? "starts in a moment" : `starts ${clockTime(run.since!, now)}`}`, lastSync: null };
  }
  return {
    kind: "idle",
    text: last?.okAt ? `Updated ${timeAgo(last.okAt, now)}` : "Not synced yet",
    lastSync: last?.at ? `last sync ${runSpan(last.startedAt, last.at, now)}` : null,
  };
}

/**
 * The run ends useReloadWhenSynced reacts to, one per source: its lastResult.at, except while a history (backfill)
 * run is queued or running, when the source keeps the value it had (`before`). So a chain of ~50 history windows
 * reloads the numbers once, when it ends, not after every window. Pure, so it can be checked without rendering.
 */
export function syncedKeys(sources: (DataSourceDto | undefined)[], before: string[]): string[] {
  return sources.map((s, i) => (s?.sync?.backfill ? (before[i] ?? s.lastResult?.at ?? "") : (s?.lastResult?.at ?? "")));
}

/**
 * Reloads a tab's numbers when one of its sources finishes a run (its lastResult.at moves), not on the first render,
 * and not after each window of a history being read (syncedKeys). useLoad keeps the old numbers on screen while the
 * new ones load, so nothing flashes.
 */
export function useReloadWhenSynced(sources: (DataSourceDto | undefined)[], reload: () => void) {
  const state = sources.map((s) => `${s?.lastResult?.at ?? ""}~${s?.sync?.backfill ? 1 : 0}`).join("|");
  const latest = useRef(sources);
  const seen = useRef<string[] | null>(null);
  useEffect(() => {
    latest.current = sources;
  });
  useEffect(() => {
    const keys = syncedKeys(latest.current, seen.current ?? []);
    const first = seen.current === null;
    const changed = !first && keys.join("|") !== seen.current!.join("|");
    seen.current = keys;
    if (changed) reload();
  }, [state, reload]);
}

/**
 * A source's sync state and Sync now. Three states, from the server (`source.sync` comes from the job table):
 * - running: "Syncing… started 12:04", the button off;
 * - queued: "Sync queued, starts 12:05" (Sync now, or a run that stopped partway carrying on), the button off;
 * - idle: "Updated 3 h ago" from the last success, and when the last run started and ended.
 * While queued or running, PerformanceTabs reads the sources again every 5 s (every minute while only history
 * windows run, pollEvery); when the run ends, "Sync finished"
 * is announced here and the tab reloads its numbers (useReloadWhenSynced). Sync now queues a job (POST …/sync):
 * `queued: false` = synced in the last 5 minutes or already queued; 429 = 3 presses this hour (the server says so).
 * `name` tells several sources of one kind apart (two ad accounts). The reason's text is the server's fixed one
 * (`lastResult.error`, shared DATA_SYNC_ERRORS); `reason` only picks the tone and the Connections link.
 */
export function SyncedAt({ source, syncUrl, name, onChanged }: { source: DataSourceDto; syncUrl: string; name?: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const last = source.lastResult;
  const reason = last?.reason ?? null;
  const run = source.sync ?? null;

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
  const shown = syncStatus(run, last);
  const status =
    shown.kind === "idle" ? (
      <span className="text-muted-foreground">
        {label}
        {shown.text}
        {shown.lastSync ? <span className="whitespace-nowrap"> · {shown.lastSync}</span> : null}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        {shown.kind === "running" ? (
          <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin text-primary" />
        ) : (
          <Clock aria-hidden="true" className="size-4 text-primary" />
        )}
        {label}
        {shown.text}
      </span>
    );

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
