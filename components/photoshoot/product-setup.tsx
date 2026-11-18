"use client";

import { BRIEF_MAX, PRODUCT_RATIOS, SCENES } from "@/shared";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Textarea } from "@/components/ui/textarea";
import { LABELS } from "./labels";
import type { ProductSetup as Setup } from "./shoot";
import { SourceRow, TierChoice } from "./setup-parts";

const RATIOS = PRODUCT_RATIOS.map((r) => ({ value: r, title: r }));
const SCENE_OPTIONS = SCENES.map((s) => ({ value: s, title: LABELS.scenes[s] }));

/** The product shoot's choices: source photo, aspect ratio, scene style, creative brief and quality. */
export function ProductSetup({ workspaceId, brandId, canUpload, value, onChange }: {
  workspaceId: string;
  brandId: string;
  canUpload: boolean;
  value: Setup;
  onChange: (s: Setup) => void;
}) {
  const set = (patch: Partial<Setup>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-6">
      <SourceRow
        workspaceId={workspaceId}
        brandId={brandId}
        canUpload={canUpload}
        label="Source photo"
        buttonLabel="Change asset"
        value={value}
        onChange={set}
      />
      <ChoiceCards legend="Aspect ratio" name="product-ratio" value={value.ratio} onChange={(ratio) => set({ ratio })} options={RATIOS} />
      <ChoiceCards legend="Scene style" name="product-scene" value={value.scene} onChange={(scene) => set({ scene })} options={SCENE_OPTIONS} />
      <div className="flex flex-col gap-2">
        <label htmlFor="product-brief" className="text-sm font-medium">
          Creative brief
          <span className="ml-2 text-xs font-normal text-muted-foreground">{value.scene === "custom" ? "Required" : "Optional"}</span>
        </label>
        <Textarea
          id="product-brief"
          className="rounded-xl"
          value={value.brief}
          maxLength={BRIEF_MAX}
          placeholder="Describe the scene"
          aria-describedby="product-brief-hint"
          onChange={(e) => set({ brief: e.target.value })}
        />
        <p id="product-brief-hint" className="text-xs text-muted-foreground">Refine lighting, ambiance or specific decor cues</p>
      </div>
      <TierChoice workspaceId={workspaceId} name="product-tier" value={value.tier} onChange={(tier) => set({ tier })} />
    </div>
  );
}
