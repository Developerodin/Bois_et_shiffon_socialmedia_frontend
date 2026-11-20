"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "warning";
export type ToastInput = { title: string; detail?: string; /** An in-app path ("/..."); anything else is ignored. */ href?: string; tone: ToastTone };
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
const dismiss = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};
/** Only paths inside the app ("/x", not "//host"). */
export const safeHref = (href: string | undefined) => (href && href.startsWith("/") && !href.startsWith("//") ? href : undefined);

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const snapshot = () => toasts;

/** Stacks toasts bottom-right, above the phone's home bar. Mount once, in the shell. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-0 right-0 z-[70] flex w-full max-w-sm flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))]"
    >
      {list.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => dismiss(t.id), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [paused, t.id]);
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
        <button
          type="button"
          onClick={() => {
            dismiss(t.id);
            router.push(href);
          }}
          className="min-w-0 flex-1 rounded-xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1 px-3 py-2">{body}</div>
      )}
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
