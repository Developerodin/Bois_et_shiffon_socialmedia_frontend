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
  performance: "SEO & GEO reports",
  "agent-log": "Agent log",
  settings: "Settings",
} as const;
export type ChatPage = keyof typeof CHAT_PAGES;
export const isChatPage = (id: string | null | undefined): id is ChatPage => !!id && Object.hasOwn(CHAT_PAGES, id);
