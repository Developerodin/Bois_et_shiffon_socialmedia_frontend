import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { auth } from "@/auth";
import { SettingsBoard } from "@/components/settings/settings-board";
import { EmptyState } from "@/components/ui/empty-state";
import { loadShellContext } from "@/server/shell/load-shell-context";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const shell = await loadShellContext(session.user.id);

  if (!shell.activeWorkspaceId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Settings}
          title="Pick a workspace to manage it."
          description="Settings are per workspace. Choose one from the switcher above to manage members, roles and invitations."
        />
      </div>
    );
  }

  // OAuth callback lands here with ?tab=connections&connected=…|connectError=…
  const q = await searchParams;
  const notice = q.connected
    ? { kind: "ok" as const, text: `Connected ${q.connected}.` }
    : q.connectError
      ? { kind: "error" as const, text: q.connectError }
      : null;

  return (
    <SettingsBoard
      key={shell.activeWorkspaceId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId ?? null}
      initialTab={q.tab === "connections" ? "connections" : undefined}
      notice={notice}
    />
  );
}
