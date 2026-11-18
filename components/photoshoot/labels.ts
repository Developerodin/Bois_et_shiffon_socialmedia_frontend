import { MODEL_NAMES, MODELS, type ShootRequest, type ShootTier } from "@/shared";
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
