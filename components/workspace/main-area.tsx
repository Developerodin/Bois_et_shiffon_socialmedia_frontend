"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The middle column on the canvas. The workspace ("/") is full-bleed with its own scrolling panes (it needs a definite
 * height); every other page gets 16 px padding (32 px from sm up) and scrolls here, under the top bar.
 */
export function MainArea({ children }: { children: React.ReactNode }) {
  const full = usePathname() === "/";
  // relative: screen-reader-only text (position: absolute) stays inside this scroller; without it, hidden text far down a long page stretched the window and left an empty band under the app.
  return <main id="content" tabIndex={-1} className={cn("relative min-h-0 flex-1 bg-background focus:outline-none", full ? "overflow-hidden" : "overflow-y-auto p-4 sm:p-6")}>{children}</main>;
}
