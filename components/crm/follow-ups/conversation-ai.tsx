"use client";

import { useRef, useState } from "react";
import { CRM_LIMITS, type ConversationDto } from "@/shared";
import { crmApi, type ConversationSummary } from "@/components/crm/api";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const DRAFT_NOTE = "Nothing is sent from here. Paste it into your email or WhatsApp, then log your reply.";

/** The summary to show: a fresh answer wins over the saved one; the saved one may be out of date. */
export function shownSummary(c: Pick<ConversationDto, "summary" | "summaryStale">, fresh: ConversationSummary | null): { text: string; stale: boolean } | null {
  if (fresh) return { text: fresh.summary, stale: false };
  return c.summary ? { text: c.summary, stale: c.summaryStale } : null;
}

/** A suggested next step as the conversation's next action (cut to its limit), or null when there is none. */
export function suggestionPatch(s: ConversationSummary | null): { nextAction: string; nextActionDue: string | null } | null {
  const step = s?.nextStep?.trim();
  return step ? { nextAction: step.slice(0, CRM_LIMITS.nextAction), nextActionDue: s?.nextActionDue ?? null } : null;
}

/**
 * The conversation's AI help (plain text only): its summary with a suggested next step that a person may take as the
 * next action (never applied by itself), and for content.create holders a reply draft to copy. Errors show the
 * server's line (rate limit, AI not set up, no answer).
 */
export function ConversationAi({ w, b, conversation, canDraft, busy, onUseNext }: {
  w: string;
  b: string;
  conversation: ConversationDto;
  canDraft: boolean;
  /** Another change is saving: "Use as next action" waits. */
  busy: boolean;
  onUseNext(p: { nextAction: string; nextActionDue: string | null }): void;
}) {
  const [fresh, setFresh] = useState<ConversationSummary | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [working, setWorking] = useState<"summary" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const shown = shownSummary(conversation, fresh);
  const suggestion = suggestionPatch(fresh);

  const ask = async (what: "summary" | "draft") => {
    setWorking(what);
    setError(null);
    try {
      if (what === "summary") setFresh((await crmApi.summarise(w, b, conversation.id)).summary);
      else {
        setDraft((await crmApi.draftReply(w, b, conversation.id)).draft);
        setCopied(false);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWorking(null);
    }
  };
  const copy = async () => {
    if (draft === null) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      // No clipboard access (an insecure origin, a refused permission): select it for Ctrl+C.
      draftRef.current?.focus();
      draftRef.current?.select();
    }
  };

  return (
    <section aria-labelledby="conversation-ai-h" className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
      <h3 id="conversation-ai-h" className="text-xs font-medium text-muted-foreground">
        Summary and reply draft
      </h3>
      {shown ? (
        <div className="flex flex-col gap-1">
          <p className="whitespace-pre-wrap break-words">{shown.text}</p>
          {shown.stale ? <p className="text-xs text-muted-foreground">This summary may be out of date: messages were logged after it.</p> : null}
        </div>
      ) : (
        <p className="text-muted-foreground">No summary yet.</p>
      )}
      {suggestion ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <span>
            <span className="text-muted-foreground">Suggested next step: </span>
            {suggestion.nextAction}
            {suggestion.nextActionDue ? <span className="text-muted-foreground"> · by {suggestion.nextActionDue}</span> : null}
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onUseNext(suggestion)}>
            Use as next action
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!!working} onClick={() => void ask("summary")}>
          {working === "summary" ? "Summarising…" : shown ? "Summarise again" : "Summarise"}
        </Button>
        {canDraft ? (
          <Button size="sm" variant="outline" disabled={!!working} onClick={() => void ask("draft")}>
            {working === "draft" ? "Drafting…" : draft === null ? "Draft a reply" : "Draft again"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {draft !== null ? (
        <div className="flex flex-col gap-2">
          <Textarea ref={draftRef} value={draft} readOnly rows={6} aria-label="Reply draft" />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <span className="text-xs text-muted-foreground">{DRAFT_NOTE}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
