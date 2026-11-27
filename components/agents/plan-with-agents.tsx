"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Sparkles } from "lucide-react";
import { ensureWorkLanguage, isRunCancelled } from "@/components/languages/languages";
import { errorMessage, request } from "@/components/settings/api";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import type { Conns } from "@/components/social/channel-connection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { fetchShared, useBrandData } from "@/components/workspace/use-job";
import { channelsFor, PLAN_CHANNELS, plannerChainBody, preselectedChannels, type PlanChannelKey } from "@/lib/agent-workflow";
import { loadPlanCredits, withPrice, workspaceIdOf } from "@/lib/plan-credits";
import { connectionState, providersOf } from "@/lib/social-channels";

// Module-level: useBrandData restarts its polling when `pick` changes.
const pickShortlisted = (d: { opportunities: { status: string }[] }) => d.opportunities.filter((o) => o.status === "SHORTLISTED").length;
// The Planner already queued or running (Start would join or double it), and whether it may plan LinkedIn and X.
const pickPlanner = (d: { agents: { key: string; lastRun: { status: string } | null }[]; plannerHandChannels?: boolean }) => {
  const s = d.agents.find((a) => a.key === "planner")?.lastRun?.status;
  return { running: s === "QUEUED" || s === "RUNNING", hand: d.plannerHandChannels === true };
};

/** A channel's line in the dialog: published by hand, connected, or draft only (not connected); nothing while unknown. */
function channelNote(c: (typeof PLAN_CHANNELS)[number], conns: Conns, hand: boolean) {
  if (c.byHand && !hand) return <StatusBadge quiet tone="muted">Not planned by the agents yet</StatusBadge>;
  if (c.byHand) return <StatusBadge quiet tone="muted">Published by hand</StatusBadge>;
  if (!conns || typeof conns !== "object") return null;
  const state = connectionState(providersOf(c.filter), conns.list, conns.names);
  return state.kind === "connected" ? <StatusBadge quiet tone="good">Connected</StatusBadge> : <StatusBadge quiet tone="muted">Draft only</StatusBadge>;
}

/**
 * "Plan with agents": pick the channels, see how many ideas are shortlisted, then Start runs the Planner with the posts
 * chain on (Planner → Brief writer → Creator → Quality, as the phone's Generate calendar). With nothing shortlisted it
 * offers Find ideas (Scout) instead. `filter`: a calendar channel filter to preselect (a group preselects its channels).
 * Only for roles that can run agents (agents.run); others get nothing.
 */
export function PlanWithAgents({ base, perms, filter, conns = "hidden", label = "Plan with agents", variant = "default", labelClassName }: { base: string; perms: string[]; filter?: string; conns?: Conns; label?: string; variant?: "default" | "secondary" | "outline"; /** e.g. sr-only on a narrow toolbar, leaving the icon. */ labelClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PlanChannelKey[]>(() => preselectedChannels(filter));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const canRun = perms.includes("agents.run");
  const shortlisted = useBrandData(base, "opportunities", pickShortlisted as (d: never) => number, canRun && open).data;
  const planner = useBrandData(base, "agents", pickPlanner as (d: never) => { running: boolean; hand: boolean }, canRun && open && perms.includes("agents.read")).data;
  const hand = planner?.hand ?? false;
  const offered = (k: PlanChannelKey) => hand || !PLAN_CHANNELS.find((c) => c.key === k)!.byHand;
  const workspaceId = workspaceIdOf(base);
  const planPrice = useRunPrice(workspaceId, "planner");
  const scoutPrice = useRunPrice(workspaceId, "scout");

  const change = useCallback(
    (o: boolean) => {
      if (busy) return;
      if (o) {
        setPicked(preselectedChannels(filter, hand));
        setError(null);
        setStarted(null);
      }
      setOpen(o);
    },
    [busy, filter, hand],
  );

  async function start(agent: "planner" | "scout") {
    setBusy(true);
    setError(null);
    try {
      await ensureWorkLanguage(base);
      await request(`${base}/agents/${agent}/runs`, { method: "POST", body: agent === "planner" ? plannerChainBody(channelsFor(picked.filter((k) => offered(k)))) : "{}" });
      if (workspaceId) void loadPlanCredits(workspaceId, true);
      // The agent strips and panels share this list: they see the run at once and poll while it goes.
      void fetchShared(`${base}/agents`, true).catch(() => undefined);
      setStarted(agent === "planner" ? "The agents are planning your posts. Each one gets its brief, draft and quality check, then waits for your approval." : "Scout is finding ideas. Shortlist the ones you like, then plan them here.");
    } catch (e) {
      if (!isRunCancelled(e)) setError(errorMessage(e, agent === "planner" ? "Couldn't start the Planner. Try again." : "Couldn't start Scout. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!canRun) return null;
  const chosen = picked.filter((k) => offered(k));
  const toggle = (k: PlanChannelKey) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => change(true)}>
        <Sparkles aria-hidden="true" />
        <span className={labelClassName}>{label}</span>
      </Button>
      <Dialog open={open} onOpenChange={change}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan with agents</DialogTitle>
            <DialogDescription>The Planner turns your shortlisted ideas into dated posts. The Brief writer, Creator and Quality check then prepare each post for your approval.</DialogDescription>
          </DialogHeader>
          {started ? (
            <p role="status" className="text-sm">{started}</p>
          ) : (
            <>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">Channels</legend>
                {PLAN_CHANNELS.map((c) => (
                  <label key={c.key} className="flex min-h-9 items-center gap-3 rounded-md px-1 text-sm hover:bg-muted pointer-coarse:min-h-11">
                    <input type="checkbox" className="size-4 accent-primary" checked={offered(c.key) && picked.includes(c.key)} disabled={!offered(c.key)} onChange={() => toggle(c.key)} />
                    <span className="flex-1">{c.label}</span>
                    {channelNote(c, conns, hand)}
                  </label>
                ))}
              </fieldset>
              <p className="text-sm text-muted-foreground">
                {shortlisted === null ? "Checking your ideas…" : shortlisted === 1 ? "1 shortlisted idea" : `${shortlisted} shortlisted ideas`}
                {" · "}
                <Link href="/?peek=ideas" className="text-foreground underline underline-offset-2">
                  Shortlist more
                </Link>
              </p>
            </>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            {started ? (
              <Button size="sm" onClick={() => change(false)}>
                Done
              </Button>
            ) : shortlisted === 0 ? (
              <Button size="sm" onClick={() => void start("scout")} disabled={busy}>
                {busy && <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />}
                {withPrice("Find ideas first", scoutPrice)}
              </Button>
            ) : (
              <Button size="sm" onClick={() => void start("planner")} disabled={busy || !chosen.length || shortlisted === null || planner?.running}>
                {(busy || planner?.running) && <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />}
                {planner?.running ? "Planning posts…" : withPrice("Start", planPrice)}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
