"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

/**
 * Says when the browser loses its connection, and when it's back. Pages that failed to load reload by themselves
 * once it's back (lib/net.ts, useLoad); anything being saved while offline shows its own error to try again.
 */
export function ConnectionBanner() {
  const [state, setState] = useState<"online" | "offline" | "back">("online");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const on = () => {
      setState("back");
      timer = setTimeout(() => setState("online"), 3000);
    };
    if (!navigator.onLine) off();
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4">
      {state === "offline" ? (
        <p className="pointer-events-auto flex items-center gap-2 rounded-full border border-warning/40 bg-card px-4 py-2 text-sm text-foreground shadow-lg">
          <WifiOff className="size-4 text-warning" aria-hidden="true" />
          You’re offline. Pages will load again when you’re back; save anything you change once you are.
        </p>
      ) : state === "back" ? (
        <p className="pointer-events-auto flex items-center gap-2 rounded-full border border-success/40 bg-card px-4 py-2 text-sm text-foreground shadow-lg">
          <Wifi className="size-4 text-success" aria-hidden="true" />
          Back online.
        </p>
      ) : null}
    </div>
  );
}
