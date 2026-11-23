"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { ApiError, errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { REASON_TEXT, type DataSourceDto } from "@/lib/data-api";
import { timeAgo } from "@/lib/time";

/**
 * "Updated 3 h ago" from the source's last success, what a failed or stopped sync means, and Sync now. Sync now only
 * queues a job (POST …/sync); the numbers change when it has run, on the next load or window focus. `queued: false`
 * = synced in the last 5 minutes or already queued; 429 = 3 presses this hour (the server's message says so).
 * `name` tells several sources of one kind apart (two ad accounts).
 */
export function SyncedAt({ source, syncUrl, name }: { source: DataSourceDto; syncUrl: string; name?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const okAt = source.lastResult?.okAt ?? null;
  const reason = source.lastResult?.reason ?? null;

  const sync = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { queued } = await request<{ queued: boolean }>(syncUrl, { method: "POST" });
      setNote({ text: queued ? "Queued; numbers update in a few minutes." : "Already synced or queued in the last few minutes.", error: false });
    } catch (e) {
      const recently = e instanceof ApiError && e.status === 429;
      setNote({ text: errorMessage(e, "Couldn't queue a sync. Try again."), error: !recently });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground">{name ? `${name}: ` : ""}{okAt ? `Updated ${timeAgo(okAt)}` : "Not synced yet"}</span>
        <Button size="sm" variant="outline" className="print:hidden" disabled={busy} onClick={() => void sync()}>
          <RefreshCw aria-hidden="true" />
          {busy ? "Queuing…" : "Sync now"}
        </Button>
      </div>
      {reason ? (
        <p className={reason === "partial" ? "text-muted-foreground" : "text-warning"}>
          {REASON_TEXT[reason]}{" "}
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
