"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { CRM_LIMITS, DEAL_CLOSE_REASON_LABEL, DEAL_STAGE_LABEL, DEAL_STAGES, type DealDto, type DealStage, type PipelineDto } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { money } from "@/components/data/shared";
import { ownerName, useOwners } from "@/components/crm/customers/people";
import { DealDialog, DealExtras } from "@/components/crm/pipeline/deal-dialog";
import { closesDeal, HAND_CLOSE_REASONS, totalsLine } from "@/components/crm/pipeline/labels";
import { ApiError, errorMessage } from "@/components/settings/api";
import { ListSkeleton, selectClass, useLoad } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadFailed } from "@/components/ui/load-failed";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Column = PipelineDto["columns"][number];
type Reason = (typeof HAND_CLOSE_REASONS)[number];

/** The board's columns in stage order, whatever order the server sent (a missing stage shows empty). */
export function orderedColumns(p: PipelineDto): Column[] {
  return DEAL_STAGES.map((stage) => p.columns.find((c) => c.stage === stage) ?? { stage, deals: [], totals: [], more: false });
}

/** The currency a new deal starts with: the one most deals on the board use, else EUR. */
export function commonCurrency(p: PipelineDto | null): string {
  const n = new Map<string, number>();
  for (const c of p?.columns ?? []) for (const d of c.deals) if (d.currency) n.set(d.currency, (n.get(d.currency) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";
}

/**
 * The Pipeline tab of /crm (crm.manage): a column per stage with its deals and per-currency totals (Won and Lost: the
 * last 90 days). A deal moves with its card's stage menu (no dragging); Won and Lost ask why. After any change the
 * board is read again, so the totals stay the server's. `?deal=<id>` opens that deal.
 */
export function PipelineTab({ w, b }: { w: string; b: string }) {
  const [board, setBoard] = useState<PipelineDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ deal: DealDto; stage: DealStage } | null>(null);
  const [editing, setEditing] = useState<DealDto | "new" | null>(null);
  const owners = useOwners(w, b);
  const companiesFetch = useCallback(() => crmApi.companies(w, b).then((r) => r.companies), [w, b]);
  const companiesLoad = useLoad(companiesFetch).state;
  const companies = companiesLoad.kind === "ready" ? companiesLoad.data : null;

  const load = useCallback(() => {
    setFailed(false);
    crmApi.pipeline(w, b).then(
      (r) => setBoard(r.pipeline),
      () => setFailed(true),
    );
  }, [w, b]);
  useEffect(load, [load]);

  const urlDeal = useSearchParams().get("deal");
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!urlDeal || !board || handled.current === urlDeal) return;
    handled.current = urlDeal;
    const found = board.columns.flatMap((c) => c.deals).find((d) => d.id === urlDeal);
    if (found) setEditing(found);
    // An older closed deal isn't on the board: read it on its own.
    else crmApi.deal(w, b, urlDeal).then((r) => setEditing(r.deal), (e: unknown) => setError(errorMessage(e)));
  }, [urlDeal, board, w, b]);

  const move = async (deal: DealDto, stage: DealStage, reason?: { closedReason: Reason | null; closedNote: string | null }) => {
    setMoving(deal.id);
    setError(null);
    try {
      await crmApi.updateDeal(w, b, deal.id, { updatedAt: deal.updatedAt, stage, ...(reason ?? {}) });
      setClosing(null);
      load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "crm.changed") {
        // The dialog's copy of the deal is stale too: close it, and the board shows the deal as it is now.
        setClosing(null);
        setError("Someone changed this deal in the meantime. The board shows it as it is now; try again.");
        load();
      } else if (reason) throw new Error(errorMessage(e));
      else setError(errorMessage(e));
    } finally {
      setMoving(null);
    }
  };

  let body: React.ReactNode;
  if (failed) body = <LoadFailed what="the pipeline" onRetry={load} />;
  else if (!board) body = <ListSkeleton label="Loading the pipeline" rows={3} />;
  else
    body = (
      // Six columns side by side scroll sideways inside their own strip, never the page.
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3">
          {orderedColumns(board).map((col) => {
            const total = totalsLine(col.totals);
            const closed = closesDeal(col.stage);
            return (
              <section key={col.stage} aria-labelledby={`stage-${col.stage}-h`} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3">
                <header className="flex flex-col gap-0.5 px-1">
                  <h2 id={`stage-${col.stage}-h`} className="flex items-baseline justify-between gap-2 font-display text-base font-medium">
                    {DEAL_STAGE_LABEL[col.stage]}
                    <span className="text-xs font-normal tabular-nums text-muted-foreground">{col.deals.length}{col.more ? "+" : ""}</span>
                  </h2>
                  <p className="text-xs text-muted-foreground tabular-nums">{total ?? "No value yet"}</p>
                  {closed ? <p className="text-xs text-muted-foreground">Last 90 days</p> : null}
                </header>
                <ul className="flex flex-col gap-2">
                  {col.deals.map((d) => (
                    <li key={d.id} className="flex flex-col gap-1.5 rounded-xl border border-border bg-background p-3 text-sm">
                      <button type="button" className="text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setEditing(d)}>
                        {d.title}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {[d.customer?.displayName, d.company?.name, d.value ? (d.currency ? money(d.value, d.currency) : d.value) : null, ownerName(owners, d.ownerId)].filter(Boolean).join(" · ") || "No customer yet"}
                      </span>
                      {d.nextAction ? (
                        <span className="text-xs">
                          Next: {d.nextAction}
                          {d.nextActionDue ? <span className="text-muted-foreground"> · due {d.nextActionDue}</span> : null}
                        </span>
                      ) : null}
                      {d.closedReason ? <span className="text-xs text-muted-foreground">{DEAL_CLOSE_REASON_LABEL[d.closedReason]}{d.closedNote ? `: ${d.closedNote}` : ""}</span> : null}
                      <DealExtras deal={d} />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Stage
                        <select
                          className={cn(selectClass, "h-8 w-auto text-xs pointer-coarse:h-11")}
                          value={d.stage}
                          disabled={moving === d.id}
                          aria-label={`Move ${d.title}`}
                          onChange={(e) => {
                            const stage = e.target.value as DealStage;
                            if (closesDeal(stage)) setClosing({ deal: d, stage });
                            else void move(d, stage);
                          }}
                        >
                          {DEAL_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {DEAL_STAGE_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
                {col.more ? <p className="px-1 text-xs text-muted-foreground">More deals than shown here.</p> : null}
              </section>
            );
          })}
        </div>
      </div>
    );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">Enquiries and sales opportunities by stage. A sent or accepted quote moves its deal forward; nothing moves back by itself.</p>
        <Button disabled={!board} onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" />
          New deal
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {body}
      {editing ? (
        <DealDialog
          key={editing === "new" ? "new" : editing.id}
          w={w}
          b={b}
          deal={editing === "new" ? null : editing}
          companies={companies}
          owners={owners}
          defaultCurrency={commonCurrency(board)}
          onClose={() => setEditing(null)}
          onSaved={() => (setEditing(null), load())}
          onStale={load}
        />
      ) : null}
      {closing ? <CloseDialog deal={closing.deal} stage={closing.stage} onCancel={() => setClosing(null)} onConfirm={(r) => move(closing.deal, closing.stage, r)} /> : null}
    </>
  );
}

/** Won or Lost: why (a reason is required; "Quote accepted" is the quote's own), with an optional note. */
function CloseDialog({ deal, stage, onCancel, onConfirm }: { deal: DealDto; stage: DealStage; onCancel(): void; onConfirm(r: { closedReason: Reason | null; closedNote: string | null }): Promise<void> }) {
  // A win by hand needs no reason: the reasons are why a deal was lost.
  const won = stage === "WON";
  const [reason, setReason] = useState<Reason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{stage === "WON" ? "Mark the deal won" : "Mark the deal lost"}</DialogTitle>
          <DialogDescription>{deal.title}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!won && !reason) return;
            setBusy(true);
            setError(null);
            try {
              await onConfirm({ closedReason: won ? null : reason || null, closedNote: note.trim() || null });
            } catch (err) {
              setError(err instanceof Error ? err.message : errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {won ? null : (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Why?</span>
              <select className={cn(selectClass, "pointer-coarse:h-11")} value={reason} onChange={(e) => setReason(e.target.value as Reason)} required>
                <option value="" disabled>
                  Pick a reason
                </option>
                {HAND_CLOSE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {DEAL_CLOSE_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Note for the team (optional)</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={CRM_LIMITS.closedNote} rows={2} />
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (!won && !reason)}>
              {busy ? "Saving…" : stage === "WON" ? "Mark won" : "Mark lost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
