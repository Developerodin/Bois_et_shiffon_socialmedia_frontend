import { channelsOf } from "@/lib/calendar-filter";
import { CHANNEL_LABEL } from "@/lib/post-labels";
import { CHANNEL_PROVIDER } from "@/lib/social-channels";
import { AI_POST_CHANNELS, WRITTEN_POST_CHANNELS, type WrittenPostChannel } from "@/shared";

/**
 * What New post does with a channel: "ai" the Creator drafts it from a product photo (the server's NewPostInput);
 * "written" the person writes it (WrittenPostInput); "reel" and "story" are made elsewhere (Reels, the mobile app), so
 * the dialog points there instead of creating anything.
 */
export type ComposeKind = "ai" | "written" | "reel" | "story";
export type ComposeChoice = { channel: string; label: string; kind: ComposeKind };

const kindOf = (channel: string): ComposeKind =>
  (AI_POST_CHANNELS as readonly string[]).includes(channel) ? "ai" : channel === "INSTAGRAM_REEL" ? "reel" : channel === "INSTAGRAM_STORY" ? "story" : "written";

/** Every choice, in the order the dialog lists them: the Instagram formats, then the other channels. */
export const COMPOSE_CHOICES: readonly ComposeChoice[] = [...AI_POST_CHANNELS, "INSTAGRAM_REEL", "INSTAGRAM_STORY", ...WRITTEN_POST_CHANNELS].map((channel) => ({
  channel,
  label: CHANNEL_LABEL[channel] ?? channel,
  kind: kindOf(channel),
}));

/**
 * The choices New post offers for a calendar's channel filter (cf_channel: a channel or a group): that channel's or
 * group's, in the dialog's order; no filter, or one New post knows nothing of, offers every choice. The first is where
 * the dialog starts.
 */
export function composeChoices(filter?: string): readonly ComposeChoice[] {
  if (!filter) return COMPOSE_CHOICES;
  const wanted = channelsOf(filter);
  const mine = COMPOSE_CHOICES.filter((c) => wanted.includes(c.channel));
  return mine.length ? mine : COMPOSE_CHOICES;
}

export const isWrittenChannel = (channel: string): channel is WrittenPostChannel => (WRITTEN_POST_CHANNELS as readonly string[]).includes(channel);

/** No publishing API (LinkedIn, X): planned and approved here, posted by a person. */
export const postedByHand = (channel: string): boolean => CHANNEL_PROVIDER[channel] === null;
