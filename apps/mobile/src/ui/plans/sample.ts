import type { Href } from "expo-router";

/**
 * Sample content for "06 No subscription". There is no subscriptions or payments backend:
 * screens read this static data, and purchase actions only navigate through the designed flow.
 */
export const photos = {
  diningInterior: require("../../../assets/figma/plans/dining-interior.jpg"),
  tableStaged: require("../../../assets/figma/plans/table-staged.jpg"),
  table: require("../../../assets/figma/plans/table.jpg"),
  catalogBlur: require("../../../assets/figma/plans/catalog-blur.jpg"),
  tvUnit: require("../../../assets/figma/plans/tv-unit.jpg"),
} as const;

/**
 * Store pricing isn't configured yet, so the design ships "Continue" disabled with
 * "Pricing is not available yet." Flip this once real prices exist; Continue then opens the
 * activation-return screen (it never charges by itself — the store purchase sheet would sit between).
 */
export const pricing = { available: false } as const;

/** Copy lives in locales/<lang>/plans.json ("plans.*"); this holds ids and numbers only. */
export type PlanFeature =
  | "monthlyCredits"
  | "postsStories"
  | "photoshoots"
  | "websiteStudio"
  | "replyAssistant"
  | "googleSync"
  | "contentExports"
  | "reelsStaging";
/** No price field yet: every plan shows "Price to be confirmed" until store pricing exists. */
export type Plan = { id: "professional" | "starter"; recommended?: boolean; credits: number; features: PlanFeature[] };

export const plans: Plan[] = [
  {
    id: "professional",
    recommended: true,
    credits: 200,
    features: ["monthlyCredits", "postsStories", "photoshoots", "websiteStudio", "replyAssistant", "googleSync", "contentExports"],
  },
  { id: "starter", credits: 60, features: ["monthlyCredits", "postsStories", "photoshoots", "reelsStaging"] },
];

/** Product shown in the sample photos (business content, not translated). */
export const product = "Acacia Bunting";

/** The storyboard waiting behind the generation gate (L02) and on activation return (L04). */
export const pendingReel = {
  title: "Bunting spotlight",
  seconds: 20,
  credits: 40,
  scenes: 3,
} as const;

export const activePlan = { id: "professional", credits: 200 } as const;

/** L05 calendar preview. */
export const draftSchedule = {
  month: new Date(2026, 9, 1),
  days: [
    { date: new Date(2026, 9, 15), on: false },
    { date: new Date(2026, 9, 16), on: true },
    { date: new Date(2026, 9, 17), on: false },
    { date: new Date(2026, 9, 18), on: false },
  ],
  post: { title: "Meuble TV 2 portes", at: new Date(2026, 9, 16, 18, 0) },
} as const;

export type Tool = {
  id: "customers" | "google" | "website" | "business" | "connections" | "automations";
  locked: boolean;
  /** Where "Configure" goes for tools that are available without a plan. */
  href?: Href;
};

export const tools: Tool[] = [
  { id: "customers", locked: true },
  { id: "google", locked: true },
  { id: "website", locked: true },
  { id: "business", locked: false, href: "/business" },
  { id: "connections", locked: false, href: "/business/connections" },
  { id: "automations", locked: false, href: "/business/automations" },
];

export const billing = { balance: 0 } as const;
