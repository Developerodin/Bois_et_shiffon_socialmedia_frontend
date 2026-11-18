/** Photoshoots: the request a studio sends, the tiers and what they cost, and the shoot the server returns. */
export const SHOOT_TIER_IDS = ["base", "moderate", "higher", "ultra"] as const;
export type ShootTier = (typeof SHOOT_TIER_IDS)[number];
/** Credits charged per shoot of four (server/photoshoot/tiers.ts reads its prices from here). */
export const SHOOT_CREDITS: Readonly<Record<ShootTier, number>> = { base: 4, moderate: 6, higher: 12, ultra: 24 };

export const PRODUCT_RATIOS = ["1:1", "4:5", "9:16"] as const;
export const SCENES = ["studio", "interior", "custom"] as const;
export const FASHION_RATIOS = ["4:5", "9:16"] as const;
export const MODELS = ["natural", "editorial", "casual"] as const;
export const MODEL_NAMES: Readonly<Record<(typeof MODELS)[number], string>> = { natural: "Léa", editorial: "Inès", casual: "Hugo" };
export const POSES = ["fullBody", "threeQuarter", "closeUp"] as const;
export const BACKGROUNDS = ["studioMinimal", "urbanStreet", "naturalInterior"] as const;
export const BRIEF_MAX = 600;

export type ShootRequest =
  | { kind: "product"; tier: ShootTier; sourceKey: string; ratio: (typeof PRODUCT_RATIOS)[number]; scene: (typeof SCENES)[number]; brief: string }
  | { kind: "fashion"; tier: ShootTier; sourceKey: string; ratio: (typeof FASHION_RATIOS)[number]; model?: (typeof MODELS)[number]; pose: (typeof POSES)[number]; background: (typeof BACKGROUNDS)[number] };
export type ShootStatus = "RUNNING" | "DONE" | "FAILED";
/** One photoshoot (server shoot.ts shootView): links are signed for an hour. */
export type Shoot = {
  id: string;
  kind: ShootRequest["kind"];
  tier: ShootTier;
  status: ShootStatus;
  input: ShootRequest;
  credits: number;
  failed: boolean;
  createdAt: string;
  sourceUrl: string;
  shots: { key: string; url: string; downloadUrl?: string }[];
};
