import { safeHttpUrl } from "@/shared";

/** The parts of a calendar post its card reads; ContentItem satisfies it. */
export type CardPost = {
  channel: string;
  firstFrameUrl?: string | null;
  latest: { body: { pinLink?: string }; photoUrls?: string[] } | null;
};

/** Instagram's formats in a word, for a card that already shows Instagram's mark; other channels have one format. */
const FORMAT: Record<string, string> = { INSTAGRAM_POST: "Post", INSTAGRAM_CAROUSEL: "Carousel", INSTAGRAM_REEL: "Reel", INSTAGRAM_STORY: "Story" };

/**
 * What a post's card can say beyond its channel, time and status, all from the post record (GET content): its
 * Instagram format, how many pictures a carousel has, where a pin leads (the host only), and its picture: a story's first
 * rendered frame, else the draft's cover (photoUrls[0], a studio reel's first scene). Anything missing is left out.
 * ponytail: a Pinterest board, a Facebook Page, an X thread or a LinkedIn document aren't on the post record (a board
 * and an account are picked at publishing time), so cards can't show them.
 */
export function postCardDetails(p: CardPost): { format: string | null; pictures: number | null; pinHost: string | null; thumb: string | null } {
  const photos = p.latest?.photoUrls ?? [];
  return {
    format: FORMAT[p.channel] ?? null,
    pictures: p.channel === "INSTAGRAM_CAROUSEL" && photos.length ? photos.length : null,
    pinHost: p.channel === "PINTEREST_PIN" ? (safeHttpUrl(p.latest?.body.pinLink)?.host ?? null) : null,
    thumb: (p.channel === "INSTAGRAM_STORY" ? p.firstFrameUrl : photos[0]) ?? null,
  };
}

/** The details as one short line of words ("Carousel · 4 pictures", "Leads to shop.example"), or "" for none. */
export function postCardLine(d: Pick<ReturnType<typeof postCardDetails>, "format" | "pictures" | "pinHost">): string {
  return [d.format, d.pictures ? `${d.pictures} ${d.pictures === 1 ? "picture" : "pictures"}` : null, d.pinHost ? `Leads to ${d.pinHost}` : null].filter(Boolean).join(" · ");
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
