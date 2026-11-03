"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Menu, Settings, SquareTerminal } from "lucide-react";
import { AgentLog } from "@/components/agents/agent-log";
import { BrandSwitcher, type BrandOption } from "@/components/shell/brand-switcher";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/components/shell/workspace-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountMenu } from "@/components/workspace/account-menu";
import { ScoreRing } from "@/components/workspace/score-ring";
import { SignOutItem } from "@/components/workspace/sign-out-item";
import { cn } from "@/lib/utils";

export type TopBarScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  ai: number | null;
} | null;

type Props = {
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  workspaces: WorkspaceOption[];
  brands: BrandOption[];
  activeWorkspaceId: string | null;
  activeBrandId: string | null;
  scores: TopBarScores;
  googleConnected: boolean;
  /** brand.create in the active workspace: shows "New brand". */
  canCreateBrand: boolean;
  /** User.isPlatformAdmin: shows "Platform admin" in the menu. */
  platformAdmin: boolean;
};

const AREAS = [
  { href: "/", label: "Workspace" },
  { href: "/performance", label: "Performance" },
  { href: "/context", label: "Strategy documents" },
  { href: "/?panel=content", label: "Content calendar" },
  { href: "/studio", label: "Studio", soon: true },
  { href: "/settings", label: "Settings" },
];

const LOGS_KEY = "ws.logsOpen";

/** One bar for the whole app (Okara pattern): brand, connections, health scores, live log, menu. */
export function TopBar(p: Props) {
  const [logsOpen, setLogsOpen] = useState(false);
  useEffect(() => {
    try {
      setLogsOpen(localStorage.getItem(LOGS_KEY) === "1");
    } catch {
      // storage blocked: default closed
    }
  }, []);
  const toggleLogs = () =>
    setLogsOpen((o) => {
      try {
        localStorage.setItem(LOGS_KEY, o ? "0" : "1");
      } catch {
        // ignore
      }
      return !o;
    });

  // On the workspace the account menu sits at the foot of the Context pane (Okara); elsewhere it's here.
  const onWorkspace = usePathname() === "/";

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background">
      <header className="flex h-14 items-center gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {p.workspaces.length > 1 && (
            <WorkspaceSwitcher workspaces={p.workspaces} activeWorkspaceId={p.activeWorkspaceId} />
          )}
          <BrandSwitcher workspaceId={p.activeWorkspaceId} brands={p.brands} activeBrandId={p.activeBrandId} canCreate={p.canCreateBrand} />
        </div>

        {p.activeBrandId && (
          <div className="mx-auto hidden min-w-0 items-center gap-4 xl:flex">
            {!p.googleConnected && (
              <Link
                href="/settings?tab=connections"
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
              >
                Connect Google
              </Link>
            )}
            {p.scores ? (
              <Link href="/performance" className="flex items-center gap-4 rounded-md px-1 py-1 hover:bg-muted" title="Open the full reports">
                <ScoreRing value={p.scores.performance} label="Performance" />
                <ScoreRing value={p.scores.accessibility} label="Accessibility" />
                <ScoreRing value={p.scores.bestPractices} label="Best practices" />
                <ScoreRing value={p.scores.seo} label="SEO" />
                <ScoreRing value={p.scores.ai} label="AI visibility" />
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">Run the SEO and GEO agents to see site scores</span>
            )}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {p.activeBrandId && (
            <Button variant={logsOpen ? "secondary" : "ghost"} size="sm" className="h-10 sm:h-8" onClick={toggleLogs} aria-label="Logs" aria-expanded={logsOpen} aria-controls="agent-log-drawer">
              <SquareTerminal aria-hidden="true" />
              <span className="hidden sm:inline">Logs</span>
              {logsOpen ? <ChevronUp aria-hidden="true" className="hidden sm:block" /> : <ChevronDown aria-hidden="true" className="hidden sm:block" />}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-10 sm:h-8" aria-label="Open menu">
                <Menu aria-hidden="true" />
                <span className="hidden sm:inline">Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {AREAS.map((a) =>
                a.soon ? (
                  <DropdownMenuItem key={a.href} disabled>
                    {a.label} <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={a.href} asChild>
                    <Link href={a.href}>{a.label}</Link>
                  </DropdownMenuItem>
                ),
              )}
              {p.platformAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/admin">Platform admin</Link>
                </DropdownMenuItem>
              )}
              {/* Sign out on every page: on the workspace the account menu sits at the foot of the Context pane,
                  easy to miss. */}
              <DropdownMenuSeparator />
              {p.userEmail ? <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">Signed in as {p.userEmail}</DropdownMenuLabel> : null}
              <SignOutItem />
            </DropdownMenuContent>
          </DropdownMenu>
          {/* On phones Settings is in the avatar's menu, to leave the project name room. */}
          <Button variant="ghost" size="icon" className={cn("size-10 sm:size-9", !onWorkspace && "hidden sm:inline-flex")} asChild>
            <Link href="/settings" aria-label="Settings">
              <Settings aria-hidden="true" />
            </Link>
          </Button>
          {!onWorkspace && <AccountMenu variant="avatar" name={p.userName} email={p.userEmail} image={p.userImage} />}
        </div>
      </header>

      {p.activeWorkspaceId && p.activeBrandId && (
        <div
          id="agent-log-drawer"
          className={cn("border-t border-border bg-card/60", logsOpen ? "block" : "hidden")}
        >
          <div className="max-h-[38vh] overflow-hidden px-3 py-2 sm:px-4">
            {logsOpen && <AgentLog key={p.activeBrandId} workspaceId={p.activeWorkspaceId} brandId={p.activeBrandId} compact />}
          </div>
        </div>
      )}
    </div>
  );
}
