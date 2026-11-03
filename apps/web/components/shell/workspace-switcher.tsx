"use client";

import { setActiveWorkspace } from "@/app/(shell)/actions/shell-context";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
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
