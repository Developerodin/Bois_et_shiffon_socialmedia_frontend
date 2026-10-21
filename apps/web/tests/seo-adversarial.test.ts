import { describe, expect, it } from "vitest";
import { isBrandedQuestion, mentionsBrand } from "@/server/agents/definitions/geo";
import { extractPage, robotsGroups, seoSignals } from "@/server/research/crawl";
import { aiCrawlerAccess } from "@/server/seo/checks";

// Counterexamples found in the adversarial review; each failed before its fix.
describe("seoSignals — attribute order and quoting", () => {
  it("reads robots/canonical/description regardless of attribute order", () => {
    const s = seoSignals(`<html lang=fr><head>
      <meta content="noindex, follow" name="robots">
      <link href="https://shop.test/a" rel="canonical">
      <meta content="width=device-width" name="viewport">
      <meta content="https://shop.test/og.jpg" property="og:image"></head><body></body></html>`);
    expect(s.robots).toBe("noindex, follow");
    expect(s.canonical).toBe("https://shop.test/a");
    expect(s.viewport).toBe(true);
    expect(s.ogImage).toBe(true);
    expect(s.lang).toBe("fr");
    expect(extractPage(`<meta content="Tables en chêne" name="description">`, new URL("https://shop.test/")).description).toBe("Tables en chêne");
  });

  it("treats unquoted alt as present and empty alt as decorative (not missing)", () => {
    const s = seoSignals(`<body><img src=a.jpg alt=Table><img src=b.jpg alt=""><img src=c.jpg></body>`);
    expect(s.imagesMissingAlt).toBe(1);
  });

  it("finds Product inside a JSON-LD @graph", () => {
    const s = seoSignals(`<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"Product","name":"Lit"}]}</script>`);
    expect(s.jsonLdTypes).toEqual(expect.arrayContaining(["Organization", "Product"]));
  });
});

describe("robots.txt edge cases", () => {
  it("handles CRLF, a BOM and mixed-case directives", () => {
    const g = robotsGroups("﻿User-Agent: GPTBot\r\nDISALLOW: /\r\n");
    expect(g.get("gptbot")).toEqual(["/"]);
    expect(aiCrawlerAccess("﻿User-Agent: GPTBot\r\nDISALLOW: /\r\n").find((a) => a.ua === "GPTBot")!.allowed).toBe(false);
  });
});

describe("GEO brand matching", () => {
  const ans = (answer: string, brandsMentioned: string[] = [], sources: string[] = []) => ({ answer, brandsMentioned, sources });

  it("matches spelling variants: & vs et, spacing, accents", () => {
    expect(mentionsBrand(ans("Essayez Bois et Chiffons"), "Bois & Chiffons", "boisetchiffons.fr")).toBe(true);
    expect(mentionsBrand(ans("", ["BoisetChiffons"]), "Bois & Chiffons", "boisetchiffons.fr")).toBe(true);
  });

  it("does not match a different brand that merely contains a short word", () => {
    expect(mentionsBrand(ans("", ["Maisons du Monde"]), "Monde", "monde.fr")).toBe(false);
    expect(mentionsBrand(ans("", ["Arhaus"]), "Ara", "ara.com")).toBe(false);
  });

  it("does not match the domain inside a longer domain", () => {
    expect(mentionsBrand(ans("", [], ["https://notboisetchiffons.fr/x"]), "Bois & Chiffons", "boisetchiffons.fr")).toBe(false);
    expect(mentionsBrand(ans("", [], ["https://www.boisetchiffons.fr/x"]), "Bois & Chiffons", "boisetchiffons.fr")).toBe(true);
  });

  it("detects questions that already name the brand (they can't measure visibility)", () => {
    expect(isBrandedQuestion("En quoi Bois & Chiffons se distingue-t-il ?", "Bois & Chiffons")).toBe(true);
    expect(isBrandedQuestion("Meilleure table en bois massif en France ?", "Bois & Chiffons")).toBe(false);
  });
});
