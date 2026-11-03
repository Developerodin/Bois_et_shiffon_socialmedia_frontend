"use client";

import Link from "next/link";
import { ChevronUp, Plug, Settings, Users } from "lucide-react";
import { SHELL_STROKE } from "@/components/shell/icon";
import { NAV } from "@/lib/nav";
import { WorkspaceItems, type WorkspaceOption } from "@/components/shell/workspace-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutItem } from "@/components/workspace/sign-out-item";

type Props = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** "card": full-width footer of the Context pane (Okara). "avatar": compact, for the top bar. */
  variant: "card" | "avatar" | "sidebar";
  /** Sidebar only: the member's role name under their name. */
  roleLabel?: string | null;
  /** Sidebar only: shows Admin. Visibility only; /admin is gated by its own layout. */
  platformAdmin?: boolean;
  /** Sidebar only: the workspaces to switch between (listed when there is more than one). */
  workspaces?: WorkspaceOption[];
};

export function AccountMenu({ name, email, image, variant, roleLabel, platformAdmin, workspaces }: Props) {
  if (variant === "sidebar") {
    return (
      <SidebarAccountMenu
        name={name}
        email={email}
        roleLabel={roleLabel}
        platformAdmin={platformAdmin}
        workspaces={workspaces}
      />
    );
  }
  const initials = (name ?? email ?? "?").split(/[\s@]/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const avatar = (
    <Avatar className="h-8 w-8">
      <AvatarImage src={image ?? undefined} alt="" />
      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={
          variant === "card"
            ? "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : "rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        }
      >
        {avatar}
        {variant === "card" && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{name ?? email}</span>
              {name && email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
            </span>
            <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "card" ? "start" : "end"} side={variant === "card" ? "top" : "bottom"} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-medium">{name ?? "Signed in"}</span>
          {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=connections">
            <Plug aria-hidden="true" /> Connected accounts
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Users aria-hidden="true" /> Team and roles
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The sidebar's account row and its menu: the "more" pages, Admin, the workspaces, sign out. */
function SidebarAccountMenu({
  name,
  email,
  roleLabel,
  platformAdmin,
  workspaces = [],
}: Pick<Props, "name" | "email" | "roleLabel" | "platformAdmin" | "workspaces">) {
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl py-2 text-left hover:bg-muted active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-primary-strong" aria-hidden="true">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{name ?? email}</span>
          {roleLabel ? <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span> : null}
        </span>
        <ChevronUp className="size-4 shrink-0 text-muted-foreground" strokeWidth={SHELL_STROKE} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-medium">{name ?? "Signed in"}</span>
          {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {NAV.filter((e) => e.group === "more").map((e) => (
          <DropdownMenuItem key={e.id} asChild>
            <Link href={e.href}>{e.label}</Link>
          </DropdownMenuItem>
        ))}
        {platformAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">Admin</Link>
          </DropdownMenuItem>
        ) : null}
        {workspaces.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <WorkspaceItems workspaces={workspaces} />
          </>
        ) : null}
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
