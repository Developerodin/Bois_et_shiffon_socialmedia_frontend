"use client";

import { useRouter } from "next/navigation";
import { setActiveContext } from "@/components/context/api";
import { okToDiscard } from "@/components/context/unsaved";
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";

export type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
};

/** The workspace choices of a dropdown menu, the active one marked; choosing one makes it the active workspace. */
export function WorkspaceItems({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string | null;
}) {
  const router = useRouter();
  return (
    <DropdownMenuRadioGroup
      value={activeWorkspaceId ?? ""}
      onValueChange={(id) => {
        if (!okToDiscard()) return;
        void setActiveContext({ workspaceId: id }).then(() => router.refresh(), () => {});
      }}
    >
      {workspaces.map((ws) => (
        <DropdownMenuRadioItem key={ws.id} value={ws.id}>
          {ws.name}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
