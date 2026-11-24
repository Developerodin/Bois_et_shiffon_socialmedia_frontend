import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DigestView } from "@/components/digest/digest-view";
import { navFor } from "@/lib/nav";
import type { DigestDto } from "@/shared";

const week = { from: "2026-11-16", to: "2026-11-22" };
const digest: DigestDto = {
  id: "d1",
  weekStart: "2026-11-16",
  createdAt: "2026-11-23T08:10:00.000Z",
  body: {
    brands: [
      {
        brandId: "b1",
        brandName: "Bois & Chiffons",
        week,
        sections: [
          { kind: "content", key: "brand.read", published: 4, scheduled: 2, awaitingApproval: 1 },
          { kind: "tasks", key: "tasks.read", crm: false, done: 3, open: 5, overdue: 1, overdueTasks: [{ id: "t1", title: "Fix the footer" }] },
          { kind: "sales", key: "crm.read", data: [{ currency: "EUR", orders: 12, netSales: "840.00" }, { currency: "USD", orders: 1, netSales: "40.00" }] },
          { kind: "ads", key: "ads.read", data: null },
        ],
      },
    ],
  },
};

describe("digest page", () => {
  it("renders the sections present, currencies apart, and No data yet for a source never synced", () => {
    const html = renderToStaticMarkup(createElement(DigestView, { digests: [digest] }));
    expect(html).toContain("Bois &amp; Chiffons");
    expect(html).toContain("Fix the footer");
    expect(html).toContain("EUR net (12 orders)");
    expect(html).toContain("USD net (1 orders)");
    expect(html).toContain("No data yet");
    expect(html).not.toContain("Search");
  });

  it("says when there is nothing yet, and has its own title", () => {
    expect(renderToStaticMarkup(createElement(DigestView, { digests: [] }))).toContain("first digest arrives on Monday");
    expect(navFor("/digest").title).toBe("Weekly digest");
  });
});
