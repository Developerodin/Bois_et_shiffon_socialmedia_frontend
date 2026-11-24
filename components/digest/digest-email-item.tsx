"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { request } from "@/components/settings/api";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * "Email me the weekly digest" in the account menu (flag `digest`). Reads the setting when the menu opens (the item
 * mounts then) and flips it on select; the menu stays open so the tick shows the new state.
 */
export function DigestEmailItem() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    request<{ email: boolean }>("/api/v1/me/digest-email").then(
      (r) => live && setOn(r.email),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={!!on}
      disabled={on === null}
      onSelect={(e) => {
        e.preventDefault();
        const next = !on;
        setOn(next);
        request<{ email: boolean }>("/api/v1/me/digest-email", { method: "PUT", body: JSON.stringify({ email: next }) }).then(
          (r) => setOn(r.email),
          () => setOn(!next),
        );
      }}
    >
      <Check aria-hidden="true" className={on ? "" : "invisible"} /> Email me the weekly digest
    </DropdownMenuItem>
  );
}
