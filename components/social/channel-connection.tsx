"use client";

import { useEffect, useState } from "react";
import { ApiError, settingsApi, type Connection } from "@/components/settings/api";
import { StatusBadge } from "@/components/ui/status-badge";
import { connectionState, providersOf } from "@/lib/social-channels";

/** Connections as the channel views show them: the list, "hidden" (the role can't read them), "failed", or null while loading. */
export type Conns = { list: Connection[]; names: Map<string, string> } | "hidden" | "failed" | null;

/**
 * The brand's connections (GET connections) for the Social & Content page and a channel's calendar. Only for roles that
 * hold CONNECTIONS_READ (`canSee`); a 403 reads as "hidden", not an error. Read once per mount.
 */
export function useChannelConnections(workspaceId: string, brandId: string, canSee: boolean): Conns {
  const [conns, setConns] = useState<Conns>(canSee ? null : "hidden");
  useEffect(() => {
    if (!canSee) return;
    let live = true;
    settingsApi.connections(workspaceId, brandId).then(
      (r) => live && setConns({ list: r.connections, names: new Map(r.providers.map((p) => [p.provider, p.label])) }),
      (e) => live && setConns(e instanceof ApiError && e.status === 403 ? "hidden" : "failed"),
    );
    return () => {
      live = false;
    };
  }, [workspaceId, brandId, canSee]);
  return conns;
}

/**
 * A channel's (or channel group's) connection state as a badge, and, for a group with two connections (Meta: Facebook
 * Pages and Instagram), each one's state under it. Manual publishing needs no connection data, so it shows even when the
 * role can't see connections; any other state shows only once the connections are read, never guessed.
 */
export function ChannelConnection({ filter, conns, detail = true }: { filter: string; conns: Conns; detail?: boolean }) {
  const providers = providersOf(filter);
  if (!providers.length) return <StatusBadge quiet tone="muted">Manual publishing</StatusBadge>;
  if (conns === "hidden") return null;
  if (conns === "failed") return <span className="text-xs text-muted-foreground">Connection unavailable</span>;
  if (conns === null) return <span className="text-xs text-muted-foreground">Checking connection…</span>;
  const state = connectionState(providers, conns.list, conns.names);
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <StatusBadge quiet tone={state.tone}>
        {state.label}
      </StatusBadge>
      {detail && state.lines.length > 1 && <span className="text-xs text-muted-foreground">{state.lines.map((l) => `${l.name}: ${l.label}`).join(" · ")}</span>}
    </span>
  );
}
