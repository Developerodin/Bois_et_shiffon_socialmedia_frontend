"use client";

import { useState } from "react";
import { CRM_LIMITS, type ConversationDto } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { messageBody, MessageFields, newMessageDraft } from "@/components/crm/follow-ups/log-message";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Log a conversation" on a customer's page (inbox.read and crm.manage): its first message, and an optional subject.
 * Its owner and next action are set on the Follow-ups tab.
 */
export function LogConversation({ w, b, customerId, onLogged }: { w: string; b: string; customerId: string; onLogged(c: ConversationDto): void }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState(newMessageDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const message = messageBody(draft);

  if (!open)
    return (
      <Button size="sm" variant="outline" className="self-start" onClick={() => (setDraft(newMessageDraft()), setOpen(true))}>
        Log a conversation
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!message) return;
        setBusy(true);
        setError(null);
        try {
          const { conversation } = await crmApi.createConversation(w, b, { customerId, subject: subject.trim() || null, message });
          onLogged(conversation);
          setOpen(false);
          setSubject("");
          setDraft(newMessageDraft());
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Subject (optional)</span>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={CRM_LIMITS.subject} autoFocus />
      </label>
      <MessageFields idPrefix="log-conversation" draft={draft} onEdit={(p) => setDraft((d) => ({ ...d, ...p }))} />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !message}>
          {busy ? "Logging…" : "Log the conversation"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
