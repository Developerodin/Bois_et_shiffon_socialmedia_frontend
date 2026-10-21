"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Plug, X } from "lucide-react";
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
  notice: { kind: "ok" | "error"; text: string; names?: string[] } | null;
};

export function ConnectionsTab({ workspaceId, brandId, canManage, notice }: Props) {
  const fetcher = useCallback(() => settingsApi.connections(workspaceId, brandId), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [shown, setShown] = useState(notice);
  // Hide a disconnected account at once; the list refetch from the database can take seconds.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const fresh = new Set(shown?.kind === "ok" ? shown.names : []);

  // The OAuth result arrives as one-time URL params; drop them so a refresh or a shared link
  // doesn't replay the message.
  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("connectError");
    window.history.replaceState(window.history.state, "", url);
  }, [notice]);

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
          const accounts = state.data.connections.filter((c) => c.provider === p.provider && !gone.has(c.id));
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
                <div
                  key={c.id}
                  className={
                    fresh.has(c.displayName) && c.status === "ACTIVE"
                      ? "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/50 bg-success/10 px-4 py-2.5"
                      : "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-transparent bg-muted/40 px-4 py-2.5"
                  }
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusPill tone={c.status === "ACTIVE" ? "good" : "bad"}>
                      {c.status === "ACTIVE" ? "Connected" : "Needs reconnect"}
                    </StatusPill>
                    <span className="truncate text-sm">{c.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {fresh.has(c.displayName) && c.status === "ACTIVE" ? "just now" : `since ${formatDate(c.connectedAt)}`}
                    </span>
                  </div>
                  {c.status !== "ACTIVE" && (
                    <p className="basis-full text-xs text-muted-foreground">
                      {c.lastError ?? "This account's access stopped working."} Posts to it fail until you press Reconnect.
                    </p>
                  )}
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
      {(shown || error) && (
        <div
          role={error || shown?.kind === "error" ? "alert" : "status"}
          className={
            shown?.kind === "ok" && !error
              ? "flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm"
              : "flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
          }
        >
          {shown?.kind === "ok" && !error ? (
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          )}
          <p className="flex-1">
            {error ?? shown?.text}
            {shown?.kind === "ok" && !error && shown.names && " Agents can now use this account for this brand."}
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setShown(null);
              setError(null);
            }}
            className="-m-2 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      {body}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Disconnect ${removing?.displayName ?? ""}?`}
        description="Agents will stop publishing to and reading from this account, and posts scheduled to it are cancelled (they stay approved, ready to schedule again). You can reconnect any time."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          const c = removing!;
          const { cancelled } = await settingsApi.disconnect(workspaceId, brandId, c.id);
          setGone((g) => new Set(g).add(c.id));
          setError(null);
          setShown({
            kind: "ok",
            text: `Disconnected ${c.displayName}. Agents will no longer use it.${cancelled ? ` ${cancelled} scheduled post${cancelled === 1 ? " was" : "s were"} cancelled; schedule ${cancelled === 1 ? "it" : "them"} again from the calendar.` : ""}`,
          });
          reload();
        }}
      />
    </section>
  );
}
