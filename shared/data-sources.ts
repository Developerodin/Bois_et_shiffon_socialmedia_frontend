import type { PermissionKey } from "./permissions";

/** Outside sources of daily numbers (prisma DataSourceKind). */
export const DATA_SOURCE_KINDS = ["SEARCH_CONSOLE", "POST_METRICS", "SHOPIFY_ORDERS", "META_ADS", "SHOPIFY_QUOTES"] as const;
export type DataSourceKind = (typeof DATA_SOURCE_KINDS)[number];
export type DataSourceStatus = "ACTIVE" | "ERROR" | "OFF";

/** How each kind is named in a URL (`data-sources/:kind/sync`). */
export const DATA_SOURCE_SLUGS = {
  SEARCH_CONSOLE: "search-console",
  POST_METRICS: "post-metrics",
  SHOPIFY_ORDERS: "shopify-orders",
  META_ADS: "meta-ads",
  SHOPIFY_QUOTES: "shopify-quotes",
} as const satisfies Record<DataSourceKind, string>;
export type DataSourceSlug = (typeof DATA_SOURCE_SLUGS)[DataSourceKind];

/** The key a person needs to see a kind's numbers, its sync state, or press its Sync now. Enforced by the server. */
export const READ_KEY = {
  SEARCH_CONSOLE: "analytics.read",
  POST_METRICS: "analytics.read",
  SHOPIFY_ORDERS: "crm.read",
  META_ADS: "ads.read",
  /** Quote status, expiry and payment reminders: the quotes carry customer contact details */
  SHOPIFY_QUOTES: "crm.manage",
} as const satisfies Record<DataSourceKind, PermissionKey>;

/** Why the last sync didn't fully succeed, as a kind the apps word themselves. */
export type DataSyncReason = "reconnect" | "permission" | "partial" | "failed" | "rate_limited";

/** The only error texts ever stored or returned for a sync: provider text is logged, never shown. */
export const DATA_SYNC_ERRORS: Record<DataSyncReason, string> = {
  reconnect: "The account needs reconnecting. Reconnect it in Connections.",
  permission: "The account didn't grant access to these numbers. Reconnect it and allow access.",
  partial: "Some days are still loading.",
  failed: "The last sync couldn't read the numbers. It tries again tomorrow, or press Sync now.",
  rate_limited: "The provider asked us to slow down. The next sync picks up where this one stopped.",
};

/**
 * DataSource.lastResult. `okAt`: the last successful sync ("Updated 3 h ago"). `at`: when the last run ended;
 * `startedAt`: when it started (absent on rows written before it was recorded).
 */
export type DataSyncResult = { at: string; startedAt?: string | null; okAt: string | null; reason: DataSyncReason | null; count: number; error: string | null };

/**
 * A run of the source in hand: "running" since it started, or "queued" to start at `since` (Sync now, or the
 * follow-up of a run that stopped partway). null: nothing due in the next couple of minutes.
 */
export type DataSyncRun = {
  state: "queued" | "running";
  since: string | null;
  /** A history window (a backfill job), not a daily, manual or follow-up run. */
  backfill: boolean;
} | null;

/**
 * Shopify orders only: the history past 60 days. `allOrders`: the store lets us read every order (null: not known
 * yet); `visibleSince` (an ISO date) while it doesn't; `loading` while the history is being read, `through` the last
 * day it holds so far (null before its first window).
 */
export type OrderHistoryDto = { allOrders: boolean | null; visibleSince: string | null; through: string | null; loading: boolean };

/** GET data-sources: one per source the person may see. `label` only for people who manage integrations. */
export type DataSourceDto = {
  id: string;
  kind: DataSourceKind;
  label?: string | null;
  status: DataSourceStatus;
  lastResult: DataSyncResult | null;
  /** A run queued or running now (the job table's word, so a run that died never shows as running). */
  sync: DataSyncRun;
  /** "YYYY-MM-DD", the last provider day held contiguously */
  syncedThrough: string | null;
  /** The zone the provider's days are in (Google: Pacific; Meta Ads: the account's), when it says */
  reportsInZone: string | null;
  /** SHOPIFY_ORDERS only (null when there is nothing to say). */
  history?: OrderHistoryDto | null;
};

/**
 * The currencies the ECB publishes a daily euro reference rate for (EUR itself excluded: 1 EUR = 1 EUR). The only
 * currencies rates are fetched for, converted between or accepted for a budget. Taken from the ECB's own series on
 * 2026-11-26 (those with a rate that week; BGN stopped when Bulgaria joined the euro). A currency that joins the euro
 * or is suspended has to be removed by hand: its rates then stop and conversions to it go stale.
 */
export const ECB_CURRENCIES = [
  "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN",
  "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
] as const;
export type EcbCurrency = (typeof ECB_CURRENCIES)[number];
export const isEcbCurrency = (c: unknown): c is EcbCurrency => typeof c === "string" && (ECB_CURRENCIES as readonly string[]).includes(c);

/** ContentItem.channel (prisma ContentChannel). */
export type PostChannel =
  | "INSTAGRAM_POST" | "INSTAGRAM_CAROUSEL" | "INSTAGRAM_REEL" | "INSTAGRAM_STORY" | "FACEBOOK_POST" | "PINTEREST_PIN"
  | "THREADS_POST" | "LINKEDIN_POST" | "X_POST";

/** A post's numbers from its latest read; null where the platform gives none (show "—", not 0). */
export type PostMetricsDto = {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  interactions: number | null;
  /**
   * Instagram stories only (null for posts): taps forward, back, exits and next-story swipes. A story's numbers are
   * read once, 20 h after its first frame: views, replies (in `comments`), shares and interactions summed over its
   * frames, `reach` the highest frame's (people overlap).
   */
  navigation: number | null;
};

/**
 * GET insights/posts?from&to (analytics.read): one per Instagram, Facebook or Threads post published in the range,
 * Instagram stories included (channel INSTAGRAM_STORY, `final` once read; story numbers follow analytics.read too).
 */
export type PostInsightDto = {
  attemptId: string;
  contentItemId: string;
  title: string | null;
  channel: PostChannel;
  /** ISO instant */
  publishedAt: string;
  /** null until the first read */
  metrics: PostMetricsDto | null;
  /** ISO instant of the latest read ("Updated 3 h ago"), or null */
  readAt: string | null;
  /** Past day 30: these numbers are the last read and won't change */
  final: boolean;
};
export type PostInsightsDto = { posts: PostInsightDto[] };

/** PUT data-sources/shopify-orders: turn on the orders sync for one of the brand's Shopify connections. Never a token. */
export type TurnOnShopifyOrdersBody = { connectionId: string };

/**
 * Order totals over a range, excluding test and cancelled orders. Money is a decimal string in the entry's currency
 * (never added across currencies). gross = netSales + discounts; netSales is after discounts, refunds and edits;
 * refunded is display only (already in netSales and total). Unadjusted: VAT is not taken out.
 */
export type SalesTotals = { orders: number; gross: string; discounts: string; netSales: string; total: string; refunded: string };
export type SalesDay = SalesTotals & { day: string };
/**
 * One currency: totals for from..to, the same-length period just before it, and its days that had orders. Totals are
 * as Shopify reports them (VAT included where the shop's prices include it). `netExVat`: net sales without VAT for
 * exVatFrom..to (exVatFrom null = the whole range; netExVat null = no day of the range has it yet, as orders read
 * before the change don't); `exVatMissing` orders were left out of it (their VAT couldn't be read).
 */
export type SalesCurrency = {
  currency: string;
  totals: SalesTotals;
  previous: SalesTotals;
  days: SalesDay[];
  netExVat: string | null;
  exVatFrom: string | null;
  exVatMissing: number;
};
/** GET sales/summary?from&to (brand-local "YYYY-MM-DD", inclusive). Needs crm.read. */
export type SalesSummaryDto = { currencies: SalesCurrency[] };

// ---- Search Console ----------------------------------------------------------------------------------------------

/** Google reports Search Console days in Pacific time; SearchDay keeps them as Google's days. */
export const SEARCH_CONSOLE_ZONE = "America/Los_Angeles";
/** The longest from..to a search read accepts, in days. */
export const SEARCH_RANGE_MAX_DAYS = 90;

/** GET google/sites?connectionId: the Google account's verified sites, and the brand's chosen one. */
export type SearchSiteDto = { siteUrl: string; permissionLevel: string };
export type SearchSitesDto = { sites: SearchSiteDto[]; chosen: string | null };
/** PUT data-sources/search-console */
export type ChooseSearchSiteBody = { connectionId: string; siteUrl: string };

/** ctr = clicks / impressions; position = impression-weighted average. Both null with no impressions. */
export type SearchMetrics = { clicks: number; impressions: number; ctr: number | null; position: number | null };
export type SearchDayRow = SearchMetrics & { day: string };
export type SearchPageRow = SearchMetrics & { page: string };

export const SEARCH_PAGE_SORTS = ["clicks", "impressions"] as const;
export type SearchPageSort = (typeof SEARCH_PAGE_SORTS)[number];
export const SEARCH_PAGES_LIMIT = 50;

/**
 * GET search/summary?from&to (inclusive "YYYY-MM-DD", Google's days). `hasSite` false: no site chosen yet (all zero).
 * `siteUrl` only for people with integrations.manage (else absent).
 * `previous`: the equal-length range just before. `days`: the SITE rows held in the range (a day not synced yet is
 * missing).
 */
export type SearchSummaryDto = {
  hasSite: boolean;
  siteUrl?: string | null;
  daysIn: typeof SEARCH_CONSOLE_ZONE;
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  totals: SearchMetrics;
  previous: SearchMetrics;
  days: SearchDayRow[];
};

/**
 * GET search/pages?from&to&sort=clicks|impressions&cursor: pages summed over the range, SEARCH_PAGES_LIMIT at a time.
 * Built from each day's top pages, so their sums sit below the site total; say so on screen. `nextCursor` is opaque
 * and only valid with the same sort.
 */
export type SearchPagesDto = { pages: SearchPageRow[]; nextCursor: string | null };

export const SEARCH_QUERIES_LIMIT = 50;
export type SearchQueryRow = SearchMetrics & { query: string };
/**
 * GET search/queries?from&to&sort=clicks|impressions&cursor[&page=<url>]: search queries summed over the range,
 * SEARCH_QUERIES_LIMIT at a time (with `page`: the queries that led to that page, any spelling of its URL).
 * Built from each day's top 500 queries (or query-page pairs), and Google leaves rare queries out for privacy, so the
 * sums sit below the site's (or page's) total: `coverage` is the share they cover over the range's days that have
 * query rows (null when the total is 0). `since`: the first day with query rows for the chosen site (null: none yet).
 */
export type SearchQueriesDto = {
  queries: SearchQueryRow[];
  nextCursor: string | null;
  coverage: { clicks: number | null; impressions: number | null };
  since: string | null;
};

/** GET data-sources. `timeZone`: the brand's zone (dates we bucket ourselves); a provider's own is `reportsInZone`. */
export type DataSourcesDto = { sources: DataSourceDto[]; timeZone: string };

/** Inclusive days, "YYYY-MM-DD". */
export type DateRange = { from: string; to: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: string) => ISO_DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** `?from&to` as real YYYY-MM-DD days, from ≤ to, at most `maxDays` long (both ends counted); else null. */
export function parseRange(from: string | null | undefined, to: string | null | undefined, maxDays: number): DateRange | null {
  if (!from || !to || !isDay(from) || !isDay(to) || from > to) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return days <= maxDays ? { from, to } : null;
}

/** GET meta-ads/accounts?connectionId (integrations.manage): the login's live ad accounts. */
export type MetaAdAccountDto = { id: string; name: string; currency: string; timeZone: string };
/** `connectionAccountId`: the connection's own account ("act_…"), the one PUT data-sources/meta-ads chooses. */
export type MetaAdAccountsDto = { accounts: MetaAdAccountDto[]; connectionAccountId: string };
/** PUT data-sources/meta-ads */
export type ChooseMetaAdAccountBody = { connectionId: string };

/** Ads totals in one currency (never summed across currencies). Money as decimal strings, 2 places. */
export type AdsTotals = {
  currency: string;
  spend: string;
  purchases: number;
  purchaseValue: string;
  /** purchase value ÷ spend, 2 places; null when nothing was spent */
  roas: number | null;
  /** spend ÷ purchases, 2 places; null with no purchases */
  costPerPurchase: string | null;
};

/**
 * Shop revenue (net, without VAT) ÷ ad spend over the same days, the spend converted to the shop's currency through
 * the ECB rates. `ratio` null when nothing was spent, the shop has orders in several currencies, the ex-VAT revenue
 * doesn't cover the range, or a rate is missing (`why` says which). `staleRateFrom`: the oldest rate used when it is
 * more than a week older than its day. Shopify days and ad account days may differ by a few hours.
 */
export type ShopRevenueOverSpend = {
  ratio: number | null;
  currency: string | null;
  /** vat_missing: some orders' VAT couldn't be read, so the revenue would read low. */
  why: "no_spend" | "currencies" | "no_revenue" | "no_rate" | "vat_missing" | null;
  staleRateFrom: string | null;
};

/**
 * GET ads/summary. `shopRevenueOverSpend` only for people who may see sales too (crm.read and ads.read); budgets and
 * pacing come from GET ads/budgets only.
 */
export type AdsSummaryDto = { totals: AdsTotals[]; previous: AdsTotals[]; previousRange: DateRange; shopRevenueOverSpend?: ShopRevenueOverSpend };

/**
 * Meta Ads problems found after an account's daily sync (prisma AdAlertKind): a spend jump, a ROAS drop, a campaign
 * spending without purchases, a budget running over pace.
 */
export const AD_ALERT_KINDS = ["SPEND_UP", "ROAS_DOWN", "NO_PURCHASES", "OVER_PACE"] as const;
export type AdAlertKind = (typeof AD_ALERT_KINDS)[number];

/**
 * Pages losing Google search traffic (prisma SeoAlertKind, server/seo/declines.ts): a page's clicks down, its average
 * position down, or the whole site's clicks down (then no page alerts: a tracking break, a Google change or a season).
 */
export const SEO_ALERT_KINDS = ["CLICKS_DOWN", "POSITION_DOWN", "SITE_DOWN"] as const;
export type SeoAlertKind = (typeof SEO_ALERT_KINDS)[number];
/**
 * One decline episode. `url`: rebuilt by the server (https, host, path), safe as a link and for the URL history page;
 * null for SITE_DOWN. `path`: the page's path, cleaned. `text`: one line, cleaned. `values`: the figures as strings
 * (`now`, `before`, `from`, `to`, `previousFrom`, `previousTo`; `nowAtMost` "true" when hidden days were counted at
 * the day's 500th row).
 */
export type SeoAlertView = {
  id: string;
  kind: SeoAlertKind;
  url: string | null;
  path: string | null;
  firstDay: string;
  lastDay: string;
  open: boolean;
  text: string;
  values: Record<string, string>;
};
/** GET search/declines: the open decline alerts, newest first, at most 50. analytics.read. */
export type SeoDeclinesDto = { alerts: SeoAlertView[] };

/** Platforms a monthly budget can be set for (prisma AdPlatform). Google spend arrives in Phase 3. */
export const AD_BUDGET_PLATFORMS = ["META", "GOOGLE"] as const;
export type AdBudgetPlatform = (typeof AD_BUDGET_PLATFORMS)[number];
/** One platform's budget for a month ("YYYY-MM"), in the currency it was entered in. */
export type AdBudgetDto = { platform: AdBudgetPlatform; month: string; amount: string; currency: string; updatedAt: string };
/**
 * Pacing of a month's budget so far. ok: spend from the 1st to `through` (the least advanced ad account's last full
 * day), converted to the budget's currency, against budget × days elapsed ÷ days in the month: under < 90 %,
 * on 90–110 %, over > 110 %. no_data: no ad account synced into the month yet; no_rate: an exchange rate is missing;
 * google_later: Google Ads spend arrives in Phase 3.
 */
export type PacingDto =
  | { platform: AdBudgetPlatform; state: "ok"; through: string; spent: string; expected: string; ratio: number; status: "under" | "on" | "over"; currency: string; staleRateFrom: string | null }
  | { platform: AdBudgetPlatform; state: "no_data" | "no_rate" | "google_later" };
/** GET ads/budgets?month=YYYY-MM. `defaultCurrency`: the ad account's, else the shop's, else EUR. */
export type AdBudgetsDto = { month: string; budgets: AdBudgetDto[]; pacing: PacingDto[]; defaultCurrency: string };
/** PUT ads/budgets. `amount` a decimal string; "0" removes the month's budget. */
export type SetAdBudgetBody = { platform: AdBudgetPlatform; month: string; amount: string; currency: string };

export type AdsCampaignDto = AdsTotals & { accountId: string; campaignId: string; campaignName: string; impressions: number; clicks: number };
/** GET ads/campaigns, highest spend first. */
export type AdsCampaignsDto = { campaigns: AdsCampaignDto[] };

/** GET insights/channel?channel&days: which account's numbers (Meta here is the Facebook Page). */
export type AnalyticsChannel = "instagram" | "facebook" | "pinterest" | "threads";
export type ChannelDayDto = { day: string; value: number | null };
/**
 * One of the Instagram account's own recent posts (published through the app or not), lifetime numbers. Pinterest:
 * one of the period's top pins by impressions, numbers over the period: only `id`, `permalink` and metrics views
 * (impressions), saves and interactions (engagements) are filled, the rest null.
 */
export type ChannelPostDto = {
  id: string;
  /** IMAGE, VIDEO, CAROUSEL_ALBUM */
  mediaType: string | null;
  /** FEED, REELS, STORY */
  productType: string | null;
  /** ISO instant */
  postedAt: string | null;
  caption: string | null;
  permalink: string | null;
  /**
   * Instagram: a picture of the post (a video's cover, else the image; a carousel's first item), an https link from
   * Instagram's CDN that expires after a while. Null when there is none (Pinterest, Threads); older servers omit it.
   */
  thumbnailUrl: string | null;
  metrics: PostMetricsDto | null;
};
/**
 * GET insights/channel?channel=instagram|facebook|pinterest|threads&days (1–30, default 28; analytics.read): the account's own numbers,
 * read live from the platform (cached up to 15 minutes). Never a token, never the platform's own metric titles.
 * `state`: "not_connected" (no account) or "reconnect" (its access is gone) come with nothing else filled in.
 * Any number is null when the platform refused it or the audience is too small for it. `partial`: some reads timed
 * out or were rate limited, so some numbers are missing this time.
 */
export type ChannelAnalyticsDto = {
  channel: AnalyticsChannel;
  state: "ok" | "not_connected" | "reconnect";
  /** The account's name ("@handle", the Page's name); null when not connected. Pinterest `posts`: pin count; Threads: null. */
  account: { name: string; followers: number | null; posts: number | null } | null;
  days: number;
  /** "YYYY-MM-DD" (UTC), inclusive */
  from: string;
  to: string;
  /**
   * Totals over the days. Instagram: reach (unique accounts), views, accountsEngaged, interactions, likes, comments,
   * shares, saves, linkTaps, newFollowers (new follows per day added up). Facebook: views (media views), engagements
   * (post engagements), pageViews, newFollowers; reach is null (daily unique counts can't be added up).
   * Pinterest: impressions, saves, pinClicks, outboundClicks, engagements, and monthlyViews (the account's own rolling
   * monthly figure, not over the days; the key is absent when Pinterest doesn't give it).
   * Threads: views, likes, comments (replies), shares (reposts), quotes.
   */
  totals: Record<string, number | null>;
  /**
   * Instagram: reach per day. Facebook: media views per day. Pinterest: impressions per day (null for days Pinterest
   * hasn't finished counting). Threads: views per day.
   */
  daily: ChannelDayDto[];
  /** Facebook: post engagements per day; Pinterest: engagements per day (null for unfinished days); Instagram, Threads: null. */
  dailyEngagements: ChannelDayDto[] | null;
  /** New followers per day (Instagram: the last 30 days at most); Pinterest, Threads: always empty. */
  followersDaily: ChannelDayDto[];
  /** Instagram: followers by country (ISO 3166 code), top 5; null for the others or when too few followers. */
  countries: { country: string; followers: number }[] | null;
  /**
   * Instagram: the account's latest posts with lifetime numbers. Pinterest: the period's top 5 pins by impressions.
   * Null for Facebook (needs a permission not granted) and Threads.
   */
  posts: ChannelPostDto[] | null;
  partial: boolean;
  /** ISO instant the numbers were read */
  readAt: string;
};
