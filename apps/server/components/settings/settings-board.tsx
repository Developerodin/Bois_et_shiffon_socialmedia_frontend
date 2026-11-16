"use client";

import { useCallback, useRef, useState } from "react";
import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { settingsApi } from "@/components/settings/api";
import { ConnectionsTab } from "@/components/settings/connections-tab";
import { InvitationsTab } from "@/components/settings/invitations-tab";
import { MembersTab } from "@/components/settings/members-tab";
import { ProjectAccessTab } from "@/components/settings/project-access-tab";
import { RolesTab } from "@/components/settings/roles-tab";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { cn } from "@/lib/utils";

type TabKey = "project" | "members" | "roles" | "invitations" | "connections";

const TABS: { key: TabKey; label: string; needs: string }[] = [
  { key: "project", label: "Project access", needs: "brand.read" },
  { key: "members", label: "Members", needs: "members.read" },
  { key: "roles", label: "Roles", needs: "roles.read" },
  { key: "invitations", label: "Invitations", needs: "invitations.manage" },
  { key: "connections", label: "Connections", needs: "brand.read" },
];

type Props = {
  workspaceId: string;
  brandId: string | null;
  /** From ?tab=; anything that is not a tab is ignored. */
  initialTab?: string;
  notice: { kind: "ok" | "error"; text: string; names?: string[] } | null;
};

export function SettingsBoard({ workspaceId, brandId, initialTab, notice }: Props) {
  const permsFetcher = useCallback(
    // With a project open: workspace role plus that project's role.
    () => settingsApi.myPermissions(workspaceId, brandId).then((d) => new Set(d.permissions ?? [])),
    [workspaceId, brandId],
  );
  const perms = useLoad(permsFetcher);
  const can = perms.state.kind === "ready" ? perms.state.data : null;

  // Roles feed the role selects in Members and Invitations too, so load them once here.
  const rolesFetcher = useCallback(
    () => settingsApi.roles(workspaceId).then((d) => d.roles ?? []),
    [workspaceId],
  );
  const roles = useLoad(can?.has("roles.read") ? rolesFetcher : null);
  // Members and workspace invitations take workspace roles; project roles are picked in Project access.
  const roleList = roles.state.kind === "ready" ? roles.state.data.filter((r) => r.scope === "WORKSPACE") : [];

  // Project access and Connections are per brand, so they only show with a brand selected.
  const visible = can
    ? TABS.filter((t) => can.has(t.needs) && ((t.key !== "connections" && t.key !== "project") || brandId))
    : [];
  const [active, setActiveState] = useState<TabKey | null>(TABS.find((t) => t.key === initialTab)?.key ?? null);
  // The tab lives in the URL (replace, not push) so a reload or a shared link lands on the same one.
  function setActive(key: TabKey) {
    setActiveState(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(window.history.state, "", url);
  }
  const current = visible.find((t) => t.key === active) ?? visible[0];
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onTabKey(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    let next = index + delta;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = visible.length - 1;
    else if (!delta) return;
    e.preventDefault();
    const tab = visible[(next + visible.length) % visible.length];
    setActive(tab.key);
    tabRefs.current[tab.key]?.focus();
  }

  const forbidden = (
    <EmptyState
      icon={ShieldOff}
      title="You don't have access to workspace settings"
      description="Ask a workspace owner or admin to grant you a role with member, role or invitation permissions."
    />
  );

  let body: React.ReactNode;
  if (perms.state.kind === "loading") body = <ListSkeleton label="Loading settings" />;
  else if (perms.state.kind === "forbidden") body = forbidden;
  else if (perms.state.kind === "error")
    body = <LoadError message={perms.state.message} onRetry={perms.reload} />;
  else if (!current) body = forbidden;
  else {
    body = (
      <>
        <div
          role="tablist"
          aria-label="Workspace settings"
          className="flex gap-1 self-start rounded-full border border-border bg-card p-1"
        >
          {visible.map((t, i) => {
            const selected = t.key === current.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                role="tab"
                id={`settings-tab-${t.key}`}
                aria-selected={selected}
                aria-controls={`settings-panel-${t.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(t.key)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          id={`settings-panel-${current.key}`}
          aria-labelledby={`settings-tab-${current.key}`}
          tabIndex={0}
          className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          {current.key === "project" ? (
            <ProjectAccessTab workspaceId={workspaceId} brandId={brandId!} canManage={can!.has("project.members.manage")} />
          ) : current.key === "members" ? (
            <MembersTab workspaceId={workspaceId} can={can!} roles={roleList} onRolesChanged={roles.reload} />
          ) : current.key === "roles" ? (
            <RolesTab workspaceId={workspaceId} can={can!} roles={roles} />
          ) : current.key === "invitations" ? (
            <InvitationsTab workspaceId={workspaceId} roles={roleList} />
          ) : (
            <ConnectionsTab
              workspaceId={workspaceId}
              brandId={brandId!}
              canManage={can!.has("integrations.manage")}
              notice={notice}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who works on this project and the workspace, what each role can do, who is waiting to join, and which accounts this project has connected.
        </p>
      </div>
      {body}
    </div>
  );
}
