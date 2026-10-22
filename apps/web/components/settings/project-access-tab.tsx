"use client";

import { useCallback, useState } from "react";
import { FolderLock, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { errorMessage, settingsApi } from "@/components/settings/api";
import {
  ConfirmDialog,
  ListSkeleton,
  LoadError,
  SectionHeader,
  formatDate,
  selectClass,
  useLoad,
} from "@/components/settings/shared";

type Props = { workspaceId: string; brandId: string; canManage: boolean };

/** Who works on the open project: people from the workspace role, project members, pending invites. */
export function ProjectAccessTab({ workspaceId, brandId, canManage }: Props) {
  const fetcher = useCallback(() => settingsApi.projectPeople(workspaceId, brandId), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const [status, setStatus] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; label: string; invite: boolean } | null>(null);

  const roles = state.kind === "ready" ? state.data.roles : [];
  const pickedRole = roleId || roles.find((r) => r.name === "Creator")?.id || roles[0]?.id || "";

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setStatus(null);
    try {
      await fn();
      reload();
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    void run("add", async () => {
      const res = await settingsApi.addToProject(workspaceId, brandId, { email: email.trim(), roleId: pickedRole });
      setEmail("");
      setStatus(
        !res.invited
          ? { ok: true, text: `${email.trim()} now has access to this project.` }
          : res.emailDelivery === "not_configured"
            ? { ok: true, text: "Invitation created. Email isn't set up, so share this link:", link: res.inviteUrl }
            : { ok: true, text: `Invitation sent to ${email.trim()}.` },
      );
    });
  }

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading project access" />;
  else if (state.kind === "forbidden")
    body = <EmptyState icon={FolderLock} title="You can't see this project's people" description="Ask a project admin for access." />;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else {
    const { viaWorkspace, people, invitations } = state.data;
    const row = "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between";
    body = (
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {people.map((p) => (
          <li key={p.id} className={row}>
            <Person name={p.name} email={p.email} />
            <div className="flex items-center gap-2">
              {canManage ? (
                <select
                  aria-label={`Project role for ${p.name ?? p.email}`}
                  value={p.role.id}
                  disabled={busy === p.id}
                  onChange={(e) => {
                    const next = e.target.value;
                    void run(p.id, async () => {
                      await settingsApi.changeProjectRole(workspaceId, brandId, p.id, next);
                      setStatus({ ok: true, text: `${p.name ?? p.email} is now ${roles.find((r) => r.id === next)?.name ?? "updated"}.` });
                    });
                  }}
                  className={selectClass}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm">{p.role.name}</span>
              )}
              {canManage ? (
                <Button variant="ghost" size="icon" aria-label={`Remove ${p.name ?? p.email} from this project`} onClick={() => setRemoving({ id: p.id, label: p.name ?? p.email, invite: false })} className="text-muted-foreground hover:text-destructive">
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {invitations.map((i) => (
          <li key={i.id} className={row}>
            <Person name={null} email={i.email} note={`Invited as ${i.role.name} · expires ${formatDate(i.expiresAt)}`} />
            {canManage ? (
              <Button variant="outline" size="sm" onClick={() => setRemoving({ id: i.id, label: i.email, invite: true })}>Revoke</Button>
            ) : null}
          </li>
        ))}
        {viaWorkspace.map((m) => (
          <li key={m.userId} className={row}>
            <Person name={m.name} email={m.email} />
            <span className="text-sm text-muted-foreground">{m.role} · every project</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="project-heading" className="flex flex-col gap-5">
      <SectionHeader
        id="project-heading"
        title="Project access"
        description="People working on this project. Someone invited here sees only this project, with the role you pick. Workspace owners and admins reach every project."
      />
      {canManage && state.kind === "ready" ? (
        <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Colleague&apos;s email</span>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Project role</span>
            <select value={pickedRole} onChange={(e) => setRoleId(e.target.value)} className={selectClass}>
              {roles.map((r) => (
                <option key={r.id} value={r.id} title={r.description ?? undefined}>{r.name}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy === "add" || !pickedRole}>
            <UserPlus /> {busy === "add" ? "Adding…" : "Add to project"}
          </Button>
        </form>
      ) : null}
      <div aria-live="polite" className="empty:hidden">
        {status ? (
          <p className={status.ok ? "text-sm text-success" : "text-sm text-destructive"}>
            {status.text}
            {status.link ? <Input readOnly value={status.link} onFocus={(e) => e.currentTarget.select()} className="mt-2 font-mono text-xs" /> : null}
          </p>
        ) : null}
      </div>
      {body}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing?.invite ? "Revoke invitation?" : "Remove from project?"}
        description={removing ? (removing.invite ? `The link sent to ${removing.label} will stop working.` : `${removing.label} will lose access to this project immediately.`) : ""}
        confirmLabel={removing?.invite ? "Revoke" : "Remove"}
        onConfirm={async () => {
          if (!removing) return;
          if (removing.invite) await settingsApi.revokeProjectInvitation(workspaceId, brandId, removing.id);
          else await settingsApi.removeFromProject(workspaceId, brandId, removing.id);
          reload();
        }}
      />
    </section>
  );
}

function Person({ name, email, note }: { name: string | null; email: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-foreground">{name ?? email}</p>
      <p className="truncate text-xs text-muted-foreground">{note ?? (name ? email : "")}</p>
    </div>
  );
}
