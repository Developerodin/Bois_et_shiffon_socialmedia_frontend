"use client";

import { usePathname } from "next/navigation";
import { PageSkeleton } from "@/components/ui/page-skeleton";

/**
 * Every app page: shown the moment you click, until the page arrives (and lets Next prefetch up to here).
 * Client component only for usePathname: the Overview ("/") is a full-height board, every other page a centred column,
 * and a skeleton of the wrong shape makes the page jump when it arrives. One neutral block fits the board at any width.
 */
export default function Loading() {
  const pathname = usePathname();
  if (pathname === "/") {
    return (
      <div role="status" className="h-full p-3">
        <div className="h-full min-h-[24rem] rounded-2xl bg-border motion-safe:animate-pulse" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl">
      <PageSkeleton />
    </div>
  );
}
