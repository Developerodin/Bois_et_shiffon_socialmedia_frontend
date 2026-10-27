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
  website?: string;
  business?: { name: string; sells: string; location?: string; website?: string };
  tones: string[];
  language: string;
  /** Set once the brand is created on the server (A08), so retries and later steps reuse it. */
  workspaceId?: string;
  brandId?: string;
  researchRunId?: string;
  /** Set after a new mobile number is verified; the email step sends it so the number joins that account. */
  phoneTicket?: string;
} = { goal: "marketing-videos", source: "website", tones: ["Modern", "Luxurious", "Elegant", "Premium"], language: "French (FR)" };
