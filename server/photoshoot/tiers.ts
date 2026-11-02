/**
 * Photoshoot tiers: what the person picks in the app (F02/F03), the model that makes it, and the price.
 * Product shots favour faithful edits of the photo (OpenAI GPT Image 2, Qwen edit); fashion shots favour people
 * (Higgsfield Soul 2, Marketing Studio). Google's Nano Banana Pro isn't in Higgsfield's API (GET /models, 2026-11-02),
 * so Higher and Ultra fashion run on Marketing Studio Flare instead.
 * Every tier must keep MARGIN_FLOOR at the credit's sale price; a tier under it stops the server at start (below).
 * ponytail: costUsd are estimates per shoot of SHOTS images (provider price pages, 2026-11); check them against the
 * invoices and move the table to the database next to AiTier if prices change often.
 */
export const SHOTS = 4;
/** What a credit sells for (the cheapest plan's price per credit). */
export const CREDIT_USD = 0.145;
export const MARGIN_FLOOR = 0.7;

export const SHOOT_TIERS = ["base", "moderate", "higher", "ultra"] as const;
export type ShootTier = (typeof SHOOT_TIERS)[number];
export type ShootKind = "product" | "fashion";
export type ShootRatio = "1:1" | "4:5" | "9:16";

type HfInput = { prompt: string; imageUrl: string; ratio: ShootRatio };
export type Engine = { costUsd: number } & (
  | { provider: "openai"; quality: "low" | "medium" | "high" }
  | { provider: "higgsfield"; path: string; body: (i: HfInput) => Record<string, unknown> }
);

// Higgsfield has no 4:5: shots come back 3:4 and are cropped to 4:5 (shoot.ts).
const hfRatio = (r: ShootRatio) => (r === "4:5" ? "3:4" : r);
const soul = (resolution: "720p" | "1080p") => (i: HfInput) => ({ prompt: i.prompt, image_url: i.imageUrl, aspect_ratio: hfRatio(i.ratio), resolution });
const flare = (resolution: "2k" | "4k") => (i: HfInput) => ({ prompt: i.prompt, input_images: [i.imageUrl], aspect_ratio: hfRatio(i.ratio), resolution });

export const TIERS: Record<ShootTier, { credits: number; product: Engine; fashion: Engine }> = {
  base: {
    credits: 4,
    product: { provider: "openai", quality: "low", costUsd: 0.06 },
    fashion: { provider: "higgsfield", path: "/higgsfield-ai/soul/v2/image-to-image", body: soul("720p"), costUsd: 0.05 },
  },
  moderate: {
    credits: 6,
    product: {
      provider: "higgsfield",
      path: "/alibaba/qwen-image-3/edit",
      body: (i) => ({ prompt: i.prompt, image_urls: [i.imageUrl], aspect_ratio: hfRatio(i.ratio), resolution: "2k" }),
      costUsd: 0.17,
    },
    fashion: { provider: "higgsfield", path: "/higgsfield-ai/soul/v2/image-to-image", body: soul("1080p"), costUsd: 0.17 },
  },
  higher: {
    credits: 12,
    product: { provider: "openai", quality: "medium", costUsd: 0.26 },
    fashion: { provider: "higgsfield", path: "/marketing-studio/image/flare", body: flare("2k"), costUsd: 0.36 },
  },
  ultra: {
    credits: 24,
    product: { provider: "openai", quality: "high", costUsd: 1.0 },
    fashion: { provider: "higgsfield", path: "/marketing-studio/image/flare", body: flare("4k"), costUsd: 1.0 },
  },
};

/** Tiers whose price leaves less than MARGIN_FLOOR over the model's cost. */
export function underFloor(tiers = TIERS) {
  return SHOOT_TIERS.flatMap((id) =>
    (["product", "fashion"] as const).flatMap((kind) => {
      const margin = 1 - tiers[id][kind].costUsd / (tiers[id].credits * CREDIT_USD);
      return margin < MARGIN_FLOOR ? [`${id}/${kind}: ${Math.round(margin * 100)}%`] : [];
    }),
  );
}
const low = underFloor();
if (low.length) throw new Error(`Photoshoot tiers under the ${MARGIN_FLOOR * 100}% margin floor: ${low.join(", ")}`);
