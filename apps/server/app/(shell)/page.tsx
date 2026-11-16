import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import { getShell } from "@/lib/server-fetch";

/** The workspace: one screen with Context, Today and Agents (Okara pattern); the chat is the shell's Espanda panel. */
export default async function WorkspacePage() {
  const shell = await getShell();

  // A platform-only account belongs to no workspace: its home is the admin console.
  if (!shell.activeWorkspaceId && shell.isPlatformAdmin) redirect("/admin");
  // First run: no brand yet → the website step.
  if (shell.activeWorkspaceId && shell.brands.length === 0) redirect("/welcome");
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return <p className="p-10 text-muted-foreground">Pick a business from the switcher in the sidebar.</p>;
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
      user={shell.user}
    />
  );
}
