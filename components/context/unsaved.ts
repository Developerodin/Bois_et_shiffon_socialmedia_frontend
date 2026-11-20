import { createContext, useContext, useEffect } from "react";

// Several editors can hold unsaved work at once (a post's caption and its release form), so each registers under its
// own symbol: one clearing can't clear another's warning. Before closing an editor, these ask first: Cancel, choosing
// another document, the workspace back button and browser Back on the workspace, in-app links that leave the page
// (sidebar included), and the business and workspace switchers. Closing or reloading the tab is beforeunload.
const DISCARD = "You have unsaved changes. Leave without saving?";
const dirty = new Set<symbol>();

export function setUnsaved(owner: symbol, value: boolean) {
  if (value) dirty.add(owner);
  else dirty.delete(owner);
}

/** True when it's fine to close the editor: nothing unsaved, or the person agreed to discard it. */
export function okToDiscard() {
  return dirty.size === 0 || window.confirm(DISCARD);
}

// The tab and link guards are shared: one listener of each while anything is dirty, so two dirty editors ask once.
let attached = false;
const warn = (e: BeforeUnloadEvent) => e.preventDefault();
const onLink = (e: MouseEvent) => {
  const a = (e.target as Element | null)?.closest("a[href]");
  // SVG links (no string href), downloads and "#" links don't leave the page.
  if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download") || a.getAttribute("href") === "#") return;
  if (a.target === "_blank" || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const to = new URL(a.href, window.location.href);
  if (to.origin !== window.location.origin) return; // a full page load: beforeunload asks
  // Same page (a #hash, or another view of the workspace): the page stays mounted, and the workspace asks
  // itself when its view changes, so asking here too would ask twice.
  if (to.pathname === window.location.pathname) return;
  if (!okToDiscard()) {
    e.preventDefault();
    e.stopPropagation();
  }
};
function syncGuards() {
  if (dirty.size > 0 === attached) return;
  attached = dirty.size > 0;
  const act = attached ? "addEventListener" : "removeEventListener";
  window[act]("beforeunload", warn);
  document[act]("click", onLink as EventListener, true);
}

/** Marks `owner` dirty and attaches the shared guards; returns what the hook runs on unmount. */
export function registerUnsaved(owner: symbol) {
  setUnsaved(owner, true);
  syncGuards();
  return () => {
    setUnsaved(owner, false);
    syncGuards();
  };
}

/** True around editors that are closing (the Overview peek sliding out): their work was already agreed to be discarded. */
export const UnsavedGuardOff = createContext(false);

/** Registers this editor's unsaved state (own owner, cleared on unmount) and guards the tab and in-app links. */
export function useUnsavedGuard(isDirty: boolean) {
  const off = useContext(UnsavedGuardOff);
  useEffect(() => (isDirty && !off ? registerUnsaved(Symbol("unsaved")) : undefined), [isDirty, off]);
}

/** Whether the shared tab and link guards are attached (for tests). */
export const guardsAttached = () => attached;
