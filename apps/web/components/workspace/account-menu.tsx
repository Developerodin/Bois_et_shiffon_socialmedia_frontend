"use client";

import Link from "next/link";
import { ChevronUp } from "lucide-react";
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
  /** The member's role name under their name. */
  roleLabel?: string | null;
  /** Shows Admin. Visibility only; /admin is gated by its own layout. */
  platformAdmin?: boolean;
  /** The workspaces to switch between. */
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string | null;
};

/** The sidebar's account row and its menu: the "more" pages, Admin, the workspaces, sign out. */
export function AccountMenu({ name, email, image, roleLabel, platformAdmin, workspaces = [], activeWorkspaceId = null }: Props) {
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl py-2 text-left hover:bg-muted active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* A photo if the account has one; otherwise the initial on lavender (V01). */}
        <Avatar className="size-9" aria-hidden="true">
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback className="bg-accent text-sm font-semibold text-primary-strong">{initial}</AvatarFallback>
        </Avatar>
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
        {workspaces.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <WorkspaceItems workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
          </>
        ) : null}
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
