"use client";

import { useCallback, useState } from "react";
import { Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  errorMessage,
  settingsApi,
  type Member,
  type MemberStatus,
  type Role,
} from "@/components/settings/api";
import {
  ConfirmDialog,
  ListSkeleton,
  LoadError,
  SectionHeader,
  StatusPill,
  formatDate,
  selectClass,
  useLoad,
} from "@/components/settings/shared";

const STATUS: Record<MemberStatus, { tone: "good" | "warn" | "muted"; label: string }> = {
  ACTIVE: { tone: "good", label: "Active" },
  INVITED: { tone: "warn", label: "Invited" },
  DISABLED: { tone: "muted", label: "Disabled" },
};

type Props = {
  workspaceId: string;
  can: Set<string>;
  roles: Role[];
  onRolesChanged: () => void;
};

export function MembersTab({ workspaceId, can, roles, onRolesChanged }: Props) {
  const fetcher = useCallback(
    () => settingsApi.members(workspaceId).then((d) => d.members ?? []),
    [workspaceId],
  );
  const { state, reload } = useLoad(fetcher);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const manage = can.has("members.manage") && roles.length > 0;

  async function changeRole(member: Member, roleId: string) {
    if (roleId === member.role.id) return;
    setPending(member.id);
    setStatus(null);
    try {
      await settingsApi.updateMember(workspaceId, member.id, roleId);
      const role = roles.find((r) => r.id === roleId);
      setStatus({ ok: true, text: `${member.name ?? member.email} is now ${role?.name ?? "updated"}.` });
      reload();
      onRolesChanged();
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err, "Couldn't change the role.") });
    } finally {
      setPending(null);
    }
  }

  function roleControl(m: Member) {
    if (!manage) return <span className="text-sm text-foreground">{m.role.name}</span>;
    return (
      <select
        aria-label={`Role for ${m.name ?? m.email}`}
        value={m.role.id}
        disabled={pending === m.id}
        onChange={(e) => void changeRole(m, e.target.value)}
        className={selectClass}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    );
  }

  function removeControl(m: Member) {
    if (!can.has("members.manage")) return null;
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${m.name ?? m.email}`}
        onClick={() => setRemoving(m)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    );
  }

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading members" />;
  else if (state.kind === "forbidden")
    body = <EmptyState icon={Users} title="You can't view members" description="Your role doesn't include members.read." />;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else if (state.data.length === 0)
    body = <EmptyState icon={Users} title="No members yet" description="Invite someone from the Invitations tab." />;
  else {
    const members = state.data;
    body = (
      <>
        {/* Desktop: table */}
        <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Member</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
                <th scope="col" className="w-56 px-5 py-3 font-medium">Role</th>
                <th scope="col" className="px-5 py-3 font-medium">Joined</th>
                <th scope="col" className="w-14 px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-foreground">{m.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill tone={STATUS[m.status].tone}>{STATUS[m.status].label}</StatusPill>
                  </td>
                  <td className="px-5 py-4">{roleControl(m)}</td>
                  <td className="px-5 py-4 text-muted-foreground">{formatDate(m.joinedAt)}</td>
                  <td className="px-5 py-4 text-right">{removeControl(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards */}
        <ul className="flex flex-col gap-3 md:hidden">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{m.name ?? m.email}</p>
                  {m.name ? <p className="truncate text-xs text-muted-foreground">{m.email}</p> : null}
                </div>
                <StatusPill tone={STATUS[m.status].tone}>{STATUS[m.status].label}</StatusPill>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">{roleControl(m)}</div>
                {removeControl(m)}
              </div>
              <p className="text-xs text-muted-foreground">Joined {formatDate(m.joinedAt)}</p>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-5">
      <SectionHeader
        id="members-heading"
        title="Members"
        description="Everyone with access to this workspace and the role they hold."
      />
      <p
        aria-live="polite"
        className={status?.ok ? "text-sm text-success empty:hidden" : "text-sm text-destructive empty:hidden"}
      >
        {status?.text}
      </p>
      {body}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove member?"
        description={
          removing
            ? `${removing.name ?? removing.email} will lose access to this workspace immediately.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          await settingsApi.removeMember(workspaceId, removing.id);
          setStatus({ ok: true, text: `${removing.name ?? removing.email} was removed.` });
          reload();
          onRolesChanged();
        }}
      />
    </section>
  );
}
