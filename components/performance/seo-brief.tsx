"use client";

import { useState } from "react";
import Link from "next/link";
import { errorMessage, request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import type { SeoBriefRequest, SeoBriefResult } from "@/shared";

/**
 * "Write a brief" (2 credits): the server's AI writes one brief over a finding's pages or the checked declining pages
 * into a task. After it: "Open task", and for a content brief "Write an article" (the blog page's existing start from a
 * task) when the blog is on and the role can write. Shown by the caller only with the tasks flag, tasks.manage and
 * analytics.read (the route checks them again).
 */
export function WriteBrief({ base, body, disabled = false, canWriteArticles }: { base: string; body: SeoBriefRequest | null; disabled?: boolean; canWriteArticles: boolean }) {
  const [done, setDone] = useState<SeoBriefResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const write = async () => {
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      setDone(await request<SeoBriefResult>(`${base}/seo/briefs`, { method: "POST", body: JSON.stringify(body), timeoutMs: 150_000 }));
    } catch (e) {
      setError(errorMessage(e, "Couldn't write the brief. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      {done ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/tasks?task=${encodeURIComponent(done.taskId)}`}>Open task</Link></Button>
          {done.kind === "content" && canWriteArticles ? (
            <Button asChild size="sm" variant="outline"><Link href={`/blog?task=${encodeURIComponent(done.taskId)}`}>Write an article</Link></Button>
          ) : null}
          <span role="status" className="text-xs text-muted-foreground">{done.existed ? "Brief added to the task." : "Brief task made."}</span>
        </div>
      ) : (
        <Button size="sm" variant="outline" disabled={busy || disabled || !body} onClick={() => void write()} title="Uses 2 credits">
          {busy ? "Writing…" : "Write a brief"}
        </Button>
      )}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
