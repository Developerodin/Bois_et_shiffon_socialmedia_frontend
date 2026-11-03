"use client";

import { ChevronDown, Plus } from "lucide-react";
import { setActiveBrand } from "@/app/(shell)/actions/shell-context";
import { Badge } from "@/components/ui/badge";
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
  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0];

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Select business"
          className={`${SIDEBAR_BOX} cursor-pointer active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-semibold text-primary-strong" aria-hidden="true">
            {active.displayName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{active.displayName}</span>
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
              void setActiveBrand(workspaceId, brand.id);
            }}
          >
            <span className="flex w-full items-center justify-between gap-2">
              {brand.displayName}
              {brand.status === "ARCHIVED" ? <Badge variant="outline">Archived</Badge> : null}
            </span>
          </DropdownMenuItem>
        ))}
        {canCreate ? (
          <>
            <DropdownMenuSeparator />
            <NewBrandDialog
              workspaceId={workspaceId}
              trigger={
                <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Plus className="size-4" strokeWidth={SHELL_STROKE} aria-hidden="true" /> Create a business
                </button>
              }
            />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The 180 x 44 business picker at the top of the sidebar. */
export function BrandSwitcher({ workspaceId, ...rest }: Props) {
  if (!workspaceId) return null;
  return <SidebarSwitcher workspaceId={workspaceId} {...rest} />;
}
