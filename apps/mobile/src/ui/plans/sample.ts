import type { Href } from "expo-router";

/**
 * "06 No subscription" presentation: each plan's features and the marketing tools list. The plans' credits and the
 * workspace's own plan come from the server (ui/plans/use-plan.ts).
 */

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
/** No price field yet: every plan shows "Price to be confirmed" until store pricing exists. Its credits come from the server. */
export type Plan = { id: "professional" | "starter"; recommended?: boolean; features: PlanFeature[] };

export const plans: Plan[] = [
  {
    id: "professional",
    recommended: true,
    features: ["monthlyCredits", "postsStories", "photoshoots", "websiteStudio", "replyAssistant", "googleSync", "contentExports"],
  },
  { id: "starter", features: ["monthlyCredits", "postsStories", "photoshoots", "reelsStaging"] },
];

export type Tool = {
  id: "customers" | "google" | "website" | "business" | "connections" | "automations";
  /** Needs the Professional plan (its features list them; Starter's doesn't). */
  locked: boolean;
  /** Where "Configure" goes once the tool is open to this workspace. */
  href?: Href;
};

export const tools: Tool[] = [
  { id: "customers", locked: true, href: "/marketing/inbox" },
  { id: "google", locked: true, href: "/marketing/google" },
  { id: "website", locked: true, href: "/marketing/website" },
  { id: "business", locked: false, href: "/business" },
  { id: "connections", locked: false, href: "/business/connections" },
  { id: "automations", locked: false, href: "/business/automations" },
];
