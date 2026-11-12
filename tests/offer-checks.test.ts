import { describe, expect, it } from "vitest";
import type { LinkedProduct, ProductRow } from "@/server/content/product-checks";
import {
  campaignFacts, covers, discountsIn, offerIssues, offerRows, offerSnapshotOf, offerState, wallTime, WallTimeError, zonedInstant,
  type CampaignRow,
} from "@/server/content/offer-checks";

const PARIS = "Europe/Paris";
const at = (iso: string) => new Date(iso);

function campaign(over: Partial<CampaignRow> = {}): CampaignRow {
  return {
    id: "c1", name: "Black Friday", startsAt: at("2026-11-27T07:00:00Z"), endsAt: at("2026-11-30T19:00:00Z"), // 08:00 – 20:00 Paris
    productIds: [], categories: [], offer: "-20 % sur tout le site", discountPercent: 20, code: "BF20", archivedAt: null, ...over,
  };
}

function row(id: string, over: Partial<ProductRow> = {}): ProductRow {
  return {
    id, source: "WEBSITE", externalId: id, title: "Milo Sofa — Linen", url: `https://shop.example/products/${id}`, category: "Sofas",
    materials: null, dimensions: null, certifications: null, currency: "EUR", inStock: true, stockQuantity: null, stockCheckedAt: null,
    imageUrl: null, archivedAt: null, price: "100.00", compareAtPrice: null, ...over,
  };
}
const link = (id: string, over: Partial<ProductRow> = {}, group?: ProductRow[]): LinkedProduct => {
  const r = row(id, over);
  return { id, row: r, group: group ?? [r], name: r.title.split(" — ")[0]!, state: "in" };
};

describe("zonedInstant / wallTime", () => {
  it("Paris winter and summer offsets", () => {
    expect(zonedInstant("2026-11-30T20:00", PARIS).toISOString()).toBe("2026-11-30T19:00:00.000Z");
    expect(zonedInstant("2026-07-14T20:00", PARIS).toISOString()).toBe("2026-07-14T18:00:00.000Z");
  });

  it("a spring-forward gap time is an error naming it", () => {
    expect(() => zonedInstant("2026-03-29T02:30", PARIS)).toThrow(WallTimeError);
    expect(() => zonedInstant("2026-03-29T02:30", PARIS)).toThrow("02:30 doesn't exist on 29 March in Europe/Paris (clocks go forward)");
  });

  it("a fall-back overlap time is its first occurrence", () => {
    expect(zonedInstant("2026-10-25T02:30", PARIS).toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(zonedInstant("2026-04-05T02:30", "Pacific/Auckland").toISOString()).toBe("2026-04-04T13:30:00.000Z");
  });

  it("a window over a change is converted per end", () => {
    const hours = (zonedInstant("2026-10-26T00:00", PARIS).getTime() - zonedInstant("2026-10-24T00:00", PARIS).getTime()) / 3_600_000;
    expect(hours).toBe(49);
  });

  it("round trips and rejects non-dates", () => {
    for (const local of ["2026-11-30T20:00", "2026-07-01T00:00", "2026-10-25T03:00", "2026-03-29T03:00"]) {
      expect(wallTime(zonedInstant(local, PARIS), PARIS)).toBe(local.replace("T", " "));
    }
    expect(() => zonedInstant("2026-02-30T10:00", PARIS)).toThrow(WallTimeError);
    expect(() => zonedInstant("2026-11-30 20:00", PARIS)).toThrow(WallTimeError);
  });
});

describe("offerState", () => {
  const c = campaign();
  it("half-open window", () => {
    expect(offerState(c, c.endsAt!)).toBe("ended");
    expect(offerState(c, new Date(c.endsAt!.getTime() - 1))).toBe("live");
    expect(offerState(c, c.startsAt)).toBe("live");
    expect(offerState(c, new Date(c.startsAt.getTime() - 1))).toBe("upcoming");
  });
  it("archived, missing and no-offer campaigns have no offer", () => {
    expect(offerState(campaign({ archivedAt: at("2026-11-28T00:00:00Z") }), at("2026-11-28T12:00:00Z"))).toBe("none");
    expect(offerState(null, at("2026-11-28T12:00:00Z"))).toBe("none");
    expect(offerState(campaign({ offer: null, discountPercent: null, code: null }), at("2026-11-28T12:00:00Z"))).toBe("none");
  });
});

describe("campaignFacts", () => {
  it("a withdrawn campaign is only its name", () => {
    expect(campaignFacts(campaign({ archivedAt: new Date() }), PARIS, [], null)).toEqual({ name: "Black Friday", withdrawn: true });
  });
  it("a standing priority reaches the writers with null offer fields", () => {
    const facts = campaignFacts(campaign({ name: "Oak dining", endsAt: null, offer: null, discountPercent: null, code: null, categories: ["Tables"] }), PARIS, [], at("2026-11-28T09:00:00Z"));
    expect(facts).toMatchObject({ name: "Oak dining", offer: null, discountPercent: null, code: null, ends: "ongoing", categories: ["Tables"], postTime: "2026-11-28 10:00" });
  });
});

describe("covers", () => {
  const milo = link("m1", {}, [row("m1"), row("m2", { url: "https://shop.example/products/m1" })]);
  it("whole catalogue, product, variant group and category", () => {
    expect(covers(campaign(), [], milo)).toBe(true);
    expect(covers(campaign({ productIds: ["m1"] }), [link("m1")], milo)).toBe(true);
    expect(covers(campaign({ productIds: ["m2"] }), [link("m2")], milo)).toBe(true);
    expect(covers(campaign({ categories: ["Sofas"] }), [], milo)).toBe(true);
    expect(covers(campaign({ categories: ["Tables"], productIds: ["t1"] }), [link("t1")], milo)).toBe(false);
  });
});

describe("discountsIn", () => {
  it("reads discounts in their spellings", () => {
    expect(discountsIn("Tout à -20 % !")).toEqual([20]);
    expect(discountsIn("Tout à −20%")).toEqual([20]);
    expect(discountsIn("Tout à – 20 %")).toEqual([20]);
    expect(discountsIn("-25 %")).toEqual([25]);
    expect(discountsIn("30 % de remise, 15% de réduction")).toEqual([30, 15]);
    expect(discountsIn("40% off everything")).toEqual([40]);
    expect(discountsIn("jusqu'à -30 % sur le salon")).toEqual([30]);
    expect(discountsIn("Remise de 25 % ce week-end")).toEqual([25]);
    expect(discountsIn("25 % de rabais")).toEqual([25]);
    expect(discountsIn("25% discount")).toEqual([25]);
    expect(discountsIn("save 25%")).toEqual([25]);
    expect(discountsIn("Économisez 25 % sur le salon")).toEqual([25]);
    expect(discountsIn("Promo\n-20 % sur tout")).toEqual([20]);
  });
  it("ignores other percents", () => {
    expect(discountsIn("30 % de chêne recyclé")).toEqual([]);
    expect(discountsIn("10-20 % de lin recyclé")).toEqual([]);
    expect(discountsIn("Composition :\n- 70 % lin\n- 30 % coton")).toEqual([]);
    expect(discountsIn("entre 10 – 20 % d'humidité")).toEqual([]);
  });
});

describe("offerRows", () => {
  const live = at("2026-11-28T12:00:00Z");
  it("a matching percent passes and the row carries the terms", () => {
    const rows = offerRows(campaign({ productIds: ["m1"], categories: ["Sofas"] }), [link("m1")], [], "Black Friday : -20 % avec BF20", live, PARIS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ check: 'Offer: "Black Friday"', status: "pass", note: "live 2026-11-27 08:00 – 2026-11-30 20:00", campaignId: "c1" });
    expect(rows[0]!.terms).toEqual({
      offer: "-20 % sur tout le site", discountPercent: 20, code: "BF20", startsAt: "2026-11-27T07:00:00.000Z", endsAt: "2026-11-30T19:00:00.000Z",
      productIds: ["m1"], categories: ["Sofas"], state: "live",
    });
    expect(offerSnapshotOf(rows)).toEqual({ campaignId: "c1", terms: rows[0]!.terms });
  });

  it("a tiered offer backs each of its percents", () => {
    const c = campaign({ offer: "-10 % dès 2, -20 % dès 3", discountPercent: null });
    expect(offerRows(c, [], [], "-10 % dès 2 articles, -20 % dès 3", live, PARIS).filter((r) => r.status === "blocker")).toEqual([]);
  });

  it("an offer with no discountPercent: its wording's percents pass, others block", () => {
    const c = campaign({ offer: "30 % sur tout le salon", discountPercent: null });
    expect(offerRows(c, [], [], "Le salon à -30 %", live, PARIS).filter((r) => r.status === "blocker")).toEqual([]);
    const blocked = offerRows(c, [], [], "Le salon à -40 %", live, PARIS).filter((r) => r.status === "blocker");
    expect(blocked.map((r) => r.note)).toEqual([`-40 % isn't in the terms of "Black Friday"`]);
  });

  it("a linked product's compare-at discount passes, rounded", () => {
    const sale = link("m1", { price: "66.50", compareAtPrice: "95.00" }); // 30 %
    expect(offerRows(null, [], [sale], "Milo à -30 %", live, PARIS)).toEqual([]);
  });

  it("mismatch, another offer's percent and a percent without a campaign block", () => {
    expect(offerRows(campaign(), [], [], "-30 % ce week-end", live, PARIS).find((r) => r.status === "blocker")?.note).toBe('the post says -30 %, "Black Friday" is -20 %');
    expect(offerRows(null, [], [], "-20 % ce week-end", live, PARIS)).toEqual([
      { check: "Discount", status: "blocker", note: "-20 % isn't in an offer linked to this post: remove it", kind: "offer" },
    ]);
  });

  it("an archived offer's percent still in the text: no offer row, a blocker", () => {
    const rows = offerRows(campaign({ archivedAt: live }), [], [], "-20 % !", live, PARIS);
    expect(rows.map((r) => r.status)).toEqual(["blocker"]);
    expect(offerSnapshotOf(rows)).toBeNull();
  });

  it("a linked product outside the offer's products and categories warns", () => {
    const rows = offerRows(campaign({ productIds: ["t1"], categories: ["Tables"] }), [link("t1", { category: "Tables" })], [link("m1")], "", live, PARIS);
    expect(rows.find((r) => r.status === "warn")?.note).toBe(`Milo Sofa isn't in "Black Friday"; don't present it as discounted`);
  });

  it("ended at the post's time warns; the same day earlier passes; upcoming says starts", () => {
    expect(offerRows(campaign(), [], [], "", at("2026-11-30T20:00:00Z"), PARIS)[0]).toMatchObject({
      status: "warn", note: "ends 2026-11-30 20:00, before this post's time (2026-11-30 21:00)",
    });
    expect(offerRows(campaign(), [], [], "", at("2026-11-30T17:00:00Z"), PARIS)[0]!.status).toBe("pass");
    const upcoming = offerRows(campaign(), [], [], "", at("2026-11-20T10:00:00Z"), PARIS)[0]!;
    expect(upcoming).toMatchObject({ status: "pass", note: "starts 2026-11-27 08:00 – ends 2026-11-30 20:00" });
    expect(upcoming.terms!.state).toBe("upcoming");
  });

  it("dated and standing campaigns without an offer have no row", () => {
    expect(offerRows(campaign({ offer: null, discountPercent: null, code: null }), [], [], "", live, PARIS)).toEqual([]);
    expect(offerRows(campaign({ offer: null, discountPercent: null, code: null, endsAt: null }), [], [], "", live, PARIS)).toEqual([]);
  });
});

describe("offerIssues", () => {
  const checked = at("2026-11-28T12:00:00Z");
  const snap = (over: Partial<CampaignRow> = {}, when = checked) => offerSnapshotOf(offerRows(campaign(over), [], [], "", when, PARIS));

  it("no offer row raises nothing; an unchanged live offer raises nothing", () => {
    expect(offerIssues(campaign(), null, null, checked, PARIS)).toEqual([]);
    expect(offerIssues(campaign(), snap(), null, checked, PARIS)).toEqual([]);
    expect(offerIssues(campaign({ offer: null, discountPercent: null, code: null }), snap({ offer: null }), null, checked, PARIS)).toEqual([]);
  });

  it("ended refuses; an override listing the campaign covers it", () => {
    const end = at("2026-11-30T19:00:00Z");
    expect(offerIssues(campaign(), snap(), null, end, PARIS, checked)).toEqual([
      { kind: "offer", campaignId: "c1", state: "ended", message: '"Black Friday" ends 2026-11-30 20:00 (Paris): pick an earlier time', refuses: true, overridable: true },
    ]);
    expect(offerIssues(campaign(), snap(), null, end, PARIS, end)[0]!.message).toBe('"Black Friday" ended 2026-11-30 20:00 (Paris). Approve anyway or ask for changes.');
    expect(offerIssues(campaign(), snap(), { offers: ["c1"] }, end, PARIS, checked)[0]).toMatchObject({ state: "ended", refuses: false });
  });

  it("withdrawn (archived, missing or terms removed) refuses and isn't overridable", () => {
    for (const now of [campaign({ archivedAt: checked }), null, campaign({ offer: null, discountPercent: null, code: null })]) {
      const [issue, ...rest] = offerIssues(now, snap(), { offers: ["c1"] }, checked, PARIS);
      expect(rest).toEqual([]);
      expect(issue).toMatchObject({ state: "withdrawn", refuses: true, overridable: false });
    }
  });

  it.each([
    [{ discountPercent: 15 }, "-15 % (was -20 %)"],
    [{ code: "BF15" }, "code BF15 (was BF20)"],
    [{ offer: "-20 % sur le salon" }, "new wording"],
    [{ startsAt: at("2026-11-28T07:00:00Z") }, "starts 2026-11-28 08:00 (was 2026-11-27 08:00)"],
    [{ endsAt: at("2026-11-30T17:00:00Z") }, "ends 2026-11-30 18:00 (was 20:00)"],
  ] as [Partial<CampaignRow>, string][])("a change refuses and isn't overridable: %o", (change, says) => {
    const issues = offerIssues(campaign(change), snap(), { offers: ["c1"] }, checked, PARIS).filter((i) => i.state === "changed");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ refuses: true, overridable: false });
    expect(issues[0]!.message).toContain(says);
  });

  it("products or categories taken out, or the whole catalogue narrowed, is a change", () => {
    const before = snap({ productIds: ["p1", "p2"], categories: ["Tables", "Sofas"] });
    expect(offerIssues(campaign({ productIds: ["p1"], categories: ["Sofas"] }), before, null, checked, PARIS)[0]!.message).toBe(
      '"Black Friday" changed since this post was checked: 1 product and "Tables" taken out. Ask for changes.',
    );
    expect(offerIssues(campaign({ categories: ["Sofas"] }), snap(), null, checked, PARIS)[0]!.message).toContain("no longer the whole catalogue");
  });

  it("a later end and added products or categories are no change", () => {
    const before = snap({ productIds: ["p1"] });
    expect(offerIssues(campaign({ productIds: ["p1", "p2"], categories: ["Sofas"], endsAt: at("2026-12-01T19:00:00Z") }), before, null, checked, PARIS)).toEqual([]);
  });

  it("a live-judged post before the start refuses; an upcoming-judged one doesn't", () => {
    const early = at("2026-11-26T12:00:00Z");
    expect(offerIssues(campaign(), snap(), null, early, PARIS)).toEqual([
      { kind: "offer", campaignId: "c1", state: "early", message: '"Black Friday" starts 2026-11-27 08:00 (Paris): pick a later time', refuses: true, overridable: false },
    ]);
    expect(offerIssues(campaign(), snap({}, at("2026-11-20T12:00:00Z")), null, early, PARIS)).toEqual([]);
  });
});
