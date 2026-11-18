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

/**
 * After a Generate fails with `status`, whether the next press for the same request reuses its request id. Kept when
 * the outcome is unknown: no answer (status 0: timeout, offline) or a server error (5xx: a gateway page, or a route
 * that failed after the charge). Reusing it is safe: the server returns that shoot, or a 409 if it was refunded.
 * Any other answer (402, 409, 429...) means this press left no charge standing, so the next press is a new shoot.
 * Used by the web's makePresser and the phone's startShoot.
 */
export const shouldKeepRequestId = (status: number): boolean => status === 0 || status >= 500;

/**
 * The same request as one string whatever order its fields come in (a shoot's stored input comes back in database
 * key order), so a retry of the same setup reuses its request id. The request is flat, so sorting the top keys is enough.
 */
export const shootRequestKey = (r: ShootRequest): string => JSON.stringify(r, Object.keys(r).sort());
