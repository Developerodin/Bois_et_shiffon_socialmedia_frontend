"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { TaskCommentDto } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { tasksApi } from "@/lib/tasks-api";
import { timeAgo } from "@/lib/time";
import { TASKS_CHANGED } from "@/components/tasks/task-views";

/** "Share with client" is for staff, and only on a task a client can see; elsewhere it would share with nobody. */
export const shareToggleShown = (p: { staff: boolean; clientVisible: boolean }) => p.staff && p.clientVisible;

const KIND_LABEL: Record<string, string> = { APPROVED: "Approved", CHANGES_REQUESTED: "Asked for changes" };

/**
 * A task's comments, oldest first, and a box to add one. Bodies are plain text (never HTML). Staff comments stay with the
 * team unless shared (the server's rule; the toggle only asks). Re-read after any task change: approvals add comments.
 */
export function TaskComments({ base, taskId, staff, clientVisible }: { base: string; taskId: string; staff: boolean; clientVisible: boolean }) {
  const [comments, setComments] = useState<TaskCommentDto[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [body, setBody] = useState("");
  const [share, setShare] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const boxId = useId();
  const whyId = useId();
  const [now, setNow] = useState(0);

  const load = useCallback(() => {
    tasksApi.comments(base, taskId).then(
      (c) => {
        setComments(c);
        setLoadFailed(false);
        setNow(Date.now());
      },
      () => setLoadFailed(true),
    );
  }, [base, taskId]);
  useEffect(load, [load]);
  useEffect(() => {
    window.addEventListener(TASKS_CHANGED, load);
    return () => window.removeEventListener(TASKS_CHANGED, load);
  }, [load]);

  const showShare = shareToggleShown({ staff, clientVisible });
  const text = body.trim();
  const send = async () => {
    if (!text) return;
    setSending(true);
    setError("");
    try {
      const c = await tasksApi.comment(base, taskId, text, showShare && share);
      setComments((list) => [...(list ?? []), c]);
      setNow(Date.now());
      setBody("");
      setShare(false);
    } catch (e) {
      setError(errorMessage(e, "Couldn't post the comment. Try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby={`${boxId}-h`} className="flex flex-col gap-3">
      <h3 id={`${boxId}-h`} className="text-sm font-medium">
        Comments
      </h3>
      {comments === null ? (
        loadFailed ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Couldn&rsquo;t load the comments.
            <Button size="sm" variant="outline" onClick={load}>
              Try again
            </Button>
          </p>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading comments…
          </p>
        )
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author ? (c.author.gone ? `${c.author.name} (no longer on this business)` : c.author.name) : "System"}</span>
                {KIND_LABEL[c.kind] ? <span>{KIND_LABEL[c.kind]}</span> : null}
                {c.byClient ? <span>Client</span> : null}
                {staff && clientVisible && c.internal ? <span>Team only</span> : null}
                <span>{timeAgo(c.createdAt, now)}</span>
              </p>
              {/* Plain text: a comment is never rendered as HTML. */}
              <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor={boxId} className="sr-only">
          Add a comment
        </label>
        <Textarea id={boxId} value={body} maxLength={4_000} disabled={sending} placeholder="Add a comment" onChange={(e) => setBody(e.target.value)} className="min-h-20" />
        <div className="flex flex-wrap items-center justify-end gap-3">
          {showShare ? (
            <label className="mr-auto flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              <input type="checkbox" className="size-4 accent-primary" checked={share} disabled={sending} onChange={(e) => setShare(e.target.checked)} />
              Share with client
            </label>
          ) : null}
          {!text ? (
            <p id={whyId} className="text-xs text-muted-foreground">
              Write something first.
            </p>
          ) : null}
          <Button size="sm" disabled={sending || !text} aria-describedby={!text ? whyId : undefined} onClick={() => void send()}>
            {sending ? "Posting…" : "Post comment"}
          </Button>
        </div>
        {showShare && !share ? <p className="text-xs text-muted-foreground">Only your team sees this comment unless you share it.</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
