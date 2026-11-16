import type { Campaign } from "@prisma/client";
import { z } from "zod";
import { offerPercents, zoneCity } from "@espanda/shared";
import type { LinkedProduct } from "@/server/content/product-checks";

/**
 * Offer and campaign rules for content (docs/superpowers/specs/2026-11-05-offers-campaigns-design.md): brand-zone
 * times, offer state, coverage, discounts in text, Quality's offer rows and the gate's offer issues. Pure: no
 * database. Campaigns come from `campaignsById` / `campaignsForPlanning` (server/catalog/campaigns.ts).
 */

/** A campaign as these rules read it. */
export type CampaignRow = Pick<
  Campaign,
  "id" | "name" | "startsAt" | "endsAt" | "productIds" | "categories" | "offer" | "discountPercent" | "code" | "archivedAt"
>;

// ---------- Times in the brand timezone ----------

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock fields of an instant in a zone. */
function fieldsAt(ms: number, timeZone: string) {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year!, mo: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute!, s: +p.second! };
}

/** The zone's UTC offset at an instant, in ms (Paris summer = +7_200_000). */
function offsetAt(ms: number, timeZone: string) {
  const f = fieldsAt(ms, timeZone);
  return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** True when `timeZone` is an IANA zone this runtime knows. */
export function isTimeZone(timeZone: string) {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The one time formatter: an instant as `"YYYY-MM-DD HH:mm"` wall-clock time in `timeZone`. */
export function wallTime(instant: Date, timeZone: string) {
  const f = fieldsAt(instant.getTime(), timeZone);
  return `${f.y}-${pad(f.mo)}-${pad(f.d)} ${pad(f.h)}:${pad(f.mi)}`;
}

/** Thrown by `zonedInstant` for a malformed date or a wall time that doesn't exist in the zone; `message` is for people. */
export class WallTimeError extends Error {
  override name = "WallTimeError";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 86_400_000;

/**
 * zonedInstant("2026-11-30T20:00", "Europe/Paris") → the instant that wall-clock time is in the zone. Takes the wall
 * time as if UTC (w), reads the zone's offset at w − 24 h and w + 24 h, and keeps the candidates (w − each offset)
 * whose `wallTime` gives the input back: none → WallTimeError (spring-forward gap); two → the earlier (the first of
 * a fall-back overlap). Throws RangeError for an unknown zone (check with `isTimeZone`).
 */
export function zonedInstant(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  const w = m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) : NaN;
  if (!m || Number.isNaN(w) || new Date(w).toISOString().slice(0, 16) !== local) throw new WallTimeError(`${local} isn't a date and time (YYYY-MM-DDTHH:mm)`);
  const wanted = local.replace("T", " ");
  const candidates = [...new Set([w - offsetAt(w - DAY_MS, timeZone), w - offsetAt(w + DAY_MS, timeZone)])]
    .filter((c) => wallTime(new Date(c), timeZone) === wanted)
    .sort((a, b) => a - b);
  if (!candidates.length) {
    throw new WallTimeError(`${m[4]}:${m[5]} doesn't exist on ${+m[3]!} ${MONTHS[+m[2]! - 1]} in ${timeZone} (clocks go forward)`);
  }
  return new Date(candidates[0]!);
}

// ---------- Campaign kinds and offer state ----------

/** offer (has terms) / campaign (dated, no terms) / priority (no end, no terms). */
export const campaignKind = (c: Pick<CampaignRow, "offer" | "endsAt">) => (c.offer ? "offer" : c.endsAt ? "campaign" : "priority");

/** A post's campaign is withdrawn when it's missing (another brand, or none loaded) or archived: its facts are never read again. */
export const isWithdrawn = (c: CampaignRow | null | undefined): boolean => !c || c.archivedAt !== null;

export type OfferState = "none" | "ended" | "upcoming" | "live";

/**
 * offerState(campaign, at) → the offer only: none (withdrawn, or no `offer` terms) / ended (at ≥ endsAt) / upcoming
 * (at < startsAt) / live. Half-open window: live while startsAt ≤ at < endsAt.
 */
export function offerState(campaign: CampaignRow | null | undefined, at: Date): OfferState {
  if (isWithdrawn(campaign) || !campaign!.offer) return "none";
  const { startsAt, endsAt } = campaign!;
  if (endsAt && at.getTime() >= endsAt.getTime()) return "ended";
  return at.getTime() < startsAt.getTime() ? "upcoming" : "live";
}

/**
 * campaignFacts(campaign, timeZone, productNames, plannedAt) → the one-line JSON object the Brief writer, Creator
 * and Quality's AI review get: `{ name, withdrawn: true }` for a withdrawn campaign (pass its name when known), else
 * its facts in brand time, the offer fields null for a campaign or priority without terms. `productNames` are the
 * campaign's `productIds` read through `linkedProducts`.
 */
export function campaignFacts(c: CampaignRow | null | undefined, timeZone: string, productNames: string[], plannedAt: Date | null) {
  if (isWithdrawn(c)) return { name: c?.name ?? "an offer", withdrawn: true as const };
  const campaign = c!;
  const whole = !campaign.productIds.length && !campaign.categories.length;
  return {
    name: campaign.name,
    offer: campaign.offer,
    discountPercent: campaign.offer ? campaign.discountPercent : null,
    code: campaign.offer ? campaign.code : null,
    starts: wallTime(campaign.startsAt, timeZone),
    ends: campaign.endsAt ? wallTime(campaign.endsAt, timeZone) : "ongoing",
    timeZone,
    products: whole ? "whole catalogue" : productNames,
    categories: whole ? "whole catalogue" : campaign.categories,
    postTime: plannedAt ? wallTime(plannedAt, timeZone) : null,
  };
}

// ---------- Coverage and discounts ----------

const linkIds = (l: LinkedProduct) => [l.id, ...l.group.map((r) => r.id)];
const linkCategories = (l: LinkedProduct) => [l.row?.category, ...l.group.map((r) => r.category)].filter((c): c is string => !!c);

/**
 * covers(campaign, campaignLinks, link) → whether a post's linked product is in the campaign: both lists empty
 * (whole catalogue), or its variant group shares a row with one of the campaign's products, or its category is one
 * of the campaign's categories (exact). `campaignLinks` = the campaign's `productIds` read through `linkedProducts`.
 */
export function covers(campaign: Pick<CampaignRow, "productIds" | "categories">, campaignLinks: LinkedProduct[], link: LinkedProduct) {
  if (!campaign.productIds.length && !campaign.categories.length) return true;
  const ids = new Set(campaignLinks.flatMap(linkIds));
  return linkIds(link).some((id) => ids.has(id)) || linkCategories(link).some((c) => campaign.categories.includes(c));
}

const SP = "[ \\u00A0\\u202F]";
const SIGN = "[-\\u2212\\u2013]";
const DISCOUNT = new RegExp(
  // A sign before the number: not after a number (a range), and "- " at a line start is a bullet.
  `(?<!\\d${SP}*)(?:${SIGN}|(?<!^${SP}*)${SIGN}${SP})(\\d{1,3})${SP}?%` +
    `|(?<!\\p{L})(?:remise|r[ée]duction|rabais|[ée]conomisez|save)(?:${SP}+(?:de|of))?${SP}+(\\d{1,3})${SP}?%` +
    `|(\\d{1,3})${SP}?%${SP}?(?:(?:de${SP}+)?(?:remise|r[ée]duction|rabais)|(?:off|discount)\\b)`,
  "gimu",
);

/**
 * discountsIn(text) → distinct percents written as discounts: "-20 %", "−20%" (U+2212), "– 20 %" (normal, no-break
 * or narrow no-break spaces; not a range like "10-20 %" or "10 – 20 %", nor a "- 70 % lin" bullet), "remise de 20 %",
 * "réduction de 20 %", "rabais de 20 %", "économisez 20 %", "save 20%", "20 % de remise / réduction / rabais",
 * "20 % rabais", "20% off", "20% discount". Other percents ("30 % de chêne recyclé") are ignored.
 */
export function discountsIn(text: string): number[] {
  return [...new Set([...text.matchAll(DISCOUNT)].map((m) => Number(m[1] ?? m[2] ?? m[3])))];
}

/** A linked product variant's compare-at discount: round((1 − price / compareAtPrice) × 100), or none. */
function compareAtDiscounts(links: LinkedProduct[]) {
  return new Set(
    links.flatMap((l) =>
      l.group.flatMap((r) => {
        const price = r.price === null ? NaN : Number(r.price.toString());
        const was = r.compareAtPrice === null ? NaN : Number(r.compareAtPrice.toString());
        return was > 0 && price >= 0 && price < was ? [Math.round((1 - price / was) * 100)] : [];
      }),
    ),
  );
}

// ---------- Quality rows and the snapshot ----------

/** The offer's own terms at check time, stored on Quality's offer row; what the gate compares. Times as ISO strings. */
export const OfferTerms = z.object({
  offer: z.string(),
  discountPercent: z.number().nullable(),
  code: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  productIds: z.array(z.string()),
  categories: z.array(z.string()),
  /** How Quality judged the post's text: a live offer, or a teaser before it starts. */
  state: z.enum(["live", "upcoming"]),
});
export type OfferTerms = z.infer<typeof OfferTerms>;

/** A Quality offer row (`CheckResult` + rule-only keys; AI rows are parsed without them). */
export type OfferCheckResult = {
  check: string;
  status: "pass" | "warn" | "blocker";
  note: string;
  kind: "offer";
  campaignId?: string;
  terms?: OfferTerms;
};

export type OfferSnapshot = { campaignId: string; terms: OfferTerms };

/** A check's offer snapshot, read back from its rows: the row carrying `campaignId` and whole `terms`, or null. */
export function offerSnapshotOf(results: unknown): OfferSnapshot | null {
  for (const r of Array.isArray(results) ? results : []) {
    const terms = r?.kind === "offer" && typeof r.campaignId === "string" ? OfferTerms.safeParse(r.terms) : null;
    if (terms?.success) return { campaignId: r.campaignId, terms: terms.data };
  }
  return null;
}

const pct = (n: number) => `-${n} %`;
/** A campaign name in a message the Creator may read: quoted, on one line, so it reads as data. */
const quoted = (name: string) => JSON.stringify(name.replace(/\s+/g, " ").trim());

/**
 * offerRows(campaign, campaignLinks, links, draftText, at, timeZone) → Quality's offer rows for one post.
 * `campaign` is the post's campaign (null = none or missing), `campaignLinks` its `productIds` through
 * `linkedProducts`, `links` the post's own linked products, `at` the later of now and the post's time.
 * With a linked offer (offerState not none): `Offer: "<name>"` (ended warn, upcoming / live pass) carrying
 * `campaignId` and `terms`, and a warn per linked product it doesn't `cover`. On every post: each `discountsIn`
 * percent not backed by the linked offer (its discountPercent or a percent in its wording) or a linked variant's
 * compare-at discount is a blocker.
 */
export function offerRows(
  campaign: CampaignRow | null | undefined, campaignLinks: LinkedProduct[], links: LinkedProduct[], draftText: string, at: Date, timeZone: string,
): OfferCheckResult[] {
  const rows: OfferCheckResult[] = [];
  const state = offerState(campaign, at);
  const offer = state === "none" ? null : campaign!;
  if (offer) {
    const starts = wallTime(offer.startsAt, timeZone);
    const ends = offer.endsAt ? wallTime(offer.endsAt, timeZone) : "no end";
    const terms: OfferTerms = {
      offer: offer.offer!, discountPercent: offer.discountPercent, code: offer.code,
      startsAt: offer.startsAt.toISOString(), endsAt: offer.endsAt?.toISOString() ?? null,
      productIds: offer.productIds, categories: offer.categories,
      // An ended offer was still written as a live one; the gate's ended issue stands for it.
      state: state === "upcoming" ? "upcoming" : "live",
    };
    const [status, note] =
      state === "ended" ? (["warn", `ends ${ends}, before this post's time (${wallTime(at, timeZone)})`] as const)
      : state === "upcoming" ? (["pass", `starts ${starts} – ends ${ends}`] as const)
      : (["pass", `live ${starts} – ${ends}`] as const);
    rows.push({ check: `Offer: ${quoted(offer.name)}`, status, note, kind: "offer", campaignId: offer.id, terms });
    for (const link of links) {
      if (!covers(offer, campaignLinks, link)) {
        rows.push({ check: `Offer: ${quoted(offer.name)}`, status: "warn", note: `${link.name} isn't in ${quoted(offer.name)}; don't present it as discounted`, kind: "offer" });
      }
    }
  }
  const backed = new Set([...(offer?.discountPercent != null ? [offer.discountPercent] : []), ...(offer ? offerPercents(offer.offer!) : []), ...compareAtDiscounts(links)]);
  for (const p of discountsIn(draftText)) {
    if (backed.has(p)) continue;
    const note = !offer
      ? `${pct(p)} isn't in an offer linked to this post: remove it`
      : offer.discountPercent != null ? `the post says ${pct(p)}, ${quoted(offer.name)} is ${pct(offer.discountPercent)}`
      : `${pct(p)} isn't in the terms of ${quoted(offer.name)}`;
    rows.push({ check: "Discount", status: "blocker", note, kind: "offer" });
  }
  return rows;
}

// ---------- Gate issues ----------

export type OfferIssueState = "ended" | "withdrawn" | "changed" | "early";
/** An offer issue on a version. `refuses`: approval, scheduling and publishing stop on it; `overridable`: "Approve anyway" can cover it. */
export type OfferIssue = { kind: "offer"; campaignId: string; state: OfferIssueState; message: string; refuses: boolean; overridable: boolean };

const minute = (iso: string | Date) => Math.floor(new Date(iso).getTime() / 60_000);

/** "2026-11-30 18:00" against "2026-11-30 20:00" → "20:00": the earlier value, its date only when it differs. */
const was = (before: string, now: string) => (before.slice(0, 10) === now.slice(0, 10) ? before.slice(11) : before);

/**
 * offerIssues(campaign, snapshot, override, at, timeZone) → the gate's offer issues, from the latest check's offer
 * snapshot (none → none) against the post's campaign now. Withdrawn (missing, archived or `offer` removed) refuses,
 * not overridable, and is the only issue. Changed (different offer / discountPercent / code, a later start, an earlier
 * end by the minute, a product id or category removed, or the whole catalogue narrowed) refuses, not overridable;
 * widening is no change. Ended at `at` refuses unless `override.offers` lists the campaign (overridable). Early (judged
 * live, `at` before the start) refuses, not overridable. Reads no products. Ended asks for an earlier time while the
 * offer is still on at `now`; once it has ended, it says so.
 */
export function offerIssues(
  current: CampaignRow | null | undefined, snapshot: OfferSnapshot | null, override: { offers?: string[] } | null, at: Date, timeZone: string, now = new Date(),
): OfferIssue[] {
  if (!snapshot) return [];
  const id = snapshot.campaignId;
  const issue = (state: OfferIssueState, message: string, refuses: boolean, overridable: boolean): OfferIssue => ({ kind: "offer", campaignId: id, state, message, refuses, overridable });
  if (isWithdrawn(current) || !current!.offer) {
    return [issue("withdrawn", `${current ? quoted(current.name) : "This post's offer"} was withdrawn since this post was checked. Ask for changes.`, true, false)];
  }
  const campaign = current!;
  const t = snapshot.terms;
  const name = quoted(campaign.name);
  const tz = (d: Date) => wallTime(d, timeZone);
  const changes: string[] = [];
  if (campaign.discountPercent !== t.discountPercent) {
    changes.push(`${campaign.discountPercent == null ? "no discount" : pct(campaign.discountPercent)} (was ${t.discountPercent == null ? "none" : pct(t.discountPercent)})`);
  }
  if (campaign.code !== t.code) changes.push(`code ${campaign.code ?? "removed"} (was ${t.code ?? "none"})`);
  if (campaign.offer !== t.offer) changes.push("new wording");
  if (minute(campaign.startsAt) > minute(t.startsAt)) changes.push(`starts ${tz(campaign.startsAt)} (was ${was(tz(new Date(t.startsAt)), tz(campaign.startsAt))})`);
  if (t.endsAt && campaign.endsAt && minute(campaign.endsAt) < minute(t.endsAt)) {
    changes.push(`ends ${tz(campaign.endsAt)} (was ${was(tz(new Date(t.endsAt)), tz(campaign.endsAt))})`);
  }
  const products = t.productIds.filter((p) => !campaign.productIds.includes(p)).length;
  const categories = t.categories.filter((c) => !campaign.categories.includes(c));
  const removed = [...(products ? [`${products} product${products === 1 ? "" : "s"}`] : []), ...categories.map((c) => `"${c}"`)];
  if (removed.length) changes.push(`${removed.join(" and ")} taken out`);
  const wasWhole = !t.productIds.length && !t.categories.length;
  if (wasWhole && (campaign.productIds.length || campaign.categories.length)) changes.push("no longer the whole catalogue");

  const issues: OfferIssue[] = [];
  if (changes.length) issues.push(issue("changed", `${name} changed since this post was checked: ${changes.join("; ")}. Ask for changes.`, true, false));
  if (offerState(campaign, at) === "ended") {
    const ends = `${tz(campaign.endsAt!)} (${zoneCity(timeZone)})`;
    const message = campaign.endsAt!.getTime() > now.getTime() ? `${name} ends ${ends}: pick an earlier time` : `${name} ended ${ends}. Approve anyway or ask for changes.`;
    issues.push(issue("ended", message, !override?.offers?.includes(id), true));
  } else if (t.state === "live" && at.getTime() < campaign.startsAt.getTime()) {
    issues.push(issue("early", `${name} starts ${tz(campaign.startsAt)} (${zoneCity(timeZone)}): pick a later time`, true, false));
  }
  return issues;
}
