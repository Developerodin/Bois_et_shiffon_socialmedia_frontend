import { MODEL_NAMES, MODELS, type Shoot, type ShootRequest, type ShootTier } from "@/shared";
import { creditsText } from "@/lib/plan-credits";
import type { Background, FashionRatio, Model, Pose, Scene } from "./shoot";

/** The phone's English labels (mobile src/i18n/locales/en/photoshoot.json). */
export const LABELS: {
  scenes: Record<Scene, string>;
  poses: Record<Pose, string>;
  backgrounds: Record<Background, string>;
  formats: Record<FashionRatio, string>;
  models: Record<Model, string>;
  tiers: Record<ShootTier, { name: string; desc: string }>;
} = {
  scenes: { studio: "Studio", interior: "Interior", custom: "Custom" },
  poses: { fullBody: "Full body", threeQuarter: "Three-quarter", closeUp: "Close-up detail" },
  backgrounds: { studioMinimal: "Studio minimal", urbanStreet: "Urban street", naturalInterior: "Natural interior" },
  formats: { "4:5": "Feed portrait", "9:16": "Story / Reel" },
  models: Object.fromEntries(MODELS.map((m) => [m, `${MODEL_NAMES[m]} · ${m} styling`])) as Record<Model, string>,
  tiers: {
    base: { name: "Base", desc: "Quick drafts to try ideas" },
    moderate: { name: "Moderate", desc: "Sharper detail and light" },
    higher: { name: "Higher", desc: "Campaign-ready quality" },
    ultra: { name: "Ultra", desc: "Our best, for print and ads" },
  },
};

/** A shoot's name in lists and headers: "Product · Studio", "Fashion · Full body". */
export const shootTitle = (input: ShootRequest): string =>
  input.kind === "product" ? `Product · ${LABELS.scenes[input.scene]}` : `Fashion · ${LABELS.poses[input.pose]}`;

/** How long the wait is, by tier. */
export const waitLine = (tier: ShootTier): string =>
  tier === "ultra" ? "Four photos at Ultra quality, usually ready in a few minutes." : "Four photos, usually ready in about a minute.";

/** A shoot's status pill: "Processing · 4 credits", "Ready", "Didn't work · 4 credits refunded". No amount when nothing was charged. */
export function shootBadge(shoot: Pick<Shoot, "status" | "credits">): string {
  const n = shoot.credits;
  if (shoot.status === "DONE") return "Ready";
  if (shoot.status === "RUNNING") return n > 0 ? `Processing · ${creditsText(n)}` : "Processing";
  return n > 0 ? `Didn't work · ${creditsText(n)} refunded` : "Didn't work";
}

/** Under "This photoshoot didn't work": the refund, then what to do. */
export const refundLine = (n: number): string =>
  `${n > 0 ? `Your ${creditsText(n)} ${n === 1 ? "is" : "are"} back. ` : ""}Try again, or pick another quality.`;

/** The shoot page's staging summary, in the phone's words (detail screen): what was asked for and what it cost. */
export function stagingSummary(input: ShootRequest, credits: number): { label: string; value: string }[] {
  const format = { label: "Format", value: `${input.ratio} format` };
  const cost = { label: "Creation cost", value: creditsText(credits) };
  if (input.kind === "product") {
    const brief = input.brief.trim() || "No art direction: staged as the scene style describes.";
    return [format, { label: "Scene style", value: LABELS.scenes[input.scene] }, { label: "Creative brief", value: brief }, cost];
  }
  return [
    format,
    { label: "Model & styling", value: input.model ? LABELS.models[input.model] : "A model chosen for the garment" },
    { label: "Pose", value: LABELS.poses[input.pose] },
    { label: "Background setting", value: LABELS.backgrounds[input.background] },
    cost,
  ];
}
