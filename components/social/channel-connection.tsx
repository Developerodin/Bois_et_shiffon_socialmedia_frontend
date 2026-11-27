"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ApiError, settingsApi, type Connection } from "@/components/settings/api";
import { StatusBadge } from "@/components/ui/status-badge";
import { accountNames, connectionState, providersOf } from "@/lib/social-channels";

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
 * Pages and Instagram), the ones that aren't connected under it on one short line (all of them in its tooltip). Manual publishing needs no connection data, so it shows even when the
 * role can't see connections; any other state shows only once the connections are read, never guessed.
 */
export function ChannelConnection({ filter, conns, detail = true, action }: { filter: string; conns: Conns; detail?: boolean; action?: ReactNode }) {
  const providers = providersOf(filter);
  if (!providers.length) return <StatusBadge quiet tone="muted">Manual publishing</StatusBadge>;
  if (conns === "hidden") return null;
  if (conns === "failed") return <span className="text-xs text-muted-foreground">Connection unavailable</span>;
  if (conns === null) return <span className="text-xs text-muted-foreground">Checking connection…</span>;
  const state = connectionState(providers, conns.list, conns.names);
  // With detail: who is connected (the Page and the Instagram handle each named), or what still isn't.
  const accounts = detail && state.kind === "connected" ? accountNames(providers, conns.list) : "";
  return (
    <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5">
      <span className="flex items-center gap-1.5">
        <StatusBadge quiet tone={state.tone}>
          {state.label}
        </StatusBadge>
        {action}
      </span>
      {accounts && (
        <span className="max-w-full truncate text-xs text-muted-foreground" title={accounts}>
          {accounts}
        </span>
      )}
      {detail && state.lines.length > 1 && state.kind !== "connected" && (
        <span className="max-w-full truncate text-xs text-muted-foreground" title={state.lines.map((l) => `${l.name}: ${l.label}`).join(" · ")}>
          {state.lines
            .filter((l) => l.tone !== "good")
            .map((l) => `${l.name}: ${l.label.toLowerCase()}`)
            .join(" · ")}
        </span>
      )}
    </span>
  );
}
