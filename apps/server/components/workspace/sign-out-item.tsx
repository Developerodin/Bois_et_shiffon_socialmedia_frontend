"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * Signing out, for every place that offers it. Auth.js's own client sign-out (POST /api/auth/signout, which clears
 * the session cookie, then /login). Two earlier versions failed: a <form> inside a menu never submitted (choosing
 * an item closes the menu and removes the form first), and the server action's cookie removal didn't stick.
 */
const signOutNow = () => signOut({ redirectTo: "/login" });

/** "Sign out" in a dropdown menu. The menu stays open (preventDefault) until the page leaves. */
export function SignOutItem() {
  const [pending, setPending] = useState(false);
  return (
    <DropdownMenuItem
      className="text-destructive"
      disabled={pending}
      onSelect={(e) => {
        e.preventDefault();
        setPending(true);
        void signOutNow();
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
        setPending(true);
        void signOutNow();
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
