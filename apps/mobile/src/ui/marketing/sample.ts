/**
 * Sample content for Website Studio only (Figma "05 Marketing"), which is "Coming soon": the card is closed and these
 * screens show the design with Bois & Chiffons copy. Delete this file if Website Studio is built or dropped.
 */
export { brand } from "@/ui/reels/sample";

export const photos = {
  diningTable: require("../../../assets/figma/marketing/dining-table-staged.jpg"),
  bcFavicon: require("../../../assets/figma/bc-favicon.png"),
} as const;

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
