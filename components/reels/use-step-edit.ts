"use client";

import { useState } from "react";
import type { PlanResult, ReelDetail, ReelPlan } from "@/shared";
import { adoptRefusedVersion } from "./reel";
import { REEL_CHANGED, type ReelSave } from "./use-reel-save";

type Edit<T> = { version: number; items: T[] };

/**
 * The edit state the Photos and Script steps share: an edit is `{ version, items }` (one item per scene), its version
 * set from the reel on the first change so a plan that moved meanwhile gets the server's 409 and the edit stays. It
 * is dropped when a re-read plan has another scene count (`droppedNote` says so), and after a 409 (once the re-read
 * lands) it adopts the re-read version so "save again" works; at no other time. The page-wide save error shows here
 * only after this step's own save attempt. Call before any early return.
 * `scenes` is the plan's scene count, null without a plan.
 */
export function useStepEdit<T>(detail: ReelDetail, save: ReelSave, scenes: number | null, droppedNote: string) {
  const [edit, setEdit] = useState<Edit<T> | null>(null);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  // Set when this step's save failed; settled once the save (and its re-read) ends.
  const [failed, setFailed] = useState(false);

  if (edit && scenes !== null && edit.items.length !== scenes) {
    setEdit(null);
    setNote(droppedNote);
  }

  if (edit && failed && !save.saving) {
    setFailed(false);
    const next = adoptRefusedVersion(edit, save.errorCode === REEL_CHANGED, detail.version, scenes ?? 0);
    if (next !== edit) setEdit(next);
  }

  const change = (items: T[]) => {
    setNote("");
    setEdit({ version: edit?.version ?? detail.version, items });
  };

  /** One save of `plan` at `version`; a refused one is remembered so the edit can adopt the re-read version. */
  async function send(version: number, plan: ReelPlan): Promise<PlanResult | null> {
    setTried(true);
    save.clear();
    const out = await save.save(version, plan);
    if (!out) setFailed(true);
    return out;
  }

  /** Saves the edit's plan at the edit's version; success ends the edit, failure keeps it. */
  async function submit(plan: ReelPlan): Promise<PlanResult | null> {
    if (!edit) return null;
    const out = await send(edit.version, plan);
    if (out) setEdit(null);
    return out;
  }

  return { edit, note, change, send, submit, error: tried && !save.saving ? (save.error ?? "") : "" };
}
