import type { AnalyticsChannel } from "@/shared";
import { providersOf } from "@/lib/social-channels";

/**
 * What a channel calendar's analytics panel shows for its filter (a channel or a channel group): the accounts read
 * from Meta (GET insights/channel), in order; "byHand" for channels posted by hand (LinkedIn, X); "notYet" for
 * channels with a publishing connection whose analytics aren't built (Pinterest, Threads).
 */
/** The Analytics page, open on one account's tab. */
export const analyticsHref = (account?: AnalyticsChannel) => (account ? `/social/analytics?account=${account}` : "/social/analytics");

export function analyticsFor(filter: string): AnalyticsChannel[] | "byHand" | "notYet" {
  const providers = providersOf(filter);
  if (!providers.length) return "byHand";
  const out: AnalyticsChannel[] = [];
  // The Meta calendar shows its Facebook Page first, then Instagram.
  if (providers.includes("META")) out.push("facebook");
  if (providers.includes("INSTAGRAM")) out.push("instagram");
  return out.length ? out : "notYet";
}
