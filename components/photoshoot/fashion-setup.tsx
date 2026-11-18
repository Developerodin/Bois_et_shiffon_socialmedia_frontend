"use client";

import { BACKGROUNDS, FASHION_RATIOS, MODELS, POSES } from "@/shared";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { LABELS } from "./labels";
import type { FashionSetup as Setup, Model } from "./shoot";
import { SourceRow, TierChoice } from "./setup-parts";

// "Choose a model" is no model: the shoot picks one for the garment.
const ANY = "any";
const MODEL_OPTIONS = [
  { value: ANY, title: "Choose a model", description: "A model chosen for the garment" },
  ...MODELS.map((m) => ({ value: m, title: LABELS.models[m] })),
] as const satisfies readonly { value: Model | typeof ANY; title: string; description?: string }[];
const POSE_OPTIONS = POSES.map((p) => ({ value: p, title: LABELS.poses[p] }));
const FORMAT_OPTIONS = FASHION_RATIOS.map((r) => ({ value: r, title: LABELS.formats[r], meta: r }));
const BACKGROUND_OPTIONS = BACKGROUNDS.map((b) => ({ value: b, title: LABELS.backgrounds[b] }));

/** The phone's garment hint and upload requirements, under the photo row and in the picker. */
const GARMENT_NOTE = (
  <div className="text-xs text-muted-foreground">
    <p>PNG or JPG on neutral background, flat lay or ghost mannequin</p>
    <p className="mt-2 font-medium text-foreground">Upload requirements</p>
    <ul className="mt-1 list-disc pl-4">
      <li>High contrast against background</li>
      <li>No heavy wrinkles</li>
      <li>Front-facing angle</li>
    </ul>
  </div>
);

/** The fashion shoot's choices: garment photo, model, pose, output format, background and quality. */
export function FashionSetup({ workspaceId, brandId, canUpload, value, onChange }: {
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
        label="Garment photo"
        required
        buttonLabel={value.sourceKey ? "Change garment photo" : "Add garment photo"}
        value={value}
        onChange={set}
        note={GARMENT_NOTE}
      />
      <ChoiceCards
        legend="Model & styling"
        name="fashion-model"
        value={value.model ?? ANY}
        onChange={(m) => set({ model: m === ANY ? null : m })}
        columns={2}
        options={MODEL_OPTIONS}
      />
      <ChoiceCards legend="Pose" name="fashion-pose" value={value.pose} onChange={(pose) => set({ pose })} options={POSE_OPTIONS} />
      <ChoiceCards legend="Output format" name="fashion-format" value={value.ratio} onChange={(ratio) => set({ ratio })} columns={2} options={FORMAT_OPTIONS} />
      <ChoiceCards legend="Background setting" name="fashion-background" value={value.background} onChange={(background) => set({ background })} options={BACKGROUND_OPTIONS} />
      <TierChoice workspaceId={workspaceId} name="fashion-tier" value={value.tier} onChange={(tier) => set({ tier })} />
    </div>
  );
}
