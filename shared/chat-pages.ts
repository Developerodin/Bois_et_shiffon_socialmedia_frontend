/**
 * The pages the chat can be told the person is on: nav ids (web lib/nav.ts) → their nav label. The web sends the id;
 * the server only ever puts the label from this map into the model's context, never client text. A web test keeps
 * these ids and labels in step with the nav.
 */
export const CHAT_PAGES = {
  overview: "Overview",
  context: "Business context",
  products: "Products",
  connections: "Connections",
  automations: "Automations",
  library: "Brand & photos",
  photoshoot: "Photoshoot",
  reels: "Reels",
  studio: "Studio",
  inbox: "Inbox",
  competitors: "Competitors",
  calendar: "Content calendar",
  performance: "Growth reports",
  "agent-log": "Agent log",
  settings: "Settings",
} as const;
export type ChatPage = keyof typeof CHAT_PAGES;
export const isChatPage = (id: string | null | undefined): id is ChatPage => !!id && Object.hasOwn(CHAT_PAGES, id);

/**
 * The channel calendars the chat can be told the person is on: the calendar's channel filter (web cf_channel, a
 * CHANNEL_GROUPS key or one ContentChannel) → its name. As with CHAT_PAGES, the server only puts these names in the
 * model's context, never client text. A web test keeps the keys in step with the calendar's filter values.
 */
export const CHAT_CHANNELS = {
  meta: "Meta (Facebook and Instagram)",
  instagram: "Instagram",
  INSTAGRAM_POST: "Instagram post",
  INSTAGRAM_CAROUSEL: "Instagram carousel",
  INSTAGRAM_REEL: "Instagram Reel",
  INSTAGRAM_STORY: "Instagram story",
  FACEBOOK_POST: "Facebook",
  PINTEREST_PIN: "Pinterest",
  THREADS_POST: "Threads",
  LINKEDIN_POST: "LinkedIn",
  X_POST: "X",
} as const;
export type ChatChannel = keyof typeof CHAT_CHANNELS;
export const isChatChannel = (v: string | null | undefined): v is ChatChannel => !!v && Object.hasOwn(CHAT_CHANNELS, v);
