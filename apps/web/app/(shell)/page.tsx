import { redirect } from "next/navigation";
// eslint-disable-next-line no-restricted-imports -- converted in task 3
import { auth } from "@/auth";
import { Workspace } from "@/components/workspace/workspace";
// eslint-disable-next-line no-restricted-imports -- converted in task 3
import { isPlatformAdmin } from "@/server/auth/platform-admin";
// eslint-disable-next-line no-restricted-imports -- converted in task 3
import { prisma } from "@/server/db/prisma";
// eslint-disable-next-line no-restricted-imports -- converted in task 3
import { loadShellContext } from "@/server/shell/load-shell-context";

/** The workspace: one screen with Context, Today and Agents (Okara pattern); the chat is the shell's Espanda panel. */
export default async function WorkspacePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const shell = await loadShellContext(session.user.id);

  // A platform-only account belongs to no workspace: its home is the admin console.
  if (!shell.activeWorkspaceId && (await isPlatformAdmin(session.user.id))) redirect("/admin");
  // First run: no brand yet → the website step.
  if (shell.activeWorkspaceId && shell.brands.length === 0) redirect("/welcome");
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return <p className="p-10 text-muted-foreground">Pick a business from the switcher in the sidebar.</p>;
  }

  const brand = await prisma.brand.findFirstOrThrow({
    where: { id: shell.activeBrandId, workspaceId: shell.activeWorkspaceId },
    select: { displayName: true, profile: { select: { websiteUrl: true } } },
  });

  return (
    <Workspace
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
      brandName={brand.displayName}
      website={brand.profile?.websiteUrl ?? null}
      user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
    />
  );
}
