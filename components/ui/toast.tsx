"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "warning";
export type ToastInput = { title: string; detail?: string; /** An in-app path ("/..."); anything else is ignored. */ href?: string; tone: ToastTone; /** A button on the toast: pressing it runs the callback and dismisses the toast. */ action?: { label: string; onAction(): void }; /** How long it stays, in ms (default 10 s). */ ms?: number };
type Toast = ToastInput & { id: number };

const MAX = 3;
const DISMISS_MS = 10_000;

let toasts: readonly Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a toast (the newest three stay). Title, detail are plain text. */
export function toast(t: ToastInput) {
  toasts = [...toasts, { ...t, id: nextId++ }].slice(-MAX);
  emit();
}
/** Remove every toast (the watcher does this when it goes: its toasts belong to the brand it watched). */
export function clearToasts() {
  if (toasts.length === 0) return;
  toasts = [];
  emit();
}
/** Remove the toasts that carry a button (the page that offered the action is gone, so it would do nothing). */
export function clearActionToasts() {
  if (!toasts.some((t) => t.action)) return;
  toasts = toasts.filter((t) => !t.action);
  emit();
}
/** Press a toast's button: dismiss it, then run its callback. */
export function runToastAction(id: number) {
  const t = toasts.find((x) => x.id === id);
  dismiss(id);
  t?.action?.onAction();
}
/** How long a toast stays. */
export const toastMs = (t: Pick<ToastInput, "ms">) => t.ms ?? DISMISS_MS;
/** The toasts now showing. */
export const currentToasts = () => toasts;
const dismiss = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};
/**
 * Only paths inside the app: "/" then a letter, digit, "?" or "#" ("//host" and "/\host" leave it: browsers read a
 * backslash as a slash), and no control character anywhere (browsers drop a tab or newline inside a URL, so a tab
 * after the first slash would make "//host").
 */
export const safeHref = (href: string | undefined) => (href && href.length > 0 && (href === "/" || /^\/[A-Za-z0-9?#]/.test(href)) && !/[\u0000-\u001f\u007f]/.test(href) ? href : undefined);

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const snapshot = () => toasts;

/** Stacks toasts bottom-right, above the phone's home bar. Mount once, in the shell. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-0 right-0 z-[70] flex w-full max-w-sm flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-lg:pb-[max(4.5rem,env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))]"
    >
      {list.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const [paused, setPaused] = useState(false);
  const ms = toastMs(t);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => dismiss(t.id), ms);
    return () => clearTimeout(timer);
  }, [paused, t.id, ms]);
  const href = safeHref(t.href);
  const body = (
    <>
      <span className="block text-sm font-medium">{t.title}</span>
      {t.detail ? <span className="mt-0.5 block break-words text-xs text-muted-foreground">{t.detail}</span> : null}
    </>
  );
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-1 rounded-2xl border bg-card p-1 shadow-lg rise-in",
        t.tone === "success" ? "border-success/50" : "border-warning/60",
      )}
    >
      {href ? (
        // A real link, so the unsaved-changes guard (which watches link clicks) covers it.
        <Link
          href={href}
          onClick={() => dismiss(t.id)}
          className="min-w-0 flex-1 rounded-xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body}
        </Link>
      ) : (
        <div className="min-w-0 flex-1 px-3 py-2">{body}</div>
      )}
      {t.action ? (
        <button
          type="button"
          onClick={() => runToastAction(t.id)}
          className="shrink-0 self-center rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(t.id)}
        className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
