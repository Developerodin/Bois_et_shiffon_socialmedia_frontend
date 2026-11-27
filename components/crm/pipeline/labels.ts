import { money } from "@/components/data/shared";
import { DEAL_CLOSE_REASONS, type DealCloseReason, type DealDto, type DealStage } from "@/shared";

/** Reasons a person can give by hand: "Quote accepted" is set by the quote's acceptance itself. */
export const HAND_CLOSE_REASONS = DEAL_CLOSE_REASONS.filter((r): r is Exclude<DealCloseReason, "quote_accepted"> => r !== "quote_accepted");

/** Won and Lost close a deal. Lost needs a reason (the server answers 400 crm.closeReason without one); the reasons are why a deal was lost, so a win by hand has none. */
export const closesDeal = (stage: DealStage) => stage === "WON" || stage === "LOST";

/** A column's value, one total per currency and never added across currencies: "€1,250.00 · $300.00". */
export function totalsLine(totals: readonly { currency: string; value: string }[]): string | null {
  return totals.length ? totals.map((t) => money(t.value, t.currency)).join(" · ") : null;
}

/** What a person should look at on a deal (nothing moves by itself). */
export function dealHints(d: Pick<DealDto, "lostSuggested" | "lostButPaid">): string[] {
  const out: string[] = [];
  if (d.lostSuggested) out.push("Its quotes ended without a yes. Mark it lost?");
  if (d.lostButPaid) out.push("Marked lost, but one of its quotes was paid.");
  return out;
}

/** The value and currency as typed: a problem to show, or null when they can be sent. */
export function dealValueProblem(value: string, currency: string): string | null {
  const v = value.trim();
  const c = currency.trim();
  if (!v) return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(v)) return "Write the value like 1250 or 1250.50.";
  if (!/^[A-Za-z]{3}$/.test(c)) return "Give the value's currency, a 3-letter code like EUR.";
  return null;
}

export const DEAL_TITLE_HINT = "Describe the opportunity, like \"Sofa covers for the lobby\". Keep personal details (names, emails, phone numbers) out of the title: link the customer instead.";
