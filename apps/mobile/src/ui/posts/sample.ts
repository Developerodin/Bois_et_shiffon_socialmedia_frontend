import type { PostChannel as ApiChannel, PostStatus as ApiStatus } from "@/api/endpoints";
import i18n, { formatDate } from "@/i18n";

/**
 * Posts module helpers: statuses, channels and dates (read in the phone's timezone). The constants below
 * (POSTS, POST_COPY) are still sample data, for the Stories screens, which have no backend channel yet.
 */
// Stories have no backend channel yet: they stay sample data on P04/P08.
export type PostChannel = ApiChannel | "INSTAGRAM_STORY";
export type PostStatus = ApiStatus;

export type Post = {
  id: string;
  title: string;
  channel: PostChannel;
  status: PostStatus;
  scheduledFor: string | null;
  caption?: string;
  image?: number /* require() */ | { uri: string };
};

const TV = require("../../../assets/figma/posts/bunting-tv-unit.jpg");
const DINING = require("../../../assets/figma/onboarding/bunting-dining-room.png");

export const BUSINESS = { name: "Bois & Chiffons", favicon: require("../../../assets/figma/bc-favicon.png"), credits: 160 } as const;

/**
 * Days and times read in the phone's timezone, which is what the person picks a slot in (as on the reels R09 screen).
 * ponytail: a brand has no timezone field yet; store one on the brand if teams post from other timezones.
 */
export const BUSINESS_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const BUSINESS_TZ_LABEL = BUSINESS_TZ.replace(/_/g, " ").replace("/", " / ");

export const POSTS: Post[] = [
  {
    id: "meuble-tv-bunting",
    title: "Meuble TV 2 portes Acacia Bunting",
    channel: "INSTAGRAM_POST",
    status: "AWAITING_APPROVAL",
    scheduledFor: null,
    caption:
      "« Sublimez votre salon avec le meuble TV 2 portes de la collection Acacia Bunting. L'authenticité brute du bois d'acacia massif alliée à des lignes contemporaines pensées pour durer. Découvrez la collection sur notre boutique. »\n\n#boisetchiffons #meubletv #acaciabunting #decorationinterieur",
    image: TV,
  },
  {
    id: "acacia-craft",
    title: "Atelier · Acacia craft",
    channel: "INSTAGRAM_POST",
    status: "PUBLISHED",
    scheduledFor: "2026-10-09T18:00:00+02:00",
    caption: "« Le geste de l'artisan, du bois brut à la pièce finie. »",
    image: DINING,
  },
  {
    id: "bunting-living",
    title: "Bunting living room",
    channel: "INSTAGRAM_CAROUSEL",
    status: "PUBLISHED",
    scheduledFor: "2026-10-16T18:00:00+02:00",
    caption: "« Un salon tout en acacia massif. »",
    image: TV,
  },
  {
    id: "bunting-tv-launch",
    title: "Bunting collection · Meuble TV",
    channel: "INSTAGRAM_POST",
    status: "SCHEDULED",
    scheduledFor: "2026-10-26T18:00:00+01:00",
    caption: "« Élégance épurée et acacia massif pour votre salon. »",
    image: TV,
  },
  {
    id: "table-bunting",
    title: "Table à manger 240cm Bunting",
    channel: "INSTAGRAM_POST",
    status: "DRAFT_REVIEW",
    scheduledFor: "2026-10-26T20:00:00+01:00",
    caption: "« Sublimez votre intérieur avec l'authenticité du bois d'acacia massif. »\n\n#boisetchiffons #acaciabunting #tableamanger",
    image: DINING,
  },
  {
    id: "collection-detail",
    title: "Collection detail",
    channel: "INSTAGRAM_CAROUSEL",
    status: "SCHEDULED",
    scheduledFor: "2026-10-27T10:30:00+01:00",
    caption: "« Les détails qui font la différence. »",
    image: DINING,
  },
  {
    id: "atelier-story",
    title: "Atelier story",
    channel: "INSTAGRAM_STORY",
    status: "DRAFT_REVIEW",
    scheduledFor: "2026-10-30T18:00:00+01:00",
    caption: "« Dans les coulisses de l'atelier. »",
    image: DINING,
  },
  {
    id: "story-bunting-collection",
    title: "New Bunting collection",
    channel: "INSTAGRAM_STORY",
    status: "DRAFT_REVIEW",
    scheduledFor: null,
    caption: "« Retrouvez la table Bunting en acacia massif sur notre boutique officielle. »",
    image: DINING,
  },
  {
    id: "story-meuble-tv",
    title: "Meuble TV Acacia",
    channel: "INSTAGRAM_STORY",
    status: "DRAFT_REVIEW",
    scheduledFor: null,
    caption: "« Le meuble TV Bunting, en acacia massif. »",
    image: TV,
  },
];

/**
 * Presentational copy the design shows around a post that the pipeline doesn't model yet
 * (story overlay text, the product line under a highlight). Keyed by post id.
 */
export const POST_COPY: Record<string, { collection?: string; product?: string; format?: string; kicker?: string; headline?: string; tagline?: string }> = {
  "meuble-tv-bunting": { collection: "Bunting collection", product: "Meuble TV 2 portes · Acacia massif", format: "1 photo · Story & Feed" },
  "story-bunting-collection": { kicker: "COLLECTION BUNTING", headline: "L'acacia, tout naturellement.", tagline: "L'artisanat français" },
  "story-meuble-tv": { kicker: "COLLECTION BUNTING", headline: "Le meuble TV, en acacia massif.", tagline: "Design contemporain" },
  "atelier-story": { kicker: "L'ATELIER", headline: "Fait main, en France.", tagline: "Dans les coulisses" },
};

/** Translation keys (posts namespace) for each status: t(STATUS_KEY[post.status]). */
export const STATUS_KEY: Record<PostStatus, string> = {
  PLANNED: "status.planned",
  BRIEF_READY: "status.briefReady",
  DRAFT_REVIEW: "status.needsReview",
  AWAITING_APPROVAL: "status.draftReady",
  APPROVED: "status.approved",
  SCHEDULED: "status.scheduled",
  PUBLISHED: "status.published",
  REVIEWED: "status.published",
  REJECTED: "status.rejected",
  BLOCKED: "status.needsReview",
};

export const CHANNEL_LABEL: Record<PostChannel, string> = {
  INSTAGRAM_POST: "Instagram",
  INSTAGRAM_CAROUSEL: "Instagram",
  INSTAGRAM_REEL: "Instagram",
  INSTAGRAM_STORY: "Instagram",
  FACEBOOK_POST: "Facebook",
  PINTEREST_PIN: "Pinterest",
  THREADS_POST: "Threads",
};

/** A slot is locked in once the post is scheduled or out; everything before is still a draft. */
export const isLockedIn = (s: PostStatus) => s === "SCHEDULED" || s === "PUBLISHED" || s === "REVIEWED";

export const getPost = (id: string | string[] | undefined) => POSTS.find((p) => p.id === id);

/** Caption body without the trailing hashtag block, and the hashtags on their own. */
export function splitCaption(caption = "") {
  const tags = caption.match(/#[^\s#]+/g) ?? [];
  return { text: caption.replace(/#[^\s#]+/g, "").trim(), tags };
}

// ── dates, always read in the business timezone ──────────────────────────────

const parts = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, hh: p.hour, mm: p.minute };
};

/** "2026-10-26" for the business-local day of a date. */
export const dayKey = (d: Date) => {
  const p = parts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
};

export const time24 = (iso: string) => {
  const p = parts(new Date(iso));
  return `${p.hh}:${p.mm}`;
};

/** Calendar maths on plain y/m/d so the grid never shifts with the phone's timezone. */
export const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

// Names below come from Intl in the app language; the word order lives in posts.json (date.*).
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));
/** Named parts (weekday, day, month, year) in the app language; month keeps its in-date (genitive) form. */
const named = (date: Date, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat(i18n.language, options).formatToParts(date).map((x) => [x.type, x.value]));

/** "October 2026". */
export const monthYear = (y: number, m: number) => formatDate(utcDay(y, m, 1), { month: "long", year: "numeric", timeZone: "UTC" });
/** "Monday, 26 October 2026". */
export const longDay = (y: number, m: number, d: number) =>
  i18n.t("posts:date.long", named(utcDay(y, m, d), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }));
/** "26 Oct 2026" in the business timezone. */
export const shortDate = (iso: string) => i18n.t("posts:date.short", named(new Date(iso), { day: "numeric", month: "short", year: "numeric", timeZone: BUSINESS_TZ }));
/**
 * Monday-first column heads. The design abbreviates English to two letters ("Mo"); other languages keep
 * their own short form, since cutting e.g. Arabic or Hindi names to two characters garbles them.
 */
export const weekdayHeads = () =>
  [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const s = formatDate(utcDay(2026, 10, 26 + i), { weekday: "short", timeZone: "UTC" }); // 26 Oct 2026 is a Monday
    return i18n.language.split("-")[0] === "en" ? s.slice(0, 2) : s;
  });

/** "Tomorrow · 10:30 AM", "Friday · 06:00 PM". */
export function relativeSlot(iso: string, today = new Date()) {
  const date = new Date(iso);
  const p = parts(date);
  const t = parts(today);
  const diff = Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(t.y, t.m - 1, t.d)) / 86400000);
  // Newer ICU puts a narrow no-break space before AM/PM; keep the design's plain space.
  const time = formatDate(date, { hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TZ }).replace(/\u202f/g, " ");
  const day =
    diff === 0 ? i18n.t("posts:date.today") : diff === 1 ? i18n.t("posts:date.tomorrow") : diff < 7 ? formatDate(date, { weekday: "long", timeZone: BUSINESS_TZ }) : shortDate(iso);
  return i18n.t("posts:date.slot", { day, time });
}

export const ymd = (d: Date) => {
  const p = parts(d);
  return { y: p.y, m: p.m, d: p.d };
};

export const postsOnDay = <P extends { scheduledFor: string | null }>(list: P[], key: string) =>
  list.filter((p) => p.scheduledFor && dayKey(new Date(p.scheduledFor)) === key).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));

/** Slots from now through the next 7 days (the Today agenda). */
export function upcomingThisWeek<P extends { scheduledFor: string | null }>(list: P[], today = new Date()) {
  const end = dayKey(new Date(today.getTime() + 7 * 86400000));
  return list.filter((p) => p.scheduledFor && new Date(p.scheduledFor) >= today && dayKey(new Date(p.scheduledFor)) <= end).sort((a, b) =>
    a.scheduledFor!.localeCompare(b.scheduledFor!),
  );
}
