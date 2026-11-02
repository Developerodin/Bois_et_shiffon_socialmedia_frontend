import type { TFunction } from "i18next";
import type { Shoot } from "@/api/endpoints";

/** A shoot's name in lists and headers: "Product · Interior", "Fashion · Full body". */
export const shootTitle = (t: TFunction, s: Shoot) =>
  s.input.kind === "product" ? t("describe.product", { ns: "photoshoot", style: t(`product.scenes.${s.input.scene}`, { ns: "photoshoot" }) }) : t("describe.fashion", { ns: "photoshoot", style: t(`fashion.poses.${s.input.pose}`, { ns: "photoshoot" }) });

/** Its one-line facts: ratio, tier, photos. */
export const shootMeta = (t: TFunction, s: Shoot) => [
  s.input.ratio,
  t(`tiers.${s.tier}.name`, { ns: "photoshoot" }),
  t("describe.photos", { ns: "photoshoot", count: s.shots.length || 4 }),
];
