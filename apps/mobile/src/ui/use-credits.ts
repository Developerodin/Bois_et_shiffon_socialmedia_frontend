import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { workspaceCredits } from "@/api/endpoints";

/** The workspace's real credit balance for the module headers; null while loading or when it can't be read. */
export function useCredits() {
  const [credits, setCredits] = useState<number | null>(null);
  // Re-read on every focus: a render or audit elsewhere changes the balance.
  useFocusEffect(
    useCallback(() => {
      const ctrl = new AbortController();
      workspaceCredits(ctrl.signal).then((r) => setCredits(r.credits), () => {});
      return () => ctrl.abort();
    }, []),
  );
  return credits;
}
