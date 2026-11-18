"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { NAME_MAX, type ReelOptions } from "@/shared";
import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePlan } from "@/components/shell/use-plan-credits";
import { fetchShared } from "@/components/workspace/use-job";
import { reelOptionsUrl, reelsApi } from "./api";
import { optionBusy } from "./reel";
import { pressLabel, usePaidPress } from "./paid-press";
import { TRAIT_TITLES } from "./voices";

// Copy: the phone's actor.* (mobile reels.json).
/** Create a presenter: a name and a choice per trait (Any sends nothing for it, so the server picks). */
export function PresenterDialog({ workspaceId, brandId, options, open, onOpenChange }: {
  workspaceId: string;
  brandId: string;
  options: ReelOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const plan = usePlan(workspaceId);
  const [name, setName] = useState("");
  const [traits, setTraits] = useState<Record<string, string>>({});
  const { pressing, error, press } = usePaidPress(workspaceId, { reread: () => fetchShared(reelOptionsUrl(workspaceId, brandId), true) });
  const making = optionBusy(options, "presenter");
  const trimmed = name.trim();

  async function create(e: { detail: number }) {
    if (!trimmed) return;
    const body = { name: trimmed, traits: Object.fromEntries(Object.entries(traits).filter(([, v]) => v !== "")) };
    const result = await press(e, () => reelsApi.makePresenter(workspaceId, brandId, body));
    if (result.ok) {
      setName("");
      setTraits({});
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a presenter</DialogTitle>
          <DialogDescription>Give them a name and pick a few traits. The rest is chosen for you.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Presenters are AI-made people. Reels with a presenter are labelled as made with AI.</p>
        {/* Not a form: Enter in the name never starts a paid press. */}
        <div className="flex flex-col gap-2">
          <label htmlFor="presenter-name" className="text-sm font-medium">Name</label>
          <Input id="presenter-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder="e.g. Léa" autoComplete="off" className="h-11" />
        </div>
        {options.traits.map((t) => (
          <ChoiceCards
            key={t.id}
            legend={TRAIT_TITLES[t.id] ?? t.id}
            name={`presenter-trait-${t.id}`}
            columns={3}
            value={traits[t.id] ?? ""}
            onChange={(v) => setTraits((s) => ({ ...s, [t.id]: v }))}
            options={[{ value: "", title: "Any" }, ...Object.entries(t.options).map(([value, title]) => ({ value, title }))]}
          />
        ))}
        <div className="flex flex-col items-start gap-2">
          <Button type="button" disabled={!plan.loaded || !trimmed || pressing || making} onClick={(e) => void create(e)}>
            {pressing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {pressLabel("Create presenter", plan, options.presenterCredits)}
          </Button>
          {making ? <p className="text-sm text-muted-foreground">One presenter is made at a time.</p> : null}
          <p role="alert" className="text-sm text-destructive empty:hidden">{error}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
