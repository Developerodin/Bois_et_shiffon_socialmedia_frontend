/**
 * Answers collected across onboarding steps until they're sent to the backend.
 * ponytail: module-level object, lost if the app is killed mid-onboarding; persist to SecureStore/AsyncStorage
 * if people start abandoning and resuming.
 */
export type Goal = "social-plan" | "marketing-videos" | "fashion-photoshoot" | "product-photoshoot";
export type Source = "website" | "google-maps" | "marketplace" | "wholesale" | "none" | "other";

export const onboarding: {
  goal: Goal;
  source: Source;
  /** No website (A07): Research finds the business online from these. */
  business?: { name: string; sells: string; location?: string };
  tones: string[];
  language: string;
  /** Set once the brand is created on the server (A08), so retries and later steps reuse it. `brandFrom` is the
   *  website or answers it was made from: changing them after going back makes a new brand. */
  brandFrom?: string;
  workspaceId?: string;
  brandId?: string;
  researchRunId?: string;
  /** Set after a new mobile number is verified; the email step sends it so the number joins that account. */
  phoneTicket?: string;
} = { goal: "marketing-videos", source: "website", tones: ["Modern", "Luxurious", "Elegant", "Premium"], language: "French (FR)" };

/** Where onboarding drops people, by the goal picked on A04. */
export const GOAL_HOME = {
  "social-plan": "/posts",
  "marketing-videos": "/reels",
  "fashion-photoshoot": "/photoshoot/fashion",
  "product-photoshoot": "/photoshoot/product",
} as const satisfies Record<Goal, string>;
