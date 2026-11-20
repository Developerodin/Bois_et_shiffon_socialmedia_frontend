"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { okToDiscard, releaseUnloadGuard, restoreUnloadGuard } from "@/components/context/unsaved";
import { clearAllRecent } from "@/lib/recent";

/**
 * Signing out, for every place that offers it. Auth.js's own client sign-out (POST /api/auth/signout, which clears
 * the session cookie, then /login). Two earlier versions failed: a <form> inside a menu never submitted (choosing
 * an item closes the menu and removes the form first), and the server action's cookie removal didn't stick.
 * What this browser remembered of what the person opened (Recent) goes first: the next person must not see it.
 */
const signOutNow = (onFail: () => void) => {
  if (!okToDiscard()) return false;
  releaseUnloadGuard();
  clearAllRecent();
  signOut({ redirectTo: "/login" }).catch(() => {
    restoreUnloadGuard();
    onFail();
  });
  return true;
};

/** "Sign out" in a dropdown menu. The menu stays open (preventDefault) until the page leaves. */
export function SignOutItem() {
  const [pending, setPending] = useState(false);
  return (
    <DropdownMenuItem
      className="text-destructive"
      disabled={pending}
      onSelect={(e) => {
        e.preventDefault();
        if (signOutNow(() => setPending(false))) setPending(true);
      }}
    >
      <LogOut aria-hidden="true" /> {pending ? "Signing out…" : "Sign out"}
    </DropdownMenuItem>
  );
}

/** "Sign out" as a plain button (pages without a menu, such as /welcome). */
export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (signOutNow(() => setPending(false))) setPending(true);
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
