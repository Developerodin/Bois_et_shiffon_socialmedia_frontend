/**
 * Sample content for "07 Recovery". No render, billing or social backend is wired yet:
 * the screens read this data and route to the designed next step.
 */
export const photos = {
  table: require("../../../assets/figma/recovery/table.jpg"),
  tvUnit: require("../../../assets/figma/recovery/tv-unit.jpg"),
  bcFavicon: require("../../../assets/figma/recovery/bc-favicon.png"),
} as const;

export const failedReel = {
  title: "Bunting spotlight",
  product: "Acacia Bunting",
  seconds: 20,
  scenes: 3,
  credits: 40,
  creditsUsed: 0,
  /** Shown under "View details": key of recovery.videoFailed.details.stages. */
  failedStage: "sceneComposition",
} as const;

export const lowCredits = { needed: 40, available: 20, monthly: 200 } as const;

export const reconnect = {
  network: "Instagram",
  product: "Meuble TV 2 portes",
  draft: "Meuble TV 2 portes Acacia Bunting",
  scheduledFor: new Date(2026, 9, 26),
} as const;

/** reason: key of recovery.importFailed.reasons. */
export const importFailure = { url: "www.boisetchiffons.fr", reason: "timeout" } as const;
