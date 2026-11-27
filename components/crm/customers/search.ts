import { useEffect, useState } from "react";
import { CRM_LIMITS, type CustomerRow } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { errorMessage } from "@/components/settings/api";

/** Typing pauses this long before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

/** The text to search for, or null while it is shorter than the server's minimum (nothing is sent then). */
export function searchTerm(typed: string): string | null {
  const q = typed.trim();
  return q.length >= CRM_LIMITS.searchMin ? q : null;
}

/** `loading` keeps the previous term's results (`last`) on screen until the new ones come. */
export type CustomerSearch = { kind: "idle" } | { kind: "loading"; last: CustomerRow[] | null } | { kind: "ready"; customers: CustomerRow[] } | { kind: "error"; message: string };

/** The results to show: the latest answer, or while a new term loads the one before it; null when not searching. */
export const searchResults = (s: CustomerSearch): CustomerRow[] | null => (s.kind === "ready" ? s.customers : s.kind === "loading" ? s.last : null);

/**
 * Customers matching `typed`: waits for the minimum length and a pause in typing, and cancels the request a newer
 * search replaces (its answer is never shown). Used by the Customers tab and the quote's "Link to a customer".
 */
export function useCustomerSearch(w: string, b: string, typed: string): CustomerSearch {
  const term = searchTerm(typed);
  const [state, setState] = useState<CustomerSearch>({ kind: "idle" });
  useEffect(() => {
    if (!term) {
      setState({ kind: "idle" });
      return;
    }
    setState((s) => ({ kind: "loading", last: searchResults(s) }));
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      crmApi.search(w, b, term, { signal: abort.signal }).then(
        (r) => setState({ kind: "ready", customers: r.customers }),
        (e: unknown) => {
          // A cancelled search rethrows the abort: a newer one is already on its way.
          if (!abort.signal.aborted) setState({ kind: "error", message: errorMessage(e, "Couldn't search. Try again.") });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [w, b, term]);
  return term ? state : { kind: "idle" };
}
