import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/sidebar";
import { loadShellContext } from "@/server/shell/load-shell-context";

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const shell = await loadShellContext(session.user.id);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground md:flex-row">
      <AppSidebar hasActiveBrand={shell.hasActiveBrand} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          userName={session.user.name}
          userImage={session.user.image}
          workspaces={shell.workspaces}
          brands={shell.brands}
          activeWorkspaceId={shell.activeWorkspaceId}
          activeBrandId={shell.activeBrandId}
        />
        <main className="flex-1 px-6 py-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
