/**
 * Channel groups the calendar's channel filter (web cf_channel) and the calendar export (?channel=) take beside one
 * channel: Meta is Facebook and every Instagram format, Instagram its four formats, so the Meta calendar and the
 * Instagram shortcut show (and export) the same posts.
 */
const INSTAGRAM = ["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL", "INSTAGRAM_REEL", "INSTAGRAM_STORY"] as const;
export const CHANNEL_GROUPS = { meta: ["FACEBOOK_POST", ...INSTAGRAM], instagram: INSTAGRAM } as const;
export const isChannelGroup = (v: string): v is keyof typeof CHANNEL_GROUPS => Object.hasOwn(CHANNEL_GROUPS, v);

/** The channels a filter value stands for: a group's members, else the one channel. */
export const channelsOf = (v: string): readonly string[] => (isChannelGroup(v) ? CHANNEL_GROUPS[v] : [v]);

/** A filter value as a file-name part: "meta", "facebook-post". */
export const channelSlug = (v: string): string => v.toLowerCase().replaceAll("_", "-");
