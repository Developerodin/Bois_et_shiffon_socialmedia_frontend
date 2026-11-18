import type { PlanStage, Transition } from "@/shared";
import type { ReelStep } from "./reel";

// The phone's English (mobile src/i18n/locales/en/reels.json): keep the words in step.
export const STEP_LABELS: Record<ReelStep, string> = {
  plan: "Plan",
  presenter: "Presenter",
  photos: "Photos",
  script: "Script & voice",
  storyboard: "Storyboard",
  video: "Video",
  review: "Review",
  publish: "Publish",
};

export const STAGE_LABELS: Record<PlanStage, string> = {
  reading: "Reading your brand and photos",
  writing: "Writing the script",
  directing: "Choosing a video model for each scene",
};

export const JOIN_LABELS: Record<Transition, string> = {
  match: "Match cut: this shot ends where the next begins",
  cut: "Cut on the beat",
  dissolve: "Dissolve into the next shot",
};

export const TEMPLATE_LABELS: Record<string, { title: string; subtitle: string }> = {
  spotlight: { title: "Product spotlight", subtitle: "3 macro cuts + hook" },
  collection: { title: "Collection reveal", subtitle: "Fast multi-item showcase" },
  material: { title: "Material detail", subtitle: "Wood grain & craft closeups" },
  arrival: { title: "New arrival", subtitle: "Announcement & showroom CTA" },
  "three-uses": { title: "Three ways to use it", subtitle: "Three settings, one product" },
  "detail-to-room": { title: "From detail to room", subtitle: "Close-up widening to the room" },
};

export const chipMessage = (s: number) => `Make it about ${s} seconds.`;
export const starterProduct = (p: string) => `A reel about ${p}`;
