/**
 * Sample content for the Marketing module (Figma "05 Marketing & Business").
 * No inbox, reviews, Google Business or Website Studio backend exists yet: screens read this
 * static data and only navigate through the designed flow. Business copy (French) stays here as
 * content; interface labels are ids/keys resolved through the "marketing" i18n namespace.
 */
export { brand } from "@/ui/reels/sample";

export const photos = {
  tvUnit: require("../../../assets/figma/marketing/tv-unit-staged.jpg"),
  diningTable: require("../../../assets/figma/marketing/dining-table-staged.jpg"),
  bcFavicon: require("../../../assets/figma/bc-favicon.png"),
} as const;

export const channels = [
  { id: "instagram", name: "Instagram Direct", status: "notConnected" },
  { id: "messenger", name: "Facebook Messenger", status: "notConnected" },
  { id: "whatsapp", name: "WhatsApp Business", status: "notConnected" },
] as const;

export const replyExample = {
  product: { name: "Table à manger 240cm · Acacia Bunting", source: "Catalogue Bois & Chiffons" },
  customer: { initial: "C", meta: "Visiteur showroom · Question", message: "« Cette table est-elle disponible ? »" },
  draft:
    "« Bonjour, merci pour votre intérêt pour notre table à manger Acacia Bunting. Nous vérifions la disponibilité de cette pièce artisanale auprès de notre équipe et revenons vers vous dans les plus brefs délais. »",
  tone: "polishedArtisan",
} as const;

export const googleCapabilities = [
  { id: "catalog" },
  { id: "reviews" },
  { id: "replies" },
] as const;

export const googlePost = {
  title: "Table à manger Acacia Bunting",
  body: "Découvrez l'élégance de nos finitions artisanales en direct du showroom.",
  action: "learnMore",
} as const;

export const googleChecklist = [
  { id: "profile", done: true },
  { id: "reviewLink", done: false },
] as const;

export const websitePages = ["home", "product", "contact"] as const;
export type WebsitePage = (typeof websitePages)[number];

export const websiteDraft = {
  eyebrow: "Nouvelle collection",
  caption: "Table à manger 240cm",
  pages: {
    home: {
      headline: "Le mobilier qui traverse le temps",
      description: "L'authenticité brute du bois d'acacia massif alliée à des lignes contemporaines pensées pour durer.",
    },
    product: {
      headline: "Table à manger 240cm · Acacia Bunting",
      description: "Plateau en acacia massif aux bords naturels et piétement croisé en métal noir, pour dix convives.",
    },
    contact: {
      headline: "Venez nous rendre visite",
      description: "Notre showroom vous accueille du mardi au samedi pour découvrir nos pièces artisanales.",
    },
  } satisfies Record<WebsitePage, { headline: string; description: string }>,
  sections: ["heroBanner", "featuredCollection", "showroomContact"],
} as const;
