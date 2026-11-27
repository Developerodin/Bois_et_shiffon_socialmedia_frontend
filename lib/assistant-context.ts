import {
  Bot,
  CalendarRange,
  ClipboardCheck,
  FileSearch,
  Film,
  Gauge,
  LayoutGrid,
  Lightbulb,
  MessagesSquare,
  Megaphone,
  PackageSearch,
  PackageX,
  PenLine,
  Search,
  Swords,
  Tag,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { filterFromSearch } from "@/lib/calendar-filter";
import { channelName } from "@/lib/social-channels";
import { CHAT_PAGES, isChatPage } from "@/shared";

/** A starter card: what it says, and the fuller question it sends (the real assistant answers it). */
export type Suggestion = { icon: LucideIcon; title: string; hint: string; ask: string };

/**
 * Starters for the page being viewed. Only things the chat can really answer: it reads the strategy documents, the
 * SEO / AI-visibility reports, the product catalogue, the agents and the posts on the calendar (listPosts), and
 * searches the web. It can't see a post's caption or pictures, so writing starters ask the person for the specifics.
 */
const GENERAL: Suggestion[] = [
  { icon: CalendarRange, title: "Plan my next 30 days", hint: "A content and marketing plan from your strategy.", ask: "Plan my next 30 days of marketing." },
  { icon: Users, title: "Who is my customer?", hint: "Your audience, from your business documents.", ask: "Who is my customer?" },
  { icon: Swords, title: "Compare me with competitors", hint: "Where you stand and where you can win.", ask: "How do I compare with my competitors?" },
];
const BY_PAGE: Record<string, Suggestion[]> = {
  context: [
    { icon: Target, title: "Sharpen my positioning", hint: "What sets you apart, in one clear line.", ask: "Read my strategy documents and sharpen my positioning." },
    { icon: FileSearch, title: "What's missing?", hint: "Gaps and weak spots in your documents.", ask: "What's missing or weak in my strategy documents?" },
    { icon: Users, title: "Who is my customer?", hint: "Your audience, from your business documents.", ask: "Who is my customer?" },
  ],
  products: [
    { icon: PackageSearch, title: "Explore my catalogue", hint: "What you sell, by category and range.", ask: "Give me an overview of my product catalogue: what I sell, the main categories and anything that stands out." },
    { icon: Tag, title: "Analyse my pricing", hint: "Price ranges, the median and outliers.", ask: "Analyse my pricing: ranges, the median, and the products priced far above or below the rest." },
    { icon: PackageX, title: "What's out of stock?", hint: "Out of stock, and stock we can't confirm.", ask: "Which of my products are out of stock, and which have unknown stock?" },
  ],
  performance: [
    { icon: Gauge, title: "Explain my scores", hint: "Your SEO and AI-visibility reports in plain words.", ask: "Explain my latest SEO and AI-visibility reports in plain words." },
    { icon: Lightbulb, title: "What should I fix first?", hint: "The few fixes that matter most.", ask: "From my site reports, what should I fix first?" },
    { icon: Search, title: "Am I visible in AI answers?", hint: "How assistants talk about you, and why.", ask: "Am I visible when people ask AI assistants about my category?" },
  ],
  "agent-log": [
    { icon: Bot, title: "Which agents should I run?", hint: "Based on what your business needs now.", ask: "Which of my agents should I run next, and why?" },
    { icon: FileSearch, title: "What have my agents done?", hint: "Their latest runs, summed up.", ask: "Sum up what my agents did in their latest runs." },
    { icon: CalendarRange, title: "Plan my next 30 days", hint: "A content and marketing plan from your strategy.", ask: "Plan my next 30 days of marketing." },
  ],
};
for (const id of ["library", "photoshoot", "reels", "studio"])
  BY_PAGE[id] = [
    { icon: Lightbulb, title: "Content ideas for this week", hint: "Posts that fit your brand and audience.", ask: "Give me content ideas for this week." },
    { icon: PenLine, title: "Write a caption", hint: "In your brand voice; tell me the post.", ask: "Help me write a caption in my brand voice. Ask me what the post is about first." },
    { icon: CalendarRange, title: "Plan my next 30 days", hint: "A content and marketing plan from your strategy.", ask: "Plan my next 30 days of marketing." },
  ];

type ChannelFamily = "meta" | "instagram" | "facebook" | "pinterest" | "linkedin" | "x" | "threads";

/** The starters of a channel calendar, by channel family (channelFamily). Each ask names the channel, so the answer is about it. */
const BY_CHANNEL: Record<ChannelFamily, Suggestion[]> = {
  meta: [
    { icon: CalendarRange, title: "Plan my next week's content", hint: "Facebook and Instagram, around what's already planned.", ask: "Plan my next week of Facebook and Instagram content. Check what is already planned on both first, then fill the gaps." },
    { icon: Film, title: "Suggest Reel ideas for our collection", hint: "Reels that show off your products.", ask: "Suggest Instagram Reel ideas for our collection, based on my products and brand." },
    { icon: ClipboardCheck, title: "Review posts awaiting approval", hint: "Facebook and Instagram posts to sign off.", ask: "Review my Facebook and Instagram posts awaiting approval and tell me what to check before approving them." },
  ],
  instagram: [
    { icon: CalendarRange, title: "Plan my next week's content", hint: "Instagram, around what's already planned.", ask: "Plan my next week of Instagram content. Check what is already planned on Instagram first, then fill the gaps." },
    { icon: Film, title: "Suggest Reel ideas for our collection", hint: "Reels that show off your products.", ask: "Suggest Instagram Reel ideas for our collection, based on my products and brand." },
    { icon: ClipboardCheck, title: "Review Instagram posts awaiting approval", hint: "What to check before you approve.", ask: "Review my Instagram posts awaiting approval and tell me what to check before approving them." },
  ],
  facebook: [
    { icon: CalendarRange, title: "Plan my next week's content", hint: "Facebook, around what's already planned.", ask: "Plan my next week of Facebook content. Check what is already planned on Facebook first, then fill the gaps." },
    { icon: ClipboardCheck, title: "Review Facebook posts awaiting approval", hint: "What to check before you approve.", ask: "Review my Facebook posts awaiting approval and tell me what to check before approving them." },
  ],
  pinterest: [
    { icon: Lightbulb, title: "Suggest Pin ideas for our products", hint: "Pins that lead to what you sell.", ask: "Suggest Pinterest Pin ideas for my products, with the board each would go on." },
    { icon: LayoutGrid, title: "Organize content by board", hint: "Your planned Pins, grouped by board.", ask: "Organize my planned Pinterest Pins by board, and suggest a board for any Pin without one." },
  ],
  linkedin: [
    { icon: Megaphone, title: "Create a professional brand update", hint: "A company post in your brand voice.", ask: "Draft a professional LinkedIn company update about our brand. Ask me what news to share if you need it." },
    { icon: ClipboardCheck, title: "Review pending company posts", hint: "LinkedIn posts planned or awaiting approval.", ask: "Review my LinkedIn posts that are planned or awaiting approval." },
  ],
  x: [
    { icon: PenLine, title: "Suggest short-form content", hint: "Short posts in your brand voice.", ask: "Suggest short posts for X that fit my brand voice and audience." },
    { icon: ClipboardCheck, title: "Review scheduled posts", hint: "What's going out on X next.", ask: "Review my scheduled X posts." },
  ],
  threads: [
    { icon: MessagesSquare, title: "Generate conversation starters", hint: "Posts that invite replies.", ask: "Generate conversation starters for Threads that fit my brand and audience." },
    { icon: ClipboardCheck, title: "Review upcoming posts", hint: "What's going out on Threads next.", ask: "Review my upcoming Threads posts." },
  ],
};

/** The family a calendar channel filter (a group or one channel) belongs to: each Instagram format is Instagram; unknown → null. */
export function channelFamily(channel: string | null | undefined): ChannelFamily | null {
  if (!channel) return null;
  if (channel === "meta") return "meta";
  if (channel === "instagram" || channel.startsWith("INSTAGRAM_")) return "instagram";
  const one: Record<string, ChannelFamily> = { FACEBOOK_POST: "facebook", PINTEREST_PIN: "pinterest", LINKEDIN_POST: "linkedin", X_POST: "x", THREADS_POST: "threads" };
  return Object.hasOwn(one, channel) ? one[channel] : null;
}

/** The starters for a page and, on a channel calendar, its channel; an unknown channel falls back to the page's. */
export function suggestionsFor(page: string | null, channel: string | null): Suggestion[] {
  const family = channelFamily(channel);
  if (family) return BY_CHANNEL[family];
  return (page && Object.hasOwn(BY_PAGE, page) && BY_PAGE[page]) || GENERAL;
}

/**
 * The channel calendar open: the calendar page's channel filter (cf_channel, whitelisted by filterFromSearch), else
 * null. Only the calendar has one.
 */
export function chatChannel(page: string | null, search: URLSearchParams): string | null {
  return page === "calendar" ? (filterFromSearch(search).channel ?? null) : null;
}

/** The chip's words: "<Channel> calendar" (as the channel calendar's header names it), else the page's label. */
export function contextLabel(page: string | null, channel: string | null): string | null {
  if (channel) return `${channelName(channel)} calendar`;
  return isChatPage(page) ? CHAT_PAGES[page] : null;
}

/** What a chat message sends: the server keeps the history, so only the newest message, with where it was sent from. */
export function chatRequestBody<M>(id: string, messages: readonly M[], page: string | null | undefined, channel: string | null | undefined) {
  return { id, message: messages[messages.length - 1], page: page ?? undefined, channel: channel ?? undefined };
}
