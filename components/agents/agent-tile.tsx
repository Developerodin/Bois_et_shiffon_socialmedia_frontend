"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { startRun, type AgentSummary, type RunStatus } from "@/components/agents/api";
import { errorMessage } from "@/components/settings/api";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadPlanCredits, withPrice } from "@/lib/plan-credits";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { isRunCancelled } from "@/components/languages/languages";

const STATUS_LABEL: Record<RunStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
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
  const price = useRunPrice(workspaceId, agent.key);
  const label = pending ? "Starting…" : withPrice("Run now", price);

  const status = agent.lastRun?.status ?? null;
  const active = status === "QUEUED" || status === "RUNNING";
  const when = formatWhen(agent.lastRun?.finishedAt ?? agent.lastRun?.startedAt ?? null);

  async function runNow() {
    setPending(true);
    setError(null);
    try {
      await startRun(workspaceId, brandId, agent.key);
      onRunStarted();
      void loadPlanCredits(workspaceId, true);
    } catch (err) {
      if (!isRunCancelled(err)) setError(errorMessage(err, "Could not start a run. Try again."));
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
        <StatusBadge status={agent.enabled ? status : null} className="shrink-0">
          {agent.enabled ? (status ? STATUS_LABEL[status] : "Idle") : "Disabled"}
        </StatusBadge>
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
          aria-label={`${label}, ${agent.name}`}
        >
          <Play aria-hidden="true" />
          {label}
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
