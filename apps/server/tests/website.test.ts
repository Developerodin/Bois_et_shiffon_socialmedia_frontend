import { describe, expect, it } from "vitest";
import { brandNameFromWebsite, normalizeWebsite, safeHttpUrl } from "@espanda/shared";

describe("website input", () => {
  it("adds https and trims what people paste", () => {
    expect(normalizeWebsite(" boisetchiffons.fr/ ")).toBe("https://boisetchiffons.fr");
    expect(normalizeWebsite("http://www.shop.test/fr#top")).toBe("http://www.shop.test/fr");
    expect(normalizeWebsite("HTTPS://Shop.Test")).toBe("https://shop.test");
  });

  it("only lets http(s) links through (untrusted sources)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "", "not a url", null]) expect(safeHttpUrl(bad), String(bad)).toBeNull();
    expect(safeHttpUrl("https://www.ikea.com/fr/")?.hostname).toBe("www.ikea.com");
  });

  it("rejects things that aren't a public website", () => {
    for (const bad of ["", "   ", "hello", "localhost", "ftp://shop.test", "https://user:pw@shop.test", "javascript:alert(1)"]) {
      expect(normalizeWebsite(bad), bad).toBeNull();
    }
  });

  it("guesses a brand name from the domain", () => {
    expect(brandNameFromWebsite("https://www.bois-et-chiffons.fr")).toBe("Bois et Chiffons");
    expect(brandNameFromWebsite("https://boisetchiffons.fr")).toBe("Boisetchiffons");
    expect(brandNameFromWebsite("https://maisons-du-monde.com")).toBe("Maisons du Monde");
  });

  it("keeps actionable text from raw provider errors", async () => {
    const { readable } = await import("@/lib/agent-message");
    expect(readable('Attempt failed: AiProviderError: OpenAI 429: { "error": { "type": "insufficient_quota" } }')).toMatch(/run out of credits/);
    expect(readable('Attempt failed: OpenAI 500: { "error": "boom" }')).toBe("Attempt failed: OpenAI 500…");
    expect(readable("Read 8 page(s)")).toBe("Read 8 page(s)");
  });
});
