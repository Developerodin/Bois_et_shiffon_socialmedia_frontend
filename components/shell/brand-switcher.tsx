"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { setActiveContext } from "@/components/context/api";
import { dropOpenItem } from "@/lib/workspace-view";
import { okToDiscard } from "@/components/context/unsaved";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SHELL_STROKE } from "@/components/shell/icon";
import { NewBrandDialog } from "@/components/shell/new-brand-dialog";

export type BrandOption = {
  id: string;
  displayName: string;
  slug: string;
  status?: "ACTIVE" | "ARCHIVED";
};

type Props = {
  workspaceId: string | null;
  brands: BrandOption[];
  activeBrandId: string | null;
  /** brand.create in this workspace; without it "New brand" would only end in a 403. */
  canCreate: boolean;
};

const SIDEBAR_BOX =
  "flex h-11 w-[180px] items-center gap-2 rounded-2xl border border-control bg-card px-3 text-sm font-medium text-foreground";

function SidebarSwitcher({ workspaceId, brands, activeBrandId, canCreate }: Omit<Props, "workspaceId"> & { workspaceId: string }) {
  const router = useRouter();
  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0];
  // The switch round-trips to the server and re-renders the shell; say so instead of looking idle.
  const [switching, startSwitch] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!active) {
    return canCreate ? (
      <NewBrandDialog
        workspaceId={workspaceId}
        trigger={
          <button type="button" className={`${SIDEBAR_BOX} cursor-pointer active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
            <Plus className="size-4 text-disabled" strokeWidth={SHELL_STROKE} aria-hidden="true" />
            <span className="truncate">Create a business</span>
          </button>
        }
      />
    ) : (
      <span className={`${SIDEBAR_BOX} text-muted-foreground`}>No business yet</span>
    );
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Select business"
          aria-busy={switching}
          disabled={switching}
          className={`${SIDEBAR_BOX} cursor-pointer active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-primary-strong" aria-hidden="true">
            {active.displayName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {switching ? `Switching to ${brands.find((b) => b.id === target)?.displayName ?? "business"}…` : active.displayName}
          </span>
          <ChevronDown className="size-4 shrink-0 text-disabled" strokeWidth={SHELL_STROKE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem]">
        <DropdownMenuLabel>Businesses</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {brands.map((brand) => (
          <DropdownMenuItem
            key={brand.id}
            onSelect={() => {
              // The active brand again: nothing changes, so nothing is closed or asked.
              if (brand.id === active.id) return;
              if (!okToDiscard()) return;
              setTarget(brand.id);
              startSwitch(async () => {
                try {
                  await setActiveContext({ workspaceId, brandId: brand.id });
                  // The Overview remounts for the new brand (keyed by brand); its URL must not name the old brand's item.
                  const away = dropOpenItem();
                  if (away) router.replace(away);
                  router.refresh();
                } catch {
                  toast({ title: "Couldn't switch business", detail: "Try again.", tone: "warning" });
                }
              });
            }}
          >
            <span className="flex w-full items-center justify-between gap-2">
              {brand.displayName}
              {brand.status === "ARCHIVED" ? <StatusBadge>Archived</StatusBadge> : null}
            </span>
          </DropdownMenuItem>
        ))}
        {canCreate ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCreating(true)}>
              <Plus className="size-4" strokeWidth={SHELL_STROKE} aria-hidden="true" /> Create a business
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
    {canCreate ? (
      <NewBrandDialog workspaceId={workspaceId} open={creating} onOpenChange={setCreating} trigger={null} returnFocus={triggerRef} />
    ) : null}
    </>
  );
}

/** The 180 x 44 business picker at the top of the sidebar. */
export function BrandSwitcher({ workspaceId, ...rest }: Props) {
  if (!workspaceId) return null;
  return <SidebarSwitcher workspaceId={workspaceId} {...rest} />;
}
