/**
 * Sample content for the Reels module (Figma "02 Reels"). There is no video-generation
 * backend yet: screens read this static data and navigate through the designed flow.
 * Business data (product names, reel titles, French copy) stays literal; UI wording is stored
 * as a translation key or a number and rendered with t() in the "reels" namespace.
 */
export const photos = {
  table: require("../../../assets/figma/reels/table-bunting-acacia.png"),
  tv: require("../../../assets/figma/reels/meuble-tv-bunting.png"),
  diningInterior: require("../../../assets/figma/reels/acacia-dining-interior.png"),
  tableDetail: require("../../../assets/figma/reels/acacia-table-detail.png"),
  tableStaged: require("../../../assets/figma/reels/bunting-table-staged.png"),
  bcFavicon: require("../../../assets/figma/reels/bc-favicon.png"),
  logo: require("../../../assets/figma/reels/espanda-logo.png"),
  mark: require("../../../assets/figma/reels/espanda-mark.png"),
} as const;

export const brand = { name: "Bois & Chiffons", site: "boisetchiffons.fr", credits: 160 } as const;

export const recentReels = [
  { id: "bunting", title: "Bunting collection", subtitle: "Table à manger 240cm", status: "draft", image: photos.table },
  { id: "tv", title: "Product details", subtitle: "Meuble TV 2 portes", status: "ready", image: photos.tv },
] as const;

export const ideaFilters = [
  { key: "all", count: 21 },
  { key: "productSpotlight", count: 14 },
  { key: "collection", count: 7 },
] as const;

export const ideas = [
  {
    id: "angle-01",
    angle: "01",
    image: photos.table,
    seconds: 20,
    product: "Acacia Bunting",
    hook: "« Sublimez votre intérieur avec l'authenticité brute du bois d'acacia massif. »",
    bodyKey: "ideas.body.angle01",
  },
  {
    id: "angle-02",
    angle: "02",
    image: photos.tv,
    seconds: 20,
    product: "Meuble TV",
    hook: "« L'élégance discrète d'un meuble TV conçu pour durer toute une vie. »",
    bodyKey: "ideas.body.angle02",
  },
] as const;

export const storyboard = {
  title: "Bunting spotlight",
  product: "Acacia Bunting",
  seconds: 20,
  scenes: [
    {
      n: 1,
      seconds: 8,
      shot: "wide",
      image: photos.table,
      direction: "storyboard.direction.scene1",
      voiceover: "« Découvrez la pureté intemporelle de la table Acacia Bunting, taillée pour vos moments de partage. »",
    },
    {
      n: 2,
      seconds: 6,
      shot: "material",
      image: photos.tableDetail,
      direction: "storyboard.direction.scene2",
      voiceover: "« Bois d'acacia massif et finitions artisanales aux lignes pures. »",
    },
    {
      n: 3,
      seconds: 6,
      shot: "closeCta",
      image: photos.tableStaged,
      direction: "storyboard.direction.scene3",
      voiceover: "« Disponible en exclusivité dans nos showrooms et en ligne sur boisetchiffons.fr »",
    },
  ],
} as const;

export const resultFilters = [
  { key: "all", count: 3 },
  { key: "ready", count: 2 },
  { key: "processing", count: 1 },
] as const;

export const readyReels = [
  { id: "tv", title: "Meuble TV contemporain", metaKey: "results.meta.tv", image: photos.tv },
  { id: "atelier", title: "Atelier Acacia Bunting", metaKey: "results.meta.atelier", image: photos.tableStaged },
] as const;

export const captionFr =
  "« L'art de vivre réinventé. Découvrez la table à manger Acacia Bunting : lignes sculpturales, bois massif et convivialité absolue. #boisetchiffons #homedecor #acacia #madecoamoi »";

export const hashtags = ["#boisetchiffons", "#mobilierdesign", "#acaciamassif"] as const;

/** Local wall-clock time in the brand's timezone (month is 0-based). */
export const schedule = { at: new Date(2026, 9, 26, 18, 0), timezone: "Europe/Paris (CET / UTC+1)" } as const;

export const scriptFr =
  "« Sublimez votre intérieur avec l'authenticité brute du bois d'acacia massif. Taillée pour vos moments de partage, la table Bunting réinvente la convivialité au quotidien. »";

export const templateFilters = ["all", "catalog", "shortCuts"] as const;

export const templates = [
  { id: "spotlight", seconds: 20, image: photos.table },
  { id: "collection", seconds: 15, image: photos.tv },
  { id: "material", seconds: 10, image: photos.tableDetail },
  { id: "arrival", seconds: 15, image: photos.tableStaged },
] as const;

export const websiteAssets = [
  { id: "wide", title: "Bunting table · Wide", scene: { n: 1, seconds: 8 }, image: photos.table },
  { id: "macro", title: "Bunting table · Macro", scene: { n: 2, seconds: 6 }, image: photos.tableDetail },
  { id: "staged", title: "Bunting table · Staged", scene: { n: 3, seconds: 6 }, image: photos.tableStaged },
  { id: "tv", title: "Meuble TV 2 portes", scene: null, image: photos.tv },
] as const;
