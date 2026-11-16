"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The middle column on the canvas. The workspace ("/") is full-bleed with its own scrolling panes (it needs a definite
 * height); every other page gets 32 px padding and scrolls here, under the top bar.
 */
export function MainArea({ children }: { children: React.ReactNode }) {
  const full = usePathname() === "/";
  return <main className={cn("min-h-0 flex-1 bg-background", full ? "overflow-hidden" : "overflow-y-auto p-8")}>{children}</main>;
}
