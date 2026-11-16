"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { startRun, type AgentSummary, type RunStatus } from "@/components/agents/api";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<RunStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
};

const STATUS_DOT: Record<RunStatus, string> = {
  QUEUED: "bg-warning",
  RUNNING: "bg-primary status-pulse",
  SUCCEEDED: "bg-success",
  FAILED: "bg-destructive",
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  agent: AgentSummary;
  workspaceId: string;
  brandId: string;
  onRunStarted: () => void;
};

export function AgentTile({ agent, workspaceId, brandId, onRunStarted }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = agent.lastRun?.status ?? null;
  const active = status === "QUEUED" || status === "RUNNING";
  const when = formatWhen(agent.lastRun?.finishedAt ?? agent.lastRun?.startedAt ?? null);

  async function runNow() {
    setPending(true);
    setError(null);
    try {
      await startRun(workspaceId, brandId, agent.key);
      onRunStarted();
    } catch (err) {
      setError(errorMessage(err, "Could not start a run. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      className={cn(
        "flex h-full flex-col gap-4 p-5 transition-colors",
        active && "border-primary/50",
        !agent.enabled && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-medium leading-tight tracking-tight">
          {agent.name}
        </h3>
        <span className="flex shrink-0 items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full",
              status ? STATUS_DOT[status] : "bg-muted-foreground",
            )}
            aria-hidden="true"
          />
          {agent.enabled ? (status ? STATUS_LABEL[status] : "Idle") : "Disabled"}
        </span>
      </div>

      <p className="flex-1 text-sm text-muted-foreground">{agent.description}</p>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="font-mono text-xs text-muted-foreground">
          {when ? `Last run ${when}` : "Never run"}
        </p>
        <Button
          size="sm"
          onClick={() => void runNow()}
          disabled={pending || active || !agent.enabled}
          aria-label={`Run ${agent.name} now`}
        >
          <Play aria-hidden="true" />
          {pending ? "Starting…" : "Run now"}
        </Button>
      </div>
      {status === "FAILED" && agent.lastRun?.error ? (
        <p className="line-clamp-2 text-xs text-destructive" title={agent.lastRun.error}>
          Last run failed: {agent.lastRun.error}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
