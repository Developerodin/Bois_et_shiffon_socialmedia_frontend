import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Workspace } from "@/components/workspace/workspace";
import { prisma } from "@/server/db/prisma";
import { loadShellContext } from "@/server/shell/load-shell-context";

/** The workspace: one screen with Context, Today + Agents and Chat (Okara pattern). */
export default async function WorkspacePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const shell = await loadShellContext(session.user.id);

  // First run: no brand yet → the website step.
  if (shell.activeWorkspaceId && shell.brands.length === 0) redirect("/welcome");
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return <p className="p-10 text-muted-foreground">Pick a brand from the switcher above.</p>;
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
