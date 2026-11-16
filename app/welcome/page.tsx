import Link from "next/link";
import { SignOutButton } from "@/components/workspace/sign-out-item";
import { EspandaLogo } from "@/components/brand/espanda-logo";
import { OpenWorkspaceButton } from "@/components/welcome/open-workspace-button";
import { WelcomeFlow } from "@/components/welcome/welcome-flow";
import { getShell } from "@/lib/server-fetch";
import { normalizeWebsite } from "@espanda/shared";

export const metadata = { title: "Add your brand" };

/** First run: a signed-in person with no brand enters their website, then watches it being read. */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const shell = await getShell();
  const q = await searchParams;
  const workspaceId = shell.activeWorkspaceId;
  const canCreate = shell.workspacePermissions.includes("brand.create");
  const site = q.site ? normalizeWebsite(q.site) : null;
  const resume =
    q.brand && q.run && site && shell.brands.some((b) => b.id === q.brand)
      ? { brandId: q.brand, runId: q.run, website: site }
      : null;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <EspandaLogo height={28} priority />
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
              <OpenWorkspaceButton key={w.id} workspaceId={w.id} name={w.name} />
            ))}
          <SignOutButton className="py-2 hover:text-foreground" />
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
