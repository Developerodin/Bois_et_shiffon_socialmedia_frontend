import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WelcomeFlow } from "@/components/welcome/welcome-flow";
import { effectivePermissions } from "@/server/auth/permissions";
import { loadShellContext } from "@/server/shell/load-shell-context";
import { normalizeWebsite } from "@/lib/website";

export const metadata = { title: "Add your brand" };

/** First run: a signed-in person with no brand enters their website, then watches it being read. */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const shell = await loadShellContext(session.user.id);
  const q = await searchParams;
  const workspaceId = shell.activeWorkspaceId;
  const canCreate = workspaceId ? (await effectivePermissions(workspaceId, session.user.id)).has("brand.create") : false;
  const site = q.site ? normalizeWebsite(q.site) : null;
  const resume =
    q.brand && q.run && site && shell.brands.some((b) => b.id === q.brand)
      ? { brandId: q.brand, runId: q.run, website: site }
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-display text-lg font-medium tracking-tight">Prow PLUS</span>
        {shell.brands.length > 0 || resume ? (
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Go to the app
          </Link>
        ) : canCreate ? (
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
            Invite your team first
          </Link>
        ) : null}
      </header>
      <main className="flex flex-1 items-center px-6 pb-16 pt-6 sm:px-10">
        {workspaceId ? (
          <WelcomeFlow workspaceId={workspaceId} canCreate={canCreate} resume={resume} />
        ) : (
          <div className="mx-auto w-full max-w-2xl">
            <h1 className="font-display text-4xl font-medium tracking-tight">You&rsquo;re not in a workspace yet.</h1>
            <p className="mt-4 text-muted-foreground">Ask the person who invited you to send the invitation again.</p>
          </div>
        )}
      </main>
    </div>
  );
}
