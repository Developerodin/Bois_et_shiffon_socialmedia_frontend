export type Tone = "good" | "warn" | "bad" | "muted" | "info";

const group = (tone: Tone, names: string) => names.split(" ").map((n) => [n, tone] as const);

/** The one status-to-tone map. Anything not listed is muted. */
export const STATUS_TONE: Readonly<Record<string, Tone>> = Object.fromEntries([
  ...group("info", "AWAITING_APPROVAL SCHEDULED PUBLISHING RUNNING"),
  ...group("good", "APPROVED PUBLISHED SUCCEEDED SUCCESS ACTIVE ACCEPTED RECOMMEND CONFIRMED DONE"),
  ...group("warn", "CHECK HOLD PENDING_VERIFY PARTIAL QUEUED INVITED PENDING WARN ESCALATED FELL_BACK"),
  ...group("bad", "BLOCKED REJECTED FAILED EXPIRED ERROR"),
]);

export function toneOf(status: string | null | undefined): Tone {
  return (status && STATUS_TONE[status]) || "muted";
}

/** Text on tints uses the -ink tokens so every tone passes 4.5:1 (tests/status.test.ts). */
export const TONE_CLASS: Record<Tone, string> = {
  good: "border-success/40 bg-success/10 text-success-ink",
  warn: "border-warning/40 bg-warning/10 text-warning-ink",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-primary/40 bg-primary/10 text-primary-strong",
  muted: "border-border bg-muted text-muted-foreground",
};
