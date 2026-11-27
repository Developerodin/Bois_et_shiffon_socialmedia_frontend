import type { ConversationChannel, FollowUpCounts, FollowUpFilter, FollowUpState, MessageMedium } from "@/shared";
import type { Tone } from "@/lib/status";

export const FOLLOW_UP_STATE_LABEL: Record<FollowUpState, string> = { NEEDS_REPLY: "Needs reply", WAITING: "Waiting on customer", CLOSED: "Closed" };
export const CHANNEL_LABEL: Record<ConversationChannel, string> = { LOGGED: "Logged", INSTAGRAM: "Instagram", MESSENGER: "Messenger" };
export const MEDIUM_LABEL: Record<MessageMedium, string> = { EMAIL: "Email", PHONE: "Phone", IN_PERSON: "In person", WHATSAPP: "WhatsApp", OTHER: "Other" };

/** The state's badge (overdue has a badge of its own, in "bad"). */
export const stateTone = (state: FollowUpState): Tone => (state === "NEEDS_REPLY" ? "warn" : state === "WAITING" ? "info" : "muted");

/** The queue's filter chips, each with its count where the counts carry one (open and closed have none). */
export function followUpChips(counts: FollowUpCounts | null): { filter: FollowUpFilter; label: string; count: number | null }[] {
  const n = (k: keyof FollowUpCounts) => (counts ? counts[k] : null);
  return [
    { filter: "open", label: "All open", count: null },
    { filter: "mine", label: "Mine", count: n("mine") },
    { filter: "needsReply", label: "Needs reply", count: n("needsReply") },
    { filter: "overdue", label: "Overdue", count: n("overdue") },
    { filter: "waiting", label: "Waiting on customer", count: n("waiting") },
    { filter: "closed", label: "Closed", count: null },
  ];
}

/** "YYYY-MM-DDTHH:mm" in the viewer's time, for a datetime-local input (the logged message's default: now). */
export function localDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A datetime-local value as the ISO instant the server takes, or null when it isn't a full date and time. */
export function sentAtOf(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
