"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, settingsApi, type Permission, type Role, type RoleScope } from "@/components/settings/api";
import { LoadError, type Load } from "@/components/settings/shared";

type Props = {
  workspaceId: string;
  role: Role | null;
  catalog: Load<Permission[]>;
  onRetryCatalog: () => void;
  onClose: () => void;
  onSaved: () => void;
};

export function RoleDialog({ workspaceId, role, catalog, onRetryCatalog, onClose, onSaved }: Props) {
  const id = useId();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [scope, setScope] = useState<RoleScope>(role?.scope ?? "PROJECT");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the role a name.");
      return;
    }
    setBusy(true);
    setError(null);
    // A project role can't hold workspace permissions (ones ticked before switching are dropped).
    const allowed = new Set(catalog.kind === "ready" ? catalog.data.filter((p) => scope === "WORKSPACE" || p.scope === "PROJECT").map((p) => p.key) : []);
    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      scope,
      permissions: [...selected].filter((k) => allowed.has(k)),
    };
    try {
      if (role) await settingsApi.updateRole(workspaceId, role.id, body);
      else await settingsApi.createRole(workspaceId, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the role."));
      setBusy(false);
    }
  }

  const groups = new Map<string, Permission[]>();
  if (catalog.kind === "ready") {
    for (const p of catalog.data) {
      if (scope === "PROJECT" && p.scope !== "PROJECT") continue;
      groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
          <DialogDescription>
            Choose a name and the permissions members with this role get.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} disabled={role?.isSystem} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Description (optional)</span>
            <Textarea
              disabled={role?.isSystem}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-16"
              maxLength={500}
            />
          </label>

          {role ? null : (
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1.5 text-muted-foreground">Used for</legend>
              {(
                [
                  ["PROJECT", "One project", "Given to someone on a project they're invited to"],
                  ["WORKSPACE", "The whole workspace", "Applies to every project, plus any workspace permissions"],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="radio"
                    name={`${id}-scope`}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-sm text-muted-foreground">
              Permissions <span className="font-mono text-xs">({selected.size} selected)</span>
            </legend>
            {catalog.kind === "loading" ? (
              <p className="text-sm text-muted-foreground" aria-busy="true">
                Loading permissions…
              </p>
            ) : catalog.kind === "ready" ? (
              [...groups.entries()].map(([category, perms]) => (
                <div key={category} className="rounded-xl border border-border p-4">
                  <p className="mb-3 text-xs font-medium text-primary">
                    {category}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {perms.map((p) => (
                      <label
                        key={p.key}
                        htmlFor={`${id}-${p.key}`}
                        className="flex cursor-pointer items-start gap-2.5 text-sm"
                      >
                        <input
                          id={`${id}-${p.key}`}
                          type="checkbox"
                          checked={selected.has(p.key)}
                          onChange={() => toggle(p.key)}
                          className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span>
                          <span className="block font-mono text-xs text-foreground">{p.key}</span>
                          <span className="block text-xs text-muted-foreground">
                            {p.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <LoadError message="Couldn't load the permission list." onRetry={onRetryCatalog} />
            )}
          </fieldset>

          <p aria-live="polite" className="text-sm text-destructive empty:hidden">
            {error}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || catalog.kind !== "ready"}>
              {busy ? "Saving…" : role ? "Save changes" : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
