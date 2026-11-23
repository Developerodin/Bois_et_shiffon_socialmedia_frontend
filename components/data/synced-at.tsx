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
 * queues a job (POST …/sync); the numbers change when it has run, on the next load or window focus. 429 = synced
 * recently or 3 tries this hour: the server's message says which.
 */
export function SyncedAt({ source, syncUrl }: { source: DataSourceDto; syncUrl: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const okAt = source.lastResult?.okAt ?? null;
  const reason = source.lastResult?.reason ?? null;

  const sync = async () => {
    setBusy(true);
    setNote(null);
    try {
      await request(syncUrl, { method: "POST" });
      setNote({ text: "Queued; numbers update in a few minutes.", error: false });
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
        <span className="text-muted-foreground">{okAt ? `Updated ${timeAgo(okAt)}` : "Not synced yet"}</span>
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
