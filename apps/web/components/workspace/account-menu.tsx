"use client";

import Link from "next/link";
import { ChevronUp, Plug, Settings, Users } from "lucide-react";
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
  variant: "card" | "avatar";
};

export function AccountMenu({ name, email, image, variant }: Props) {
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
