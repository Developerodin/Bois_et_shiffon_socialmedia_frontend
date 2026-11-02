import type { ShootRequest } from "@/api/endpoints";

/** Photoshoot (Figma "04 Photoshoot", F01–F07): the design's pictures and the setup choices. Labels live in photoshoot.json. */
export const photoshootImages = {
  diningTable: require("../../../assets/figma/photoshoot/product-dining-table.png"),
  fashionStudio: require("../../../assets/figma/photoshoot/fashion-studio-illustration.svg"),
  logomark: require("../../../assets/figma/photoshoot/espanda-logomark.jpg"),
} as const;

type Product = Extract<ShootRequest, { kind: "product" }>;
type Fashion = Extract<ShootRequest, { kind: "fashion" }>;

/** F02 product setup; each label is photoshoot.json `product.scenes.<value>`. */
export const aspectRatios = ["1:1", "4:5", "9:16"] as const satisfies readonly Product["ratio"][];
export const sceneStyles = ["studio", "interior", "custom"] as const satisfies readonly Product["scene"][];

/** F03 fashion setup; labels are `fashion.<list>.<value>`. */
export const poses = ["fullBody", "threeQuarter", "closeUp"] as const satisfies readonly Fashion["pose"][];
export const outputFormats = [
  { ratio: "4:5", label: "feedPortrait" },
  { ratio: "9:16", label: "storyReel" },
] as const satisfies readonly { ratio: Fashion["ratio"]; label: string }[];
export const backgrounds = ["studioMinimal", "urbanStreet", "naturalInterior"] as const satisfies readonly Fashion["background"][];
/** The design's three models; none picked lets the shoot choose one that suits the garment. */
export const models = [
  { id: undefined, name: "" },
  { id: "natural", name: "Léa" },
  { id: "editorial", name: "Inès" },
  { id: "casual", name: "Hugo" },
] as const satisfies readonly { id: Fashion["model"]; name: string }[];
export const garmentRequirements = ["contrast", "wrinkles", "frontFacing"] as const;
