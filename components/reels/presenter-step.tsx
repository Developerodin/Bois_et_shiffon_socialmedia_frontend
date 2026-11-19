"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { ReelDetail, ReelOptions } from "@/shared";
import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { fetchShared } from "@/components/workspace/use-job";
import { isRepeatClick } from "@/lib/presser";
import { reelOptionsUrl } from "./api";
import { STAGE_LABELS, presenterState } from "./labels";
import type { PlanChat } from "./plan-step";
import { editLock, presenterChoice, presenterName } from "./reel";
import type { ReelSave } from "./use-reel-save";
import { usePresenterRemove } from "./use-reels";

const PresenterDialog = dynamic(() => import("./presenter-dialog").then((m) => m.PresenterDialog), { ssr: false });

// Copy: the phone's actor.* (mobile reels.json).
/**
 * The Presenter step: no presenter or one of the brand's finished presenters. A presenter is saved through the
 * scriptwriter (it picks the scenes they speak), "No presenter" through the plain save. Running and failed presenters
 * show below the choice; a failed one can be removed.
 */
export function PresenterStep({ workspaceId, brandId, detail, options, canCreate, chat, save }: {
  workspaceId: string;
  brandId: string;
  detail: ReelDetail;
  options: ReelOptions | null | undefined;
  canCreate: boolean;
  chat: PlanChat;
  save: ReelSave;
}) {
  const plan = detail.plan;
  const [picked, setPicked] = useState<string | null>(null);
  // Which path the last Use took, so the error shown is that path's (the chat's error also belongs to the Plan step).
  const [via, setVia] = useState<"chat" | "save" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  const reload = useCallback(() => fetchShared(reelOptionsUrl(workspaceId, brandId), true), [workspaceId, brandId]);
  const removal = usePresenterRemove(workspaceId, brandId, reload);
  const { sending, stage, error: chatError } = chat.stream;

  if (!plan) return <p className="text-sm text-muted-foreground">Plan a reel first: a presenter is added to a reel&apos;s script.</p>;

  const lock = editLock(detail);
  if (lock !== null || !canCreate) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm"><span className="text-muted-foreground">Presenter: </span>{presenterName(plan, options)}</p>
        {lock ? <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">{lock}</p> : null}
        {!canCreate ? <p className="text-sm text-muted-foreground">Your role can view reels but not make them.</p> : null}
      </div>
    );
  }

  const done = options?.presenters.filter((p) => p.status === "DONE") ?? [];
  const others = options?.presenters.filter((p) => p.status !== "DONE") ?? [];
  const value = picked ?? presenterChoice(plan, options);
  const changed = value !== plan.presenter;
  const gone = plan.presenter !== "none" && !!options && presenterChoice(plan, options) !== plan.presenter;
  const chosen = done.find((p) => p.id === value);
  const busy = sending || save.saving;
  // The page-wide save error only when this step pressed save; another step's error isn't this step's to show.
  const shown = via === "chat" ? chatError : via === "save" ? save.error : null;

  async function use() {
    if (!plan) return;
    save.clear();
    if (chosen) {
      setVia("chat");
      await chat.send(detail.version, { kind: "presenter", presenterId: chosen.id, message: chosen.name });
    } else {
      setVia("save");
      if (await save.save(detail.version, { ...plan, presenter: "none" })) setPicked(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">Pick one of your brand&apos;s presenters to speak on camera, or keep the reel on your product.</p>
      {gone ? <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">Presenter removed: pick another.</p> : null}

      <ChoiceCards
        legend="Presenter"
        name="reel-presenter"
        columns={2}
        value={value}
        onChange={setPicked}
        options={[
          { value: "none", title: "No presenter", description: "Focus solely on furniture visuals, textures and studio audio.", meta: "Recommended" },
          ...done.map((p) => ({ value: p.id, title: p.name, description: presenterState(p, options?.presenterCredits ?? 0) })),
        ]}
      />

      {others.length > 0 ? (
        <ul aria-label="Presenters not ready" className="flex flex-col gap-2">
          {others.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2 text-sm">
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground">{presenterState(p, options?.presenterCredits ?? 0)}</span>
                {p.status === "FAILED" ? (
                  <Button type="button" variant="ghost" size="sm" disabled={removal.removing !== null} onClick={() => void removal.remove(p.id)} aria-label={`Remove ${p.name}`}>
                    Remove
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">{sending && via === "chat" && stage ? STAGE_LABELS[stage] : ""}</p>

      <div className="flex flex-wrap items-center gap-3">
        {changed ? (
          <Button type="button" disabled={busy || !options} onClick={(e) => { if (!isRepeatClick(e)) void use(); }}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            Use this presenter
          </Button>
        ) : null}
        {options ? (
          <Button type="button" variant="outline" onClick={() => { setDialogMounted(true); setDialogOpen(true); }}>
            Create a presenter
          </Button>
        ) : null}
      </div>

      <p role="alert" className="text-sm text-destructive empty:hidden">{sending ? "" : (removal.error ?? shown ?? "")}</p>
      {dialogMounted && options ? <PresenterDialog workspaceId={workspaceId} brandId={brandId} options={options} open={dialogOpen} onOpenChange={setDialogOpen} /> : null}
    </div>
  );
}
