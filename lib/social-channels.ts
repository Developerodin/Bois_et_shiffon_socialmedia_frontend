import type { Connection, Provider } from "@/components/settings/api";
import { channelsOf } from "@/lib/calendar-filter";
import { channelLabel } from "@/lib/post-labels";
import { connectionBadge, type Tone } from "@/lib/status";

/** The next planned post on a channel, as GET content/summary sends it. */
export type NextPost = { id: string; title: string; scheduledFor: string; status: string };
/** One channel's line of GET content/summary. */
export type ChannelSummary = { channel: string; awaiting: number; next: NextPost | null };

/**
 * The Social & Content page's rows, in order. `filter`: the calendar's cf_channel value the row opens (a channel or a
 * channel group). `providers`: the connections it publishes through; none means it is posted by hand.
 * The Blog row is the page's own (it links to /blog, not the calendar).
 */
export const SOCIAL_ROWS = [
  { key: "meta", label: "Meta", blurb: "Facebook and Instagram in one calendar", filter: "meta", providers: ["META", "INSTAGRAM"] },
  { key: "instagram", label: "Instagram", blurb: "Posts, carousels, Reels and stories", filter: "instagram", providers: ["INSTAGRAM"] },
  { key: "pinterest", label: channelLabel("PINTEREST_PIN"), blurb: "Pins with their link", filter: "PINTEREST_PIN", providers: ["PINTEREST"] },
  { key: "linkedin", label: channelLabel("LINKEDIN_POST"), blurb: "Company posts", filter: "LINKEDIN_POST", providers: [] },
  { key: "x", label: channelLabel("X_POST"), blurb: "Posts", filter: "X_POST", providers: [] },
  { key: "threads", label: channelLabel("THREADS_POST"), blurb: "Posts", filter: "THREADS_POST", providers: ["THREADS"] },
] as const satisfies readonly { key: string; label: string; blurb: string; filter: string; providers: readonly Provider[] }[];
export type SocialRow = (typeof SOCIAL_ROWS)[number];

/** A row's posts awaiting approval (summed over its channels) and its earliest next post. */
export function rowSummary(summary: readonly ChannelSummary[], filter: string): { awaiting: number; next: NextPost | null } {
  const lines = summary.filter((s) => channelsOf(filter).includes(s.channel));
  let next: NextPost | null = null;
  for (const l of lines) if (l.next && (!next || new Date(l.next.scheduledFor).getTime() < new Date(next.scheduledFor).getTime())) next = l.next;
  return { awaiting: lines.reduce((n, l) => n + l.awaiting, 0), next };
}

export type ConnectionLine = { provider: Provider; name: string; tone: Tone; label: string };

/**
 * Each of a row's connections as a badge: none → "Not connected"; any account not working → "Needs reconnect" (the worst
 * wins when a provider has several); else "Connected". `names`: the providers' labels from GET connections.
 * "byHand": the row has no publishing connection (LinkedIn, X).
 */
export function connectionLines(providers: readonly Provider[], connections: readonly Connection[], names: ReadonlyMap<string, string>): ConnectionLine[] | "byHand" {
  if (!providers.length) return "byHand";
  return providers.map((provider) => {
    const mine = connections.filter((c) => c.provider === provider);
    const name = names.get(provider) ?? provider;
    if (!mine.length) return { provider, name, tone: "muted", label: "Not connected" };
    return { provider, name, ...connectionBadge(mine.find((c) => c.status !== "ACTIVE")?.status ?? "ACTIVE") };
  });
}
