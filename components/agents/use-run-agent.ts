"use client";

import { useEffect, useRef, useState } from "react";
import { startRun, type AgentSummary } from "@/components/agents/api";
import { isRunCancelled } from "@/components/languages/languages";
import { ApiError, errorMessage } from "@/components/settings/api";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { loadPlanCredits } from "@/lib/plan-credits";

/**
 * Run an agent from its peek (AgentView, the agent drawer): the start, its price, the error to show, and the one-click
 * auto-run (`autoRun`: "Get ideas"). Nothing here runs on open or on a tab switch except `autoRun`, once per mount.
 * `onStarted`: the run started (AgentView then shows the latest run instead of the one a link named).
 */
export function useRunAgent({ workspaceId, brandId, agentKey, agent, autoRun = false, onRan, onStarted }: { workspaceId: string; brandId: string; agentKey: string; agent: AgentSummary | null; autoRun?: boolean; onRan: () => void; onStarted?: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = agent?.lastRun?.status === "RUNNING" || agent?.lastRun?.status === "QUEUED";
  const price = useRunPrice(workspaceId, agentKey);

  async function run() {
    setPending(true);
    setError(null);
    try {
      await startRun(workspaceId, brandId, agentKey);
      onStarted?.();
      onRan();
      void loadPlanCredits(workspaceId, true);
    } catch (e) {
      if (isRunCancelled(e)) return;
      setError(e instanceof ApiError && e.status === 403 ? "Your role can't run agents. Ask an owner or admin." : errorMessage(e, "Couldn't start the agent. Try again."));
    } finally {
      setPending(false);
    }
  }

  // Once per mount; the ref stops React's dev double-effect from starting two paid runs.
  // A run already going counts as the auto-run: the ref is set first, so the end of that run
  // (the poll hands a new `agent`) doesn't start a second paid one.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoRun || autoStarted.current || !agent) return;
    autoStarted.current = true;
    if (running) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the agent has loaded
  }, [autoRun, agent]);

  return { pending, error, running, price, run };
}
