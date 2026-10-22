import Link from "next/link";
import { redirect } from "next/navigation";
import { setActiveWorkspace } from "@/app/(shell)/actions/shell-context";
import { signOutAction } from "@/app/(shell)/actions/sign-out";
import { auth } from "@/auth";
import { WelcomeFlow } from "@/components/welcome/welcome-flow";
import { effectivePermissions } from "@/server/auth/permissions";
import { loadShellContext } from "@/server/shell/load-shell-context";
import { normalizeWebsite } from "@/lib/website";

export const metadata = { title: "Add your brand" };

async function openWorkspace(workspaceId: string) {
  "use server";
  await setActiveWorkspace(workspaceId);
  redirect("/");
}

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
        <nav className="flex flex-wrap items-center justify-end gap-x-5 text-sm text-muted-foreground">
          {shell.brands.length > 0 || resume ? (
            <Link href="/" className="inline-block py-2 hover:text-foreground">
              Go to the app
            </Link>
          ) : canCreate ? (
            <Link href="/settings" className="inline-block py-2 hover:text-foreground">
              Invite your team first
            </Link>
          ) : null}
          {/* Every person has their own workspace plus any they were invited to: a way back to those. */}
          {shell.workspaces
            .filter((w) => w.id !== workspaceId)
            .map((w) => (
              <form key={w.id} action={openWorkspace.bind(null, w.id)}>
                <button type="submit" className="py-2 hover:text-foreground">Open {w.name}</button>
              </form>
            ))}
          <form action={signOutAction}>
            <button type="submit" className="py-2 hover:text-foreground">Sign out</button>
          </form>
        </nav>
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
