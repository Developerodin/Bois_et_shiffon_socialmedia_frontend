import type { Connection } from "@/components/settings/api";
import { CHANNEL_PROVIDER } from "@/lib/social-channels";
import { safeHttpUrl } from "@/shared";

/** The parts of a calendar post its card reads; ContentItem satisfies it. */
export type CardPost = {
  channel: string;
  firstFrameUrl?: string | null;
  /** The account its scheduled or published attempt uses (GET content); older servers omit it. */
  publishConnectionId?: string | null;
  latest: { body: { pinLink?: string }; photoUrls?: string[] } | null;
};

/**
 * The Facebook Page a Facebook Post goes to, by name: its scheduled or published attempt's account, else the brand's
 * one working Facebook Pages connection. Nothing when the connections aren't known (`connections` null: the role can't
 * read them, or they haven't loaded), when several Pages could take it and none is chosen yet, or when the attempt's
 * account is no longer connected.
 */
export function facebookPage(p: Pick<CardPost, "channel" | "publishConnectionId">, connections: readonly Connection[] | null): string | null {
  if (p.channel !== "FACEBOOK_POST" || !connections) return null;
  if (p.publishConnectionId) return connections.find((c) => c.id === p.publishConnectionId)?.displayName ?? null;
  const pages = connections.filter((c) => c.provider === CHANNEL_PROVIDER.FACEBOOK_POST && c.status === "ACTIVE");
  return pages.length === 1 ? pages[0].displayName : null;
}

/** Instagram's formats in a word, for a card that already shows Instagram's mark; other channels have one format. */
const FORMAT: Record<string, string> = { INSTAGRAM_POST: "Post", INSTAGRAM_CAROUSEL: "Carousel", INSTAGRAM_REEL: "Reel", INSTAGRAM_STORY: "Story" };

/**
 * What a post's card can say beyond its channel, time and status, all from the post record (GET content): its
 * Instagram format, how many pictures a carousel has, where a pin leads (the host only), and its picture: a story's first
 * rendered frame, else the draft's cover (photoUrls[0], a studio reel's first scene), and a Facebook Post's Page
 * (facebookPage, from `connections`). Anything missing is left out.
 * ponytail: an X thread or a LinkedIn document aren't on the post record, so cards can't show them.
 */
export function postCardDetails(p: CardPost, connections: readonly Connection[] | null = null): { format: string | null; pictures: number | null; pinHost: string | null; page: string | null; thumb: string | null } {
  const photos = p.latest?.photoUrls ?? [];
  return {
    format: FORMAT[p.channel] ?? null,
    pictures: p.channel === "INSTAGRAM_CAROUSEL" && photos.length ? photos.length : null,
    pinHost: p.channel === "PINTEREST_PIN" ? (safeHttpUrl(p.latest?.body.pinLink)?.host ?? null) : null,
    page: facebookPage(p, connections),
    thumb: (p.channel === "INSTAGRAM_STORY" ? p.firstFrameUrl : photos[0]) ?? null,
  };
}

/** The details as one short line of words ("Carousel · 4 pictures", "Leads to shop.example", "Page: Oak & Co"), or "" for none. */
export function postCardLine(d: Pick<ReturnType<typeof postCardDetails>, "format" | "pictures" | "pinHost"> & { page?: string | null }): string {
  return [d.format, d.pictures ? `${d.pictures} ${d.pictures === 1 ? "picture" : "pictures"}` : null, d.pinHost ? `Leads to ${d.pinHost}` : null, d.page ? `Page: ${d.page}` : null].filter(Boolean).join(" · ");
}

/** Whether two signed links point at the same stored file (they differ only in their signature and date). */
export function sameSignedObject(a: string, b: string): boolean {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
}
