import { BrandSwitcher, type BrandOption } from "@/components/shell/brand-switcher";
import {
  WorkspaceSwitcher,
  type WorkspaceOption,
} from "@/components/shell/workspace-switcher";
import { PageTitle } from "@/components/shell/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

type Props = {
  userName?: string | null;
  userImage?: string | null;
  workspaces: WorkspaceOption[];
  brands: BrandOption[];
  activeWorkspaceId: string | null;
  activeBrandId: string | null;
};

export function AppHeader({
  userName,
  userImage,
  workspaces,
  brands,
  activeWorkspaceId,
  activeBrandId,
}: Props) {
  const initials =
    userName
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "?";

  return (
    <header
      className="sticky top-0 z-30 flex flex-wrap items-end justify-between gap-4 border-b border-border bg-background/85 px-6 py-4 backdrop-blur-md lg:px-10"
    >
      <div>
        <PageTitle />
        <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={
              activeBrandId
                ? "size-1.5 rounded-full bg-success"
                : "size-1.5 rounded-full bg-muted-foreground"
            }
            aria-hidden="true"
          />
          {activeBrandId
            ? "Brand context active"
            : "Select a brand to unlock brand-scoped areas"}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
        <BrandSwitcher
          workspaceId={activeWorkspaceId}
          brands={brands}
          activeBrandId={activeBrandId}
        />
        <Separator orientation="vertical" className="hidden h-10 sm:block" />
        <Avatar className="h-9 w-9">
          <AvatarImage src={userImage ?? undefined} alt={userName ?? "User"} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
