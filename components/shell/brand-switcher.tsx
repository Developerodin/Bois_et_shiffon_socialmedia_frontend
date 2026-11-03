"use client";

import { ChevronDown, ChevronsUpDown, Plus } from "lucide-react";
import { setActiveBrand } from "@/app/(shell)/actions/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  /** "sidebar": the 180 x 44 business picker at the top of the sidebar. */
  variant?: "default" | "sidebar";
};

const SIDEBAR_BOX =
  "flex h-11 w-[180px] items-center gap-2 rounded-2xl border border-control bg-card px-3 text-sm font-medium text-foreground";

function SidebarSwitcher({ workspaceId, brands, activeBrandId, canCreate }: Omit<Props, "variant"> & { workspaceId: string }) {
  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0];

  if (!active) {
    return canCreate ? (
      <NewBrandDialog
        workspaceId={workspaceId}
        trigger={
          <button type="button" className={`${SIDEBAR_BOX} cursor-pointer active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
            <Plus className="size-4 text-disabled" aria-hidden="true" />
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
          <ChevronDown className="size-4 shrink-0 text-disabled" aria-hidden="true" />
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
                  <Plus className="size-4" aria-hidden="true" /> Create a business
                </button>
              }
            />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BrandSwitcher({ workspaceId, brands, activeBrandId, canCreate, variant = "default" }: Props) {
  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0];

  if (!workspaceId) {
    return null;
  }

  if (variant === "sidebar") {
    return <SidebarSwitcher workspaceId={workspaceId} brands={brands} activeBrandId={activeBrandId} canCreate={canCreate} />;
  }

  if (!brands.length) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">No brands in workspace</span>
        {canCreate ? <NewBrandDialog workspaceId={workspaceId} /> : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="sr-only">Brand</span>
      <div className="flex min-w-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 min-w-0 max-w-[40vw] justify-between sm:h-8 sm:max-w-none sm:min-w-[12rem]"
              aria-label="Select brand"
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                {active?.displayName ?? "Select brand"}
                {active?.status === "ARCHIVED" ? (
                  <Badge variant="secondary">Archived</Badge>
                ) : null}
              </span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuLabel>Brands</DropdownMenuLabel>
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
                  {brand.status === "ARCHIVED" ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : null}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {canCreate ? (
          <NewBrandDialog
            workspaceId={workspaceId}
            trigger={
              <Button variant="outline" size="icon" className="size-10 sm:size-8" aria-label="New brand" title="New brand">
                <Plus />
              </Button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
