"use client";

import { CRM_LIMITS, MESSAGE_MEDIA, type MessageMedium } from "@/shared";
import type { LoggedMessage } from "@/components/crm/api";
import { localDateTime, MEDIUM_LABEL, sentAtOf } from "@/components/crm/follow-ups/labels";
import { selectClass } from "@/components/settings/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** A message being logged, as typed. */
export type MessageDraft = { fromCustomer: boolean; medium: MessageMedium; when: string; text: string };
export const newMessageDraft = (now = new Date()): MessageDraft => ({ fromCustomer: true, medium: "EMAIL", when: localDateTime(now), text: "" });
/** The draft as sent, or null while the text or the date is missing. */
export function messageBody(d: MessageDraft): LoggedMessage | null {
  const sentAt = sentAtOf(d.when);
  return sentAt && d.text.trim() ? { fromCustomer: d.fromCustomer, medium: d.medium, text: d.text.trim(), sentAt } : null;
}

/** The line every log form shows: logging records what happened elsewhere and sends nothing. */
export const NOTHING_SENT = "This only records what was said elsewhere. Nothing is sent to the customer.";

/** Who wrote, how, when and what: the fields of a logged message (inside the caller's form). */
export function MessageFields({ idPrefix, draft, onEdit }: { idPrefix: string; draft: MessageDraft; onEdit(patch: Partial<MessageDraft>): void }) {
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="mb-1.5 text-muted-foreground">Who wrote it</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name={`${idPrefix}-from`} checked={draft.fromCustomer} onChange={() => onEdit({ fromCustomer: true })} />
          The customer
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`${idPrefix}-from`} checked={!draft.fromCustomer} onChange={() => onEdit({ fromCustomer: false })} />
          We did
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">How</span>
          <select className={cn(selectClass, "w-auto pointer-coarse:h-11")} value={draft.medium} onChange={(e) => onEdit({ medium: e.target.value as MessageMedium })}>
            {MESSAGE_MEDIA.map((m) => (
              <option key={m} value={m}>
                {MEDIUM_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">When</span>
          <Input type="datetime-local" value={draft.when} max={localDateTime(new Date())} onChange={(e) => onEdit({ when: e.target.value })} required />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">What was said</span>
        <Textarea value={draft.text} onChange={(e) => onEdit({ text: e.target.value })} maxLength={CRM_LIMITS.message} rows={3} required />
      </label>
      <p className="text-xs text-muted-foreground">{NOTHING_SENT}</p>
    </div>
  );
}
