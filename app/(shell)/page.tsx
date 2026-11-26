import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { getShell } from "@/lib/server-fetch";
import { featureOn } from "@/lib/features";
import { navFor } from "@/lib/nav";
import { competitorsRedirect } from "@/lib/workspace-view";

export const metadata = { title: navFor("/").title };

/** The workspace: one screen with Context, Today and Agents (Okara pattern); the chat is the shell's Bois & Chiffons panel. */
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ panel?: string | string[]; competitor?: string | string[] }> }) {
  const shell = await getShell();

  // A platform-only account belongs to no workspace: its home is the admin console.
  if (!shell.activeWorkspaceId && shell.isPlatformAdmin) redirect("/admin");
  // First run: no brand yet → the website step.
  if (shell.activeWorkspaceId && shell.brands.length === 0) redirect("/welcome");
  // Competitors was a panel here and is now a page: old links and bookmarks to it land on the page, with the competitor
  // they named (?competitor=) open in its peek. After the checks above, so those accounts still go where they belong.
  const { panel, competitor } = await searchParams;
  const moved = competitorsRedirect(panel, competitor);
  if (moved) redirect(moved);
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return <p className="p-10 text-muted-foreground">Pick a business from the menu.</p>;
  }

  // The shell lists only brands in the active workspace, and the active brand is one of them.
  const brand = shell.brands.find((b) => b.id === shell.activeBrandId)!;

  return (
    <Workspace
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
      brandName={brand.displayName}
      website={brand.websiteUrl}
      reelsOn={featureOn("reels", shell.activeWorkspaceId)}
      tasksOn={featureOn("tasks", shell.activeWorkspaceId)}
      digestOn={featureOn("digest", shell.activeWorkspaceId)}
      user={shell.user}
      perms={shell.brandPermissions}
    />
  );
}
