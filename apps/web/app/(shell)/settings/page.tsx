import { Settings } from "lucide-react";
import { SettingsBoard } from "@/components/settings/settings-board";
import { EmptyState } from "@/components/ui/empty-state";
import { getShell } from "@/lib/server-fetch";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const shell = await getShell();

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
    ? { kind: "ok" as const, text: `Connected ${q.connected}.`, names: q.connected.split(", ") }
    : q.connectError
      ? { kind: "error" as const, text: q.connectError }
      : null;

  return (
    <SettingsBoard
      key={shell.activeWorkspaceId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId ?? null}
      initialTab={q.tab}
      notice={notice}
    />
  );
}
