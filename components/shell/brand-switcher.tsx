"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
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
};

export function BrandSwitcher({ workspaceId, brands, activeBrandId, canCreate }: Props) {
  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0];

  if (!workspaceId) {
    return null;
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
    <div className="flex flex-col gap-1">
      <span className="sr-only">Brand</span>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 min-w-[9rem] justify-between sm:h-8 sm:min-w-[12rem]"
              aria-label="Select brand"
            >
              <span className="flex items-center gap-2 truncate">
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
