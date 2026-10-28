import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Answers collected across onboarding steps until they're sent to the backend. Saved on the device when the app
 * goes to the background (Android may kill it while the Instagram/Facebook sign-in browser is open) and restored
 * at start, so the brand isn't forgotten on the way back. Cleared when onboarding ends and on sign-out.
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

const KEY = "espanda.onboarding";
const web = Platform.OS === "web";
const DEFAULTS = JSON.stringify(onboarding);

export function saveOnboarding() {
  const json = JSON.stringify(onboarding);
  (web ? Promise.resolve(globalThis.localStorage?.setItem(KEY, json)) : SecureStore.setItemAsync(KEY, json)).catch(() => {});
}

/** Never throws: a broken or missing save just means starting from the defaults. */
export async function restoreOnboarding() {
  try {
    const raw = web ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (raw) Object.assign(onboarding, JSON.parse(raw));
  } catch {}
}

/** Back to the defaults, in memory and on the device (onboarding finished, or someone signed out). */
export function clearOnboarding() {
  for (const k of Object.keys(onboarding)) delete (onboarding as Record<string, unknown>)[k];
  Object.assign(onboarding, JSON.parse(DEFAULTS));
  (web ? Promise.resolve(globalThis.localStorage?.removeItem(KEY)) : SecureStore.deleteItemAsync(KEY)).catch(() => {});
}
