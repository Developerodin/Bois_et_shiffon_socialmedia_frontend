"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActivePath } from "@/components/shell/nav";
import { cn } from "@/lib/utils";

type Props = {
  hasActiveBrand: boolean;
  onNavigate?: () => void;
};

export function NavLinks({ hasActiveBrand, onNavigate }: Props) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const Icon = item.icon;
        const blocked = item.requiresBrand && !hasActiveBrand;
        if (blocked) {
          return (
            <li key={item.href}>
              <span
                className="flex cursor-not-allowed items-center gap-3 rounded-full px-3.5 py-2 text-sm text-muted-foreground opacity-60"
                title="Select a brand first"
                aria-disabled="true"
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </span>
            </li>
          );
        }
        const active = isActivePath(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary/15 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn("size-4", active ? "text-primary" : undefined)}
                aria-hidden="true"
              />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
