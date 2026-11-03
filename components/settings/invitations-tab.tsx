"use client";

import { useCallback, useRef, useState } from "react";
import { rememberFocus } from "@/components/settings/return-focus";
import { Check, Copy, Mail, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  errorMessage,
  settingsApi,
  type EmailDelivery,
  type Invitation,
  type InvitationStatus,
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

const STATUS: Record<InvitationStatus, { tone: "good" | "warn" | "muted" | "bad"; label: string }> = {
  PENDING: { tone: "warn", label: "Pending" },
  ACCEPTED: { tone: "good", label: "Accepted" },
  REVOKED: { tone: "muted", label: "Revoked" },
  EXPIRED: { tone: "bad", label: "Expired" },
};

const DELIVERY: Record<EmailDelivery, string> = {
  sent: "Invitation email sent.",
  queued: "Invitation email queued — it should arrive shortly.",
  not_configured: "Email not configured — share this link.",
};

type Props = { workspaceId: string; roles: Role[] };

export function InvitationsTab({ workspaceId, roles }: Props) {
  const fetcher = useCallback(
    () => settingsApi.invitations(workspaceId).then((d) => d.invitations ?? []),
    [workspaceId],
  );
  const { state, reload } = useLoad(fetcher);
  const [inviting, setInviting] = useState(false);
  const restoreFocus = useRef<(() => void) | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading invitations" />;
  else if (state.kind === "forbidden")
    body = (
      <EmptyState
        icon={Mail}
        title="You can't manage invitations"
        description="Your role doesn't include invitations.manage."
      />
    );
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else if (state.data.length === 0)
    body = (
      <EmptyState
        icon={Mail}
        title="No invitations yet"
        description="Invite a teammate by email. You'll get a link you can share directly too."
      />
    );
  else
    body = (
      <ul className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
        {state.data.map((inv) => (
          <li
            key={inv.id}
            className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{inv.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {inv.role.name}
                {inv.project ? ` on ${inv.project}` : ""}
                {inv.invitedBy ? ` · invited by ${inv.invitedBy}` : ""} · expires{" "}
                {formatDate(inv.expiresAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill tone={STATUS[inv.status].tone}>{STATUS[inv.status].label}</StatusPill>
              {inv.status === "PENDING" ? (
                <Button variant="outline" size="sm" onClick={() => setRevoking(inv)}>
                  Revoke
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );

  return (
    <section aria-labelledby="invitations-heading" className="flex flex-col gap-5">
      <SectionHeader
        id="invitations-heading"
        title="Invitations"
        description="People you've asked to join the workspace or one of its projects. Pending links can be revoked at any time. To invite someone to one project only, use Project access."
        action={
          <Button
            onClick={() => {
              restoreFocus.current = rememberFocus("settings-panel-invitations");
              setInviting(true);
            }}
          >
            <UserPlus /> Invite
          </Button>
        }
      />
      {body}
      {inviting ? (
        <InviteDialog
          workspaceId={workspaceId}
          roles={roles}
          onClose={() => {
            setInviting(false);
            restoreFocus.current?.();
          }}
          onInvited={reload}
        />
      ) : null}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title="Revoke invitation?"
        description={revoking ? `The link sent to ${revoking.email} will stop working.` : ""}
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (!revoking) return;
          await settingsApi.revokeInvitation(workspaceId, revoking.id);
          reload();
        }}
      />
    </section>
  );
}

function InviteDialog({
  workspaceId,
  roles,
  onClose,
  onInvited,
}: {
  workspaceId: string;
  roles: Role[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(
    () => (roles.find((r) => r.slug === "member") ?? roles[0])?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; delivery: EmailDelivery } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await settingsApi.invite(workspaceId, { email: email.trim(), roleId });
      setResult({ url: res.inviteUrl, delivery: res.emailDelivery });
      onInvited();
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the invitation."));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      setError("Couldn't copy automatically — select the link and copy it.");
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result ? "Invitation created" : "Invite a teammate"}</DialogTitle>
          <DialogDescription>
            {result
              ? DELIVERY[result.delivery]
              : "They'll get a link to join this workspace with the role you choose."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Invite link</span>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={result.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </label>
            <p aria-live="polite" className="text-sm text-destructive empty:hidden">
              {error}
            </p>
            <span className="sr-only" aria-live="polite">
              {copied ? "Link copied to clipboard" : ""}
            </span>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Email</span>
              <Input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Role</span>
              <select
                required
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={selectClass}
                disabled={roles.length === 0}
              >
                {roles.length === 0 ? <option value="">No roles available</option> : null}
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <p aria-live="polite" className="text-sm text-destructive empty:hidden">
              {error}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !roleId}>
                {busy ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
