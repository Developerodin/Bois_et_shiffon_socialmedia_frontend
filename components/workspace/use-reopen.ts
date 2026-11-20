import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { okToDiscard } from "@/components/context/unsaved";
import { toast } from "@/components/ui/toast";
import type { PeekItem } from "@/components/workspace/use-peek";
import { entryToView, isReopenKey, R_BLOCKED_TARGET, viewToEntry, type RecentEntry } from "@/lib/recent";
import { peekKey, type View } from "@/lib/workspace-view";

/**
 * Opening and closing the peek, and Reopen. Every view change asks first when an editor has unsaved work
 * (okToDiscard); closing is opening home. The last closed item is kept for Reopen (the toast's button, and R) and
 * cleared when anything else is shown (`forgetClosed`, for the URL effect too).
 */
export function useReopen(setView: (v: View) => void, viewNow: MutableRefObject<View>) {
  const lastClosed = useRef<RecentEntry | null>(null);
  const peekNow = useRef<PeekItem | null>(null);
  const forgetClosed = useCallback(() => void (lastClosed.current = null), []);
  const open = useCallback(
    (v: View) => {
      // Opening the item that's already open keeps its editor, so there's nothing to discard.
      if (peekKey(v) !== peekKey(viewNow.current) && !okToDiscard()) return;
      // Anything shown now makes an older close stale: R must not bring it back.
      lastClosed.current = null;
      setView(v);
    },
    [setView, viewNow],
  );
  const reopen = useCallback(() => {
    const e = lastClosed.current;
    lastClosed.current = null;
    if (e) open(entryToView(e));
  }, [open]);
  const close = useCallback(() => {
    const cur = peekNow.current;
    if (!okToDiscard()) return;
    setView({ kind: "home" });
    const entry = cur && viewToEntry(cur.view, Date.now());
    if (!entry) return;
    lastClosed.current = entry;
    toast({ title: `Closed ${cur.title}`, tone: "success", ms: 6000, action: { label: "Reopen", onAction: reopen } });
  }, [reopen, setView]);
  // R reopens the last closed item, unless the person is typing or something else already handled the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewNow.current.kind !== "home" || !lastClosed.current) return;
      const t = e.target;
      if (isReopenKey({ key: e.key, defaultPrevented: e.defaultPrevented, repeat: e.repeat, isComposing: e.isComposing, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, inBlockedTarget: t instanceof Element && !!t.closest(R_BLOCKED_TARGET) })) reopen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reopen, viewNow]);
  return { open, close, forgetClosed, peekNow };
}
