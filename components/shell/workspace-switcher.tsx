"use client";

import { useRouter } from "next/navigation";
import { setActiveContext } from "@/components/context/api";
import { dropOpenItem } from "@/lib/workspace-view";
import { toast } from "@/components/ui/toast";
import { okToDiscard } from "@/components/context/unsaved";
import { finishNavigation, startNavigation } from "@/components/nav/nav-progress";
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
        startNavigation();
        void setActiveContext({ workspaceId: id }).then(() => {
          // The new workspace's Overview must not open the old brand's item.
          const away = dropOpenItem();
          if (away) router.replace(away);
          router.refresh();
        }, () => {
          finishNavigation();
          toast({ title: "Couldn't switch workspace", detail: "Try again.", tone: "warning" });
        });
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
