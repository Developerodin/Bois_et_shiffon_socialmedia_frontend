"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** The workspace ("/") is full-bleed with its own scrolling panes; every other page gets the usual padded column. */
export function MainArea({ children }: { children: React.ReactNode }) {
  const full = usePathname() === "/";
  return (
    <main className={cn("min-h-0 flex-1", full ? "overflow-hidden" : "overflow-y-auto px-6 py-6 lg:px-10")}>{children}</main>
  );
}
