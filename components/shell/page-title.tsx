"use client";

import { usePathname } from "next/navigation";
import { navItemForPath } from "@/components/shell/nav";

export function PageTitle() {
  const pathname = usePathname();
  const label = navItemForPath(pathname)?.label ?? "Today";
  return (
    <h1 className="font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
      {label}
    </h1>
  );
}
