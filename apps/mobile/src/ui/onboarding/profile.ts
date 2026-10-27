/**
 * What onboarding shows back to people after Research (A09 review, A10 style). Shaped like the
 * summary we'll derive from the five strategy docs; until the mobile API lands, it's the design's sample.
 */
export type BusinessProfile = {
  name: string;
  host: string;
  tagline: string;
  /** Category keys, shown via onboarding:review.tags.<key>. */
  tags: string[];
  audience: string;
  products: { title: string; material: string; image: number }[];
  strengths: string;
  palette: { name: string; hex: string }[];
};

export const sampleProfile: BusinessProfile = {
  name: "Bois & Chiffons",
  host: "boisetchiffons.fr",
  tagline: "L'Art de Vivre à la Française",
  tags: ["homeLiving", "france", "productCatalog", "showroomEshop"],
  audience: "Homeowners and interior enthusiasts seeking timeless wood furniture and refined decor",
  products: [
    { title: "Table à manger rectangulaire 240cm - Acacia Bunting", material: "Acacia Massif", image: require("../../../assets/figma/onboarding/product-table-bunting.png") },
    { title: "Meuble TV 2 portes - Acacia Bunting", material: "Acacia Massif", image: require("../../../assets/figma/onboarding/product-tv-bunting.png") },
  ],
  strengths: "French artisan aesthetic, solid acacia woodwork, natural finishes, contemporary silhouettes.",
  palette: [
    { name: "Warm Sand", hex: "#D9C3AC" },
    { name: "Acacia Oak", hex: "#6C4B2E" },
    { name: "Linen White", hex: "#F5F2EB" },
  ],
};
