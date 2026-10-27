import type { ImageSource } from "expo-image";
import type { TFunction } from "i18next";

/**
 * Typed sample data for the Photoshoot module (Figma "04 Photoshoot", F01–F07).
 * There is no image-generation backend yet: screens read from here, and flow actions only navigate.
 * Upgrade path: swap these constants for API queries with the same shapes.
 */

const img = {
  diningTable: require("../../../assets/figma/photoshoot/product-dining-table.png"),
  tableAngle2: require("../../../assets/figma/photoshoot/table-angle-2.png"),
  tableAngle3: require("../../../assets/figma/photoshoot/table-angle-3.png"),
  tvUnit: require("../../../assets/figma/plans/bunting-tv.png"),
  tvAngle2: require("../../../assets/figma/photoshoot/tv-angle-2.png"),
  tvAngle3: require("../../../assets/figma/photoshoot/tv-angle-3.png"),
  fashionStudio: require("../../../assets/figma/photoshoot/fashion-studio-illustration.svg"),
  logomark: require("../../../assets/figma/photoshoot/espanda-logomark.jpg"),
} as const;

export const photoshootImages = img;

export const business = {
  name: "Bois & Chiffons",
  domain: "boisetchiffons.fr",
  favicon: require("../../../assets/figma/bc-favicon.png") as ImageSource,
};

/** Credits shown in the module header; a product shoot costs 20. */
export const credits = { available: 160, shootCost: 20 } as const;

export type Group = "bunting" | "tables" | "storage";

export type SourceAsset = {
  id: string;
  label: string;
  /** Short name on the setup card. */
  name: string;
  /** Catalog product name shown in the picker footer. */
  product: string;
  collection: string;
  groups: Group[];
  image: ImageSource;
  size: string;
};

export const sourceAssets: SourceAsset[] = [
  { id: "table-240", label: "Table 240", name: "Bunting dining table", product: "Table à manger 240cm", collection: "Acacia Bunting", groups: ["bunting", "tables"], image: img.diningTable, size: "1946 × 1297 px" },
  { id: "table-angle-2", label: "Table Angle 2", name: "Bunting dining table", product: "Table à manger 240cm", collection: "Acacia Bunting", groups: ["bunting", "tables"], image: img.tableAngle2, size: "1600 × 1600 px" },
  { id: "table-angle-3", label: "Table Angle 3", name: "Bunting dining table", product: "Table à manger 240cm", collection: "Acacia Bunting", groups: ["bunting", "tables"], image: img.tableAngle3, size: "1600 × 1600 px" },
  { id: "tv-meuble", label: "TV Meuble", name: "Bunting TV unit", product: "Meuble TV 2 portes", collection: "Acacia Bunting", groups: ["bunting", "storage"], image: img.tvUnit, size: "1280 × 1280 px" },
  { id: "tv-angle-2", label: "TV Angle 2", name: "Bunting TV unit", product: "Meuble TV 2 portes", collection: "Acacia Bunting", groups: ["bunting", "storage"], image: img.tvAngle2, size: "1600 × 1600 px" },
  { id: "tv-angle-3", label: "TV Angle 3", name: "Bunting TV unit", product: "Meuble TV 2 portes", collection: "Acacia Bunting", groups: ["bunting", "storage"], image: img.tvAngle3, size: "1600 × 1600 px" },
];

/**
 * Text shown from sample data: a key in photoshoot.json (with values), or plain business text
 * (product names, French copy) that is never translated. Resolve with `say(t, copy)` at render.
 */
export type Copy = string | { key: string; values?: Record<string, string | number> };

export function say(t: TFunction, copy: Copy): string {
  return typeof copy === "string" ? copy : t(copy.key, { ns: "photoshoot", ...copy.values });
}

export const sourceFilters: { value: "all" | Group; label: Copy }[] = [
  { value: "all", label: { key: "source.filters.all" } },
  { value: "bunting", label: "Bunting Acacia" },
  { value: "tables", label: { key: "source.filters.tables" } },
  { value: "storage", label: { key: "source.filters.storage" } },
];

export function findAsset(id: string | undefined): SourceAsset {
  return sourceAssets.find((a) => a.id === id) ?? sourceAssets[0];
}

/** Setup choices (F02 product, F03 fashion). */
export const aspectRatios = ["1:1", "4:5", "9:16"] as const;
export type AspectRatio = (typeof aspectRatios)[number];
/** Option values; each label is photoshoot.json `<screen>.<list>.<value>`. */
export const sceneStyles = ["studio", "interior", "custom"] as const;
export type SceneStyle = (typeof sceneStyles)[number];

export const poses = ["fullBody", "threeQuarter", "closeUp"] as const;
export const outputFormats = [
  { ratio: "4:5", label: "feedPortrait" },
  { ratio: "9:16", label: "storyReel" },
] as const;
export const backgrounds = ["studioMinimal", "urbanStreet", "naturalInterior"] as const;
export const models: Copy[] = [
  { key: "fashion.models.choose" },
  { key: "fashion.models.natural", values: { name: "Léa" } },
  { key: "fashion.models.editorial", values: { name: "Inès" } },
  { key: "fashion.models.casual", values: { name: "Hugo" } },
];
export const garmentRequirements = ["contrast", "wrinkles", "frontFacing"] as const;

export const defaultBrief = "Un intérieur calme, la matière au premier plan";

/** F05 progress card. */
export const generation = {
  title: { key: "generating.sample.title", values: { name: "Bunting" } } as Copy,
  description: { key: "generating.sample.description", values: { product: "Table à manger Acacia Bunting" } } as Copy,
  meta: [{ key: "product.scenes.interior" }, "4:5", { key: "generating.sample.variations", values: { count: 2 } }] as Copy[],
  image: img.diningTable,
  steps: [
    { label: "catalog", status: "done" },
    { label: "compose", status: "active" },
    { label: "finish", status: "queued" },
  ] as { label: "catalog" | "compose" | "finish"; status: "done" | "active" | "queued" }[],
};

export type Shoot = {
  id: string;
  kind: "product" | "fashion";
  title: Copy;
  status: "processing" | "preview";
  /** One line under the title. */
  meta: Copy;
  image?: ImageSource;
  progress?: number;
  /** F07 detail. */
  headerTitle?: Copy;
  tags?: Copy[];
  formatBadge?: Copy;
  style?: Copy;
  summary?: string;
  sourceLine?: string;
  format?: Copy;
  cost?: number;
};

export const shoots: Shoot[] = [
  {
    id: "studio-staging",
    kind: "product",
    title: { key: "results.sample.studioStaging", values: { product: "Table à manger" } },
    status: "processing",
    meta: { key: "results.sample.rendering", values: { percent: 60 } },
    progress: 0.6,
    cost: 20,
  },
  {
    id: "bunting-dining",
    kind: "product",
    title: "Table à manger Acacia Bunting",
    status: "preview",
    meta: { key: "results.sample.interiorReady", values: { ratio: "4:5", count: 2 } },
    image: img.diningTable,
    headerTitle: { key: "detail.sample.headerTitle", values: { name: "Bunting" } },
    tags: [{ key: "detail.sample.vertical", values: { ratio: "4:5" } }, { key: "detail.sample.architecturalInterior" }, "Acacia Bunting"],
    formatBadge: { key: "detail.sample.formatBadge", values: { ratio: "4:5" } },
    style: { key: "detail.sample.naturalStudio" },
    summary: "Sublimez votre salle à manger avec la table Bunting. Ambiance naturelle baignée de lumière zénithale, texture de bois brut mise en avant.",
    sourceLine: "Table à manger 240cm · boisetchiffons.fr",
    format: { key: "detail.sample.portraitPhoto" },
    cost: 20,
  },
  {
    id: "bunting-tv",
    kind: "product",
    title: "Meuble TV 2 portes Bunting",
    status: "preview",
    meta: { key: "results.sample.studioDaylight", values: { ratio: "4:5" } },
    image: img.tvUnit,
    headerTitle: { key: "detail.sample.headerTitle", values: { name: "Meuble TV" } },
    tags: [{ key: "detail.sample.vertical", values: { ratio: "4:5" } }, { key: "detail.sample.studioDaylight" }, "Acacia Bunting"],
    formatBadge: { key: "detail.sample.formatBadge", values: { ratio: "4:5" } },
    style: { key: "detail.sample.studioDaylight" },
    summary: "Le meuble TV Bunting en lumière douce de studio : bois d'acacia massif, lignes nettes, matière mise en valeur.",
    sourceLine: "Meuble TV 2 portes · boisetchiffons.fr",
    format: { key: "detail.sample.portraitPhoto" },
    cost: 20,
  },
];

export function findShoot(id: string | undefined): Shoot | undefined {
  return shoots.find((s) => s.id === id);
}
