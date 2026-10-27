/**
 * Sample content for the Business screens (Figma "05 Marketing & Business", M06–M13).
 * The backend has brand settings, connections and a credits ledger, but the mobile API client
 * isn't wired yet, and there's no automations or subscription backend: screens read this static
 * data and keep edits in local state.
 */
export const media = {
  favicon: require("../../../assets/figma/business/bc-favicon.png"),
  tableDining: require("../../../assets/figma/business/table-dining.jpg"),
  tableRoom: require("../../../assets/figma/business/table-room.jpg"),
  tableDetail: require("../../../assets/figma/business/table-detail.jpg"),
  tvLiving: require("../../../assets/figma/business/tv-living.jpg"),
  tvFront: require("../../../assets/figma/business/tv-front.jpg"),
  tvProduct: require("../../../assets/figma/business/tv-product.jpg"),
} as const;

export const business = {
  name: "Bois & Chiffons",
  tagline: "« L'Art de Vivre à la Française »",
  site: "boisetchiffons.fr",
  workspace: "Espanda workspace",
} as const;

/**
 * M06 · Business attributes. Labels are translation keys (business:myBusiness.attributes.<id>);
 * values are the business's own data and stay as entered. `strong` values are set in 14 semibold,
 * the rest in 12 regular.
 */
export const attributes = [
  { id: "location", value: "France", strong: false },
  { id: "audience", value: "Homeowners & interior enthusiasts", strong: true },
  { id: "category", value: "Home & Living", strong: true },
  { id: "subcategory", value: "Wooden furniture & Decor", strong: true },
  { id: "storeType", value: "Product / Physical store", strong: true },
  { id: "website", value: "boisetchiffons.fr", strong: true },
] as const;

/** M07 · Brand settings. Colour names and signature cues are brand data; tones are keys (business:brand.tones.<id>). */
export const palette = [
  { name: "Warm Sand", hex: "#D9C3AC" },
  { name: "Acacia Oak", hex: "#6C4B2E" },
  { name: "Linen White", hex: "#F5F2EB" },
] as const;

export const tones = ["modern", "luxurious", "elegant", "premium", "natural", "minimalist"] as const;
export const defaultTones: readonly string[] = ["modern", "luxurious", "elegant", "premium"];
export const signatureCues = ["Bois d'acacia massif", "L'Art de Vivre à la Française"] as const;

/** M08 · Photo assets imported from the source website (badges and captions are catalog data). */
export const websitePhotos = [
  { id: "t1", badge: "Table #1", label: "Acacia Bunting", image: media.tableDining, zoom: 1 },
  { id: "t2", badge: "Table #2", label: "Room view", image: media.tableRoom, zoom: 1.1 },
  { id: "t3", badge: "Table #3", label: "Wood detail", image: media.tableDetail, zoom: 1.25 },
  { id: "tv1", badge: "TV #1", label: "Meuble TV 2p", image: media.tvLiving, zoom: 1 },
  { id: "tv2", badge: "TV #2", label: "Front angle", image: media.tvFront, zoom: 1.1 },
  { id: "tv3", badge: "TV #3", label: "Product view", image: media.tvProduct, zoom: 1 },
] as const;

/** M09 · Publishing channels; names are keys (business:connections.channels.<id>). */
export const channels = [
  { id: "instagram", icon: "instagram", primary: true },
  { id: "facebook", icon: "facebook", primary: false },
  { id: "whatsapp", icon: "whatsapp", primary: false },
  { id: "google", icon: "google", primary: false },
  { id: "shopify", icon: "shopify", primary: false },
] as const;
export type ChannelId = (typeof channels)[number]["id"];

/** M10 · Queue actions; copy lives under business:automations.items.<id>. `requires` = has a "requires" note. */
export const automations = [
  { id: "monthly", on: true, requires: false },
  { id: "autopublish", on: false, requires: true },
  { id: "replies", on: false, requires: true },
] as const;

/** M11 · Billing & credits (subscriber). Tier and generation names are data; the rest is copy in business:billing. */
export const plan = {
  tier: "Professional",
  balance: 120,
  allowance: 200,
  used: 40,
  reserved: 40,
  reservedFor: "Bunting spotlight",
} as const;

/** `date: null` = today; `credits`: negative spent, positive added, 0 included in the plan. */
export const creditUsage: readonly {
  id: "reel" | "plan" | "renewal";
  icon: "reel" | "calendar" | "renew";
  date: string | null;
  credits: number;
  name?: string;
  posts?: number;
}[] = [
  { id: "reel", icon: "reel", date: null, credits: -40, name: "Bunting spotlight" },
  { id: "plan", icon: "calendar", date: "2026-10-26T12:00:00", credits: 0, posts: 30 },
  { id: "renewal", icon: "renew", date: "2026-10-26T12:00:00", credits: 200 },
];

// The third row sits below the fold of the Figma frame; its wording is inferred.
export const billingHelp = ["missingCredits", "restore", "history"] as const;

/** M12 · Account settings. */

/** M13 · Drawer balance. */
export const drawerAccount = { credits: 160, plan: "Professional" } as const;
