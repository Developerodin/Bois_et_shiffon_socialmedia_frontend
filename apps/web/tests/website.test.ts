import { describe, expect, it } from "vitest";
import { brandNameFromWebsite, normalizeWebsite } from "@/lib/website";

describe("website input", () => {
  it("adds https and trims what people paste", () => {
    expect(normalizeWebsite(" boisetchiffons.fr/ ")).toBe("https://boisetchiffons.fr");
    expect(normalizeWebsite("http://www.shop.test/fr#top")).toBe("http://www.shop.test/fr");
    expect(normalizeWebsite("HTTPS://Shop.Test")).toBe("https://shop.test");
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
