"use client";

import { ChevronsUpDown } from "lucide-react";
import { setActiveWorkspace } from "@/app/(shell)/actions/shell-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
};

type Props = {
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string | null;
};

/** The workspace choices of a dropdown menu; choosing one makes it the active workspace. */
export function WorkspaceItems({ workspaces }: { workspaces: WorkspaceOption[] }) {
  return workspaces.map((ws) => (
    <DropdownMenuItem
      key={ws.id}
      onSelect={() => {
        void setActiveWorkspace(ws.id);
      }}
    >
      {ws.name}
    </DropdownMenuItem>
  ));
}

export function WorkspaceSwitcher({ workspaces, activeWorkspaceId }: Props) {
  const active =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  if (!workspaces.length) {
    return (
      <p className="text-xs text-muted-foreground">No workspace access</p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="sr-only">Workspace</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="min-w-[12rem] justify-between"
            aria-label="Select workspace"
          >
            <span className="truncate">{active?.name ?? "Select workspace"}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <WorkspaceItems workspaces={workspaces} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
