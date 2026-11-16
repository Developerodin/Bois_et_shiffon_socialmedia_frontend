"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { FileText, LayoutDashboard, Package, Plug, ShieldCheck, type LucideIcon } from "lucide-react";
import { EspandaLogo } from "@/components/brand/espanda-logo";
import { SHELL_STROKE } from "@/components/shell/icon";
import { BrandSwitcher, type BrandOption } from "@/components/shell/brand-switcher";
import type { WorkspaceOption } from "@/components/shell/workspace-switcher";
import { AccountMenu } from "@/components/workspace/account-menu";
import { NAV, navFor, type NavEntry } from "@/lib/nav";
import { cn } from "@/lib/utils";

const MAIN_ICONS: Record<string, LucideIcon> = { overview: LayoutDashboard, context: FileText, products: Package, connections: Plug };

type Props = {
  brands: BrandOption[];
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string | null;
  activeBrandId: string | null;
  canCreateBrand: boolean;
  /** Visibility only: /admin is gated by its own layout, so hiding the link is never the access check. */
  platformAdmin: boolean;
  user: { name?: string | null; email?: string | null; image?: string | null; roleLabel?: string | null };
};

const row =
  "flex items-center gap-3 rounded-2xl text-sm transition-colors active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Sidebar({ brands, workspaces, activeWorkspaceId, activeBrandId, canCreateBrand, platformAdmin, user }: Props) {
  const pathname = usePathname();
  const panel = useSearchParams().get("panel");

  // Agents that point at a page or panel are selected by where you are; Echo's stand-in destination never is.
  let activeId = navFor(pathname).activeId;
  if (pathname === "/" && panel === "content") activeId = "wave";
  if (pathname === "/" && panel === "competitors") activeId = "drift";
  if (pathname === "/performance") activeId = "surge";
  const isActive = (e: NavEntry) => activeId === e.id && !(e.soon && !e.href.startsWith("/agents/"));

  return (
    <aside aria-label="Workspace" className="flex h-full w-[232px] shrink-0 flex-col bg-card">
      <div className="px-5 pt-8">
        <Link href="/" aria-label="Espanda, Overview" className="inline-block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <EspandaLogo height={33} priority />
        </Link>
      </div>
      <div className="mt-6 px-5">
        <BrandSwitcher
          workspaceId={activeWorkspaceId}
          brands={brands}
          activeBrandId={activeBrandId}
          canCreate={canCreateBrand}
        />
      </div>

      {/* No workspace (a platform-only account): the business pages have nothing to show, so offer the one place that works. */}
      {!activeWorkspaceId ? (
        <nav aria-label="Workspace" className="mt-6 min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <p className="px-3 text-sm text-muted-foreground">
            You aren&apos;t in a workspace yet. {platformAdmin ? "Platform admin is available below." : "Ask a workspace owner to invite you."}
          </p>
          {platformAdmin ? (
            <Link
              href="/admin"
              aria-current={pathname.startsWith("/admin") ? "page" : undefined}
              className={cn(row, "mt-3 h-12 px-3", pathname.startsWith("/admin") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              <ShieldCheck className="size-5 shrink-0" strokeWidth={SHELL_STROKE} aria-hidden="true" />
              Platform admin
            </Link>
          ) : null}
        </nav>
      ) : (
      <nav aria-label="Workspace" className="mt-6 min-h-0 flex-1 overflow-y-auto pb-4">
        <ul className="mr-7 ml-5">
          {NAV.filter((e) => e.group === "main").map((e) => {
            const Icon = MAIN_ICONS[e.id];
            const on = isActive(e);
            return (
              <li key={e.id}>
                <Link
                  href={e.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(row, "h-12 px-3", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  {Icon ? <Icon className="size-5 shrink-0" strokeWidth={SHELL_STROKE} aria-hidden="true" /> : null}
                  {e.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 mb-2 px-5 text-xs text-muted-foreground">Your agents</p>
        <ul className="mx-5">
          {NAV.filter((e) => e.group === "agent").map((e) => {
            const on = isActive(e);
            return (
              <li key={e.id}>
                <Link
                  href={e.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(row, "h-[52px] px-2", on ? "bg-accent" : "hover:bg-muted")}
                >
                  <Image src={`/agents/${e.id}.svg`} alt="" width={36} height={36} className="size-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{e.label}</span>
                      {e.soon ? (
                        <span className="shrink-0 rounded-[8px] bg-muted px-2 text-xs text-primary-strong">Soon</span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{e.role}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      )}

      {/* No Help and support row: the repo has no help page and no support address in its environment. */}
      <div className="mx-5 border-t border-border py-3">
        <AccountMenu
          name={user.name}
          email={user.email}
          image={user.image}
          roleLabel={user.roleLabel}
          platformAdmin={platformAdmin}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
      </div>
    </aside>
  );
}
