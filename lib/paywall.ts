import { isInsufficientCredits, isPlanRequired, type PaywallRefusal } from "@/shared";

/** The paywall refusal a 402 body or error line carries, or null when it isn't one of ours (a gateway page, other JSON). */
export function refusalOf(body: unknown): PaywallRefusal | null {
  if (isInsufficientCredits(body)) return { insufficientCredits: true, balance: body.balance, needed: body.needed };
  if (isPlanRequired(body)) {
    // The guard types title as a string, but a streamed line carries only `detail`.
    const b = body as { title?: unknown; detail?: unknown };
    const title = [b.title, b.detail].find((t): t is string => typeof t === "string" && t !== "");
    return { planRequired: true, title: title ?? "This needs a plan" };
  }
  return null;
}

let open: PaywallRefusal | null = null;
const listeners = new Set<() => void>();
const set = (next: PaywallRefusal | null) => {
  open = next;
  listeners.forEach((fn) => fn());
};

/** One paywall for the page: a later refusal replaces an open one. */
export const openPaywall = (r: PaywallRefusal): void => set(r);
export const closePaywall = (): void => {
  if (open) set(null);
};
export const currentPaywall = (): PaywallRefusal | null => open;
export function onPaywallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
