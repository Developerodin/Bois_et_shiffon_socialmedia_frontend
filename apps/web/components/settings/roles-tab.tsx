"use client";

import { useCallback, useRef, useState } from "react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { settingsApi, type Role } from "@/components/settings/api";
import {
  ConfirmDialog,
  ListSkeleton,
  LoadError,
  SectionHeader,
  SystemLock,
  useLoad,
  type Load,
} from "@/components/settings/shared";
import { RoleDialog } from "@/components/settings/role-dialog";
import { rememberFocus } from "@/components/settings/return-focus";

type Props = {
  workspaceId: string;
  can: Set<string>;
  roles: { state: Load<Role[]>; reload: () => void };
};

export function RolesTab({ workspaceId, can, roles }: Props) {
  const manage = can.has("roles.manage");
  // Owners can change a built-in role's permissions too; the Owner role itself always keeps everything.
  const editBuiltIn = manage && can.has("workspace.manage");
  const catalogFetcher = useCallback(
    () => settingsApi.permissions().then((d) => d.permissions ?? []),
    [],
  );
  const catalog = useLoad(manage ? catalogFetcher : null);
  const [editing, setEditingState] = useState<Role | "new" | null>(null);
  const restoreFocus = useRef<(() => void) | null>(null);
  function setEditing(v: Role | "new" | null) {
    if (v) restoreFocus.current = rememberFocus("settings-panel-roles");
    setEditingState(v);
    if (!v) restoreFocus.current?.();
  }
  const [deleting, setDeleting] = useState<Role | null>(null);
  const { state, reload } = roles;

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading roles" />;
  else if (state.kind === "forbidden")
    body = (
      <EmptyState
        icon={ShieldCheck}
        title="You can't view roles"
        description="Your role doesn't include roles.read."
      />
    );
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else if (state.data.length === 0)
    body = (
      <EmptyState
        icon={ShieldCheck}
        title="No roles yet"
        description="Create a role to group permissions."
      />
    );
  else {
    const sorted = [...state.data].sort((a, b) => Number(b.isSystem) - Number(a.isSystem));
    body = (
      <ul className="flex flex-col gap-3">
        {sorted.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-display text-lg font-medium leading-tight tracking-tight">
                    {r.name}
                  </p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {r.scope === "PROJECT" ? "Project role" : "Workspace role"}
                  </span>
                  {r.isSystem ? <SystemLock /> : null}
                </div>
                {r.description ? (
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">{r.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <span className="mr-2 text-xs text-muted-foreground">
                  {r.memberCount} {r.memberCount === 1 ? "member" : "members"}
                </span>
                {editBuiltIn && r.isSystem && r.slug !== "owner" ? (
                  <Button variant="ghost" size="icon" aria-label={`Edit ${r.name} permissions`} onClick={() => setEditing(r)}>
                    <Pencil />
                  </Button>
                ) : null}
                {manage && !r.isSystem ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${r.name}`}
                      onClick={() => setEditing(r)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${r.name}`}
                      onClick={() => setDeleting(r)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            {r.permissions.length ? (
              <ul aria-label={`${r.name} permissions`} className="flex flex-wrap gap-1.5">
                {r.permissions.map((p) => (
                  <li
                    key={p}
                    className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No permissions</p>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="roles-heading" className="flex flex-col gap-5">
      <SectionHeader
        id="roles-heading"
        title="Roles"
        description="Owners can change what any built-in role may do (except Owner, which keeps everything). Custom roles let you build your own."
        action={
          manage ? (
            <Button onClick={() => setEditing("new")}>
              <Plus /> New role
            </Button>
          ) : undefined
        }
      />
      {body}
      {editing !== null ? (
        <RoleDialog
          workspaceId={workspaceId}
          role={editing === "new" ? null : editing}
          catalog={catalog.state}
          onRetryCatalog={catalog.reload}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete role?"
        description={
          deleting
            ? deleting.memberCount > 0
              ? `${deleting.name} is assigned to ${deleting.memberCount} member(s). Reassign them first, or the delete will be refused.`
              : `${deleting.name} will be permanently deleted.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          await settingsApi.deleteRole(workspaceId, deleting.id);
          reload();
        }}
      />
    </section>
  );
}
