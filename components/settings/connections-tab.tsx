"use client";

import { useCallback, useState } from "react";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  errorMessage,
  settingsApi,
  type Connection,
  type Provider,
} from "@/components/settings/api";
import {
  ConfirmDialog,
  ListSkeleton,
  LoadError,
  SectionHeader,
  StatusPill,
  formatDate,
  useLoad,
} from "@/components/settings/shared";

const PURPOSE: Record<Provider, string> = {
  META: "Publish to your Facebook Pages and read Page insights.",
  INSTAGRAM: "Publish to your Instagram professional account and read its insights.",
  THREADS: "Publish to Threads and read post insights.",
  GOOGLE: "Read website traffic (Analytics) and search queries (Search Console).",
  REDDIT: "Find relevant conversations and post approved replies.",
  PINTEREST: "Publish approved Pins to your boards and read saves and clicks.",
};

type Props = {
  workspaceId: string;
  brandId: string;
  canManage: boolean;
  /** Result of the OAuth round-trip, read from the URL by the parent. */
  notice: { kind: "ok" | "error"; text: string } | null;
};

export function ConnectionsTab({ workspaceId, brandId, canManage, notice }: Props) {
  const fetcher = useCallback(() => settingsApi.connections(workspaceId, brandId), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Connection | null>(null);

  async function connect(provider: Provider) {
    setBusy(provider);
    setError(null);
    try {
      const { url } = await settingsApi.startConnect(workspaceId, brandId, provider);
      window.location.assign(url); // full-page redirect to the provider's consent screen
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading connections" />;
  else if (state.kind === "forbidden")
    body = <EmptyState icon={Plug} title="You can't see this brand's connections" description="Your role doesn't include access to this brand." />;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else
    body = (
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {state.data.providers.map((p) => {
          const accounts = state.data.connections.filter((c) => c.provider === p.provider);
          return (
            <li key={p.provider} className="flex flex-col gap-3 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{p.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{PURPOSE[p.provider]}</p>
                </div>
                {!p.configured ? (
                  <StatusPill tone="muted">Not set up</StatusPill>
                ) : canManage ? (
                  <Button
                    size="sm"
                    variant={accounts.length ? "outline" : "default"}
                    onClick={() => connect(p.provider)}
                    disabled={busy !== null}
                  >
                    {busy === p.provider ? "Opening…" : accounts.length ? "Reconnect" : "Connect"}
                  </Button>
                ) : null}
              </div>
              {accounts.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusPill tone={c.status === "ACTIVE" ? "good" : "bad"}>
                      {c.status === "ACTIVE" ? "Connected" : "Needs reconnect"}
                    </StatusPill>
                    <span className="truncate text-sm">{c.displayName}</span>
                    <span className="text-xs text-muted-foreground">since {formatDate(c.connectedAt)}</span>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(c)}>
                      Disconnect
                    </Button>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    );

  return (
    <section aria-labelledby="connections-heading" className="flex flex-col gap-5">
      <SectionHeader
        id="connections-heading"
        title="Connected accounts"
        description="This brand's own channel accounts. Tokens are stored encrypted and never shown."
      />
      {(notice || error) && (
        <p
          role="status"
          className={
            notice?.kind === "ok" && !error
              ? "rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm"
              : "rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
          }
        >
          {error ?? notice?.text}
        </p>
      )}
      {body}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Disconnect ${removing?.displayName ?? ""}?`}
        description="Agents will stop publishing to and reading from this account. You can reconnect any time."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          await settingsApi.disconnect(workspaceId, brandId, removing!.id);
          reload();
        }}
      />
    </section>
  );
}
