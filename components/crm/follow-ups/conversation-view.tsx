"use client";

import { useCallback, useEffect, useState } from "react";
import { CRM_LIMITS, type ConversationDto } from "@/shared";
import { crmApi, type ConversationPatch } from "@/components/crm/api";
import { CrmLink, crmHref } from "@/components/crm/crm-link";
import { ownerName, type Owner } from "@/components/crm/customers/people";
import { ConversationAi } from "@/components/crm/follow-ups/conversation-ai";
import { CHANNEL_LABEL, FOLLOW_UP_STATE_LABEL, MEDIUM_LABEL, stateTone } from "@/components/crm/follow-ups/labels";
import { messageBody, MessageFields, newMessageDraft } from "@/components/crm/follow-ups/log-message";
import { ApiError, errorMessage } from "@/components/settings/api";
import { ListSkeleton, selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageSection } from "@/components/ui/page-section";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

const WHEN = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** A conversation's heading: its subject, else who it is with. */
export const conversationTitle = (c: { subject: string | null; customer: { displayName: string } | null }) => c.subject ?? (c.customer ? `Conversation with ${c.customer.displayName}` : "Conversation");

/**
 * One conversation (inbox.read): its state, owner and next action (saved on the `updatedAt` read; 409 offers a
 * reload), waiting and close, logging a message, and the messages newest first. The customer links to their page
 * only for crm.manage holders.
 */
export function ConversationView({ sectionId, w, b, id, name, owners, canManage, canDraft, onChanged }: {
  sectionId: string;
  w: string;
  b: string;
  id: string;
  /** The row's title, for the heading while the conversation loads. */
  name: string | null;
  owners: readonly Owner[];
  canManage: boolean;
  /** content.create: an AI reply draft. */
  canDraft: boolean;
  onChanged(c: ConversationDto): void;
}) {
  const [c, setC] = useState<ConversationDto | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", ownerId: "", nextAction: "", nextActionDue: "" });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [draft, setDraft] = useState(newMessageDraft);

  /** The server's conversation; the form follows it only when saved, a suggestion used, or first read (edits stay). */
  const take = (x: ConversationDto, resetForm: boolean) => {
    setC(x);
    if (!resetForm) return;
    setForm({ subject: x.subject ?? "", ownerId: x.ownerId ?? "", nextAction: x.nextAction ?? "", nextActionDue: x.nextActionDue ?? "" });
    setDirty(false);
  };
  const load = useCallback(() => {
    setFailed(null);
    setError(null);
    crmApi.conversation(w, b, id).then(
      (r) => take(r.conversation, true),
      (e: unknown) => setFailed(errorMessage(e, "Couldn't load this conversation. Try again.")),
    );
  }, [w, b, id]);
  useEffect(load, [load]);

  const run = async (what: string, call: () => Promise<{ conversation: ConversationDto }>, after?: () => void) => {
    setBusy(what);
    setError(null);
    try {
      const { conversation } = await call();
      take(conversation, what === "save" || what === "use");
      onChanged(conversation);
      after?.();
    } catch (e) {
      setError({ message: errorMessage(e), stale: e instanceof ApiError && e.code === "crm.changed" });
    } finally {
      setBusy(null);
    }
  };
  const patch = (what: string, body: Omit<ConversationPatch, "updatedAt">) => c && run(what, () => crmApi.updateConversation(w, b, id, { ...body, updatedAt: c.updatedAt }));

  let body: React.ReactNode;
  if (failed) body = <LoadFailed what="this conversation" message={failed} onRetry={load} />;
  else if (!c) body = <ListSkeleton label="Loading the conversation" rows={2} />;
  else {
    const ownerList = form.ownerId && !owners.some((o) => o.id === form.ownerId) ? [...owners, { id: form.ownerId, name: ownerName(owners, form.ownerId) ?? "" }] : owners;
    const message = messageBody(draft);
    body = (
      <div className="@container flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {c.state !== "CLOSED" ? (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void patch("waiting", { waiting: c.state !== "WAITING" })}>
              {c.state === "WAITING" ? "Back to needs reply" : "Mark waiting on customer"}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void patch("closed", { closed: c.state !== "CLOSED" })}>
            {c.state === "CLOSED" ? "Reopen" : "Close"}
          </Button>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void patch("save", { subject: form.subject.trim() || null, ownerId: form.ownerId || null, nextAction: form.nextAction.trim() || null, nextActionDue: form.nextActionDue || null });
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Subject (optional)</span>
            <Input value={form.subject} onChange={(e) => (setForm((f) => ({ ...f, subject: e.target.value })), setDirty(true))} maxLength={CRM_LIMITS.subject} />
          </label>
          <div className="grid gap-3 @lg:grid-cols-[12rem_minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Owner</span>
              <select className={cn(selectClass, "pointer-coarse:h-11")} value={form.ownerId} onChange={(e) => (setForm((f) => ({ ...f, ownerId: e.target.value })), setDirty(true))}>
                <option value="">Nobody yet</option>
                {ownerList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Next action</span>
              <Input value={form.nextAction} onChange={(e) => (setForm((f) => ({ ...f, nextAction: e.target.value })), setDirty(true))} maxLength={CRM_LIMITS.nextAction} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Due</span>
              <Input type="date" value={form.nextActionDue} onChange={(e) => (setForm((f) => ({ ...f, nextActionDue: e.target.value })), setDirty(true))} />
            </label>
          </div>
          <Button type="submit" size="sm" className="self-start" disabled={!!busy || !dirty}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
        </form>
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>{error.message}</span>
            {error.stale ? (
              <Button size="sm" variant="outline" onClick={load}>
                Reload the conversation
              </Button>
            ) : null}
          </div>
        ) : null}
        {/* A change to the conversation (a logged message, a save) starts the AI help afresh from the saved summary. */}
        <ConversationAi key={c.updatedAt} w={w} b={b} conversation={c} canDraft={canDraft} busy={!!busy} onUseNext={(p) => void patch("use", p)} />
        <section aria-labelledby="conversation-log-h" className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <h3 id="conversation-log-h" className="text-xs font-medium text-muted-foreground">
            Log a message
          </h3>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (message) void run("log", () => crmApi.logMessage(w, b, id, message), () => setDraft(newMessageDraft()));
            }}
          >
            <MessageFields idPrefix="conversation-log" draft={draft} onEdit={(p) => setDraft((d) => ({ ...d, ...p }))} />
            <Button type="submit" size="sm" variant="outline" className="self-start" disabled={!!busy || !message}>
              {busy === "log" ? "Logging…" : "Log the message"}
            </Button>
          </form>
        </section>
        <section aria-labelledby="conversation-messages-h" className="flex flex-col gap-2">
          <h3 id="conversation-messages-h" className="text-xs font-medium text-muted-foreground">
            Messages, newest first
          </h3>
          {c.messages.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {c.messages.map((m) => (
                <li key={m.id} className={cn("flex flex-col gap-1 rounded-xl border px-3 py-2", m.fromCustomer ? "border-border" : "border-border bg-muted/50")}>
                  <span className="text-xs text-muted-foreground">
                    {m.fromCustomer ? "The customer" : "Us"}
                    {m.medium ? ` · ${MEDIUM_LABEL[m.medium]}` : ""} · <time dateTime={m.sentAt}>{WHEN.format(new Date(m.sentAt))}</time>
                  </span>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No messages kept (messages go after 13 months).</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <PageSection
      id={sectionId}
      title={c ? conversationTitle(c) : (name ?? "Conversation")}
      description={
        c ? (
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={stateTone(c.state)}>{FOLLOW_UP_STATE_LABEL[c.state]}</StatusBadge>
            {c.overdue ? <StatusBadge tone="bad">Overdue</StatusBadge> : null}
            <span>{CHANNEL_LABEL[c.channel]}</span>
            {c.customer ? (
              canManage ? (
                <CrmLink href={crmHref("customers", { customer: c.customer.id })}>{c.customer.displayName}</CrmLink>
              ) : (
                <span>{c.customer.displayName}</span>
              )
            ) : null}
          </span>
        ) : undefined
      }
    >
      {body}
    </PageSection>
  );
}
