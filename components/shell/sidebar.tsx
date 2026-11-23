"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Camera, Clapperboard, FileText, Globe, Images, Inbox, LayoutDashboard, Menu, Package, Plug, PenSquare, Search, ShieldCheck, Workflow, type LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { BrandSwitcher, type BrandOption } from "@/components/shell/brand-switcher";
import type { WorkspaceOption } from "@/components/shell/workspace-switcher";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AccountMenu } from "@/components/workspace/account-menu";
import type { WebFeature } from "@/lib/features";
import { AGENT_ORDER_KEY, applyOrder, move, parseOrder } from "@/lib/agent-order";
import { agentEntries, navFor, sidebarGroups, type NavEntry } from "@/lib/nav";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<string, LucideIcon> = { overview: LayoutDashboard, context: FileText, products: Package, connections: Plug,
  automations: Workflow,
  website: Globe,
  seo: Search,
  library: Images,
  photoshoot: Camera,
  reels: Clapperboard,
  studio: PenSquare,
  inbox: Inbox,
};

type Props = {
  brands: BrandOption[];
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string | null;
  activeBrandId: string | null;
  canCreateBrand: boolean;
  /** Visibility only: /admin is gated by its own layout, so hiding the link is never the access check. */
  platformAdmin: boolean;
  /** Decided on the server (lib/features.ts is server-only) and passed down as data. */
  features: readonly WebFeature[];
  /** The role's permissions on the active business: visibility only, the pages and API check them. */
  perms: readonly string[];
  user: { name?: string | null; email?: string | null; image?: string | null; roleLabel?: string | null };
};

const row =
  "flex items-center gap-3 rounded-2xl text-sm transition-colors active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SidebarBody({ brands, workspaces, activeWorkspaceId, activeBrandId, canCreateBrand, platformAdmin, features, perms, user }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const panel = search.get("panel");

  // Agents that point at a page or panel are selected by where you are; Echo's stand-in destination never is.
  let activeId = navFor(pathname).activeId;
  if (pathname === "/" && panel === "content") activeId = "wave";
  if (pathname === "/" && panel === "competitors") activeId = "drift";
  if (pathname === "/performance") activeId = "surge";
  // /tasks is told apart by ?area=: Website, Performance (area=seo), else Beat's Projects & tasks slot.
  if (pathname === "/tasks") activeId = search.get("area") === "website" ? "website" : search.get("area") === "seo" ? "seo" : "beat";
  if (pathname === "/projects" || pathname.startsWith("/projects/")) activeId = "beat";
  const isActive = (e: NavEntry) => activeId === e.id && !(e.soon && !e.href.startsWith("/agents/"));

  // The person can reorder their agents by dragging, or with Alt+Up/Down on a focused row. Read after mount so the
  // server render and the first client render match.
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // The desktop sidebar and the phone sheet are two instances: "agent-order" (same tab) and `storage` (other tabs)
  // make each re-read the saved order.
  useEffect(() => {
    const read = () => {
      try {
        setOrder(parseOrder(localStorage.getItem(AGENT_ORDER_KEY)));
      } catch {}
    };
    read();
    window.addEventListener("agent-order", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("agent-order", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  // Moving a row down re-inserts the focused link, which drops focus: put it back after the move.
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (refocus.current) links.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [order]);
  const agents = applyOrder(agentEntries(features, perms), order);
  const reorder = (from: number, to: number) => {
    const next = move(agents, from, to).map((e) => e.id);
    setOrder(next);
    try {
      localStorage.setItem(AGENT_ORDER_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("agent-order"));
    } catch {}
  };

  return (
    <>
      {/* Same 72 px band as the top bar (h-18), so the wordmark lines up with the breadcrumb. */}
      <div className="flex h-18 shrink-0 items-center px-5">
        <Link href="/" aria-label="Bois & Chiffons, Overview" className="inline-block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandLogo height={46} priority />
        </Link>
      </div>
      <div className="mt-3 px-5">
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
        {sidebarGroups(features, perms).map((g) => (
          <div key={g.id} className={g.label ? "mt-6" : undefined}>
            {g.label ? <p className="mb-2 px-5 text-xs text-muted-foreground">{g.label}</p> : null}
            <ul className="mr-7 ml-5">
              {g.entries.map((e) => {
                const Icon = NAV_ICONS[e.id];
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
          </div>
        ))}

        <p className="mt-6 mb-2 px-5 text-xs text-muted-foreground">Your agents</p>
        <ul className="mx-5">
          {agents.map((e, i) => {
            const on = isActive(e);
            return (
              <li
                key={e.id}
                draggable
                onDragStart={(ev) => {
                  setDragId(e.id);
                  ev.dataTransfer.effectAllowed = "move";
                  ev.dataTransfer.setData("text/plain", e.id);
                }}
                onDragOver={(ev) => {
                  if (dragId) ev.preventDefault();
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  if (dragId) reorder(agents.findIndex((a) => a.id === dragId), i);
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
                className={cn("active:cursor-grabbing", dragId === e.id && "opacity-50")}
              >
                <Link
                  href={e.href}
                  ref={(el) => void (el ? links.current.set(e.id, el) : links.current.delete(e.id))}
                  draggable={false}
                  aria-current={on ? "page" : undefined}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  onKeyDown={(ev) => {
                    if (!ev.altKey || (ev.key !== "ArrowUp" && ev.key !== "ArrowDown")) return;
                    ev.preventDefault();
                    refocus.current = e.id;
                    reorder(i, ev.key === "ArrowUp" ? i - 1 : i + 1);
                  }}
                  className={cn(row, "h-[52px] px-2", on ? "bg-accent" : "hover:bg-muted")}
                >
                  <Image src={`/agents/${e.id}.svg`} alt="" width={36} height={36} draggable={false} className="size-9 shrink-0" />
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
    </>
  );
}

/** Desktop (768 px and up): the fixed sidebar. Below that the same body lives in MobileNav's sheet. */
export function Sidebar(props: Props) {
  return (
    <aside aria-label="Sidebar" className="hidden h-full w-[232px] shrink-0 flex-col bg-card md:flex">
      <SidebarBody {...props} />
    </aside>
  );
}

/** Below 768 px: a Menu button in the top bar that opens the sidebar body as a left sheet, closed again on navigation. */
export function MobileNav(props: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={cn(tool, "md:hidden")}>
        <Menu className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Menu</span>
      </SheetTrigger>
      <SheetContent
        side="left"
        aria-describedby={undefined}
        // Query-only links (/?panel=content) keep the pathname, so the effect above can't see them: close on any link click.
        onClick={(e) => e.target instanceof Element && e.target.closest("a") && setOpen(false)}
        className="flex w-[264px] max-w-[85vw] flex-col bg-card p-0"
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SidebarBody {...props} />
      </SheetContent>
    </Sheet>
  );
}
