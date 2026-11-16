import { describe, expect, it } from "vitest";
import { nextSlot, takenKey } from "@/server/content/calendar";
import { checkDraft, overallOf, type DraftBody } from "@/server/content/rules";

const good: DraftBody = {
  hook: "3 erreurs qui abîment une table en chêne",
  caption: "3 erreurs qui abîment une table en chêne massif (et comment les éviter).\n\nL'eau chaude, le dessous-de-plat oublié, le mauvais chiffon.\n\nEnregistrez ce post pour votre prochain entretien.",
  hashtags: ["#boismassif", "#tablechene"],
  altText: "Table en chêne massif, plateau huilé, lumière du matin",
};

describe("content rules", () => {
  it("a clean Instagram post passes", () => {
    const r = checkDraft("INSTAGRAM_POST", good);
    expect(r).toEqual([]);
    expect(overallOf(r)).toBe("PASS");
  });

  it("blocks over-limit hashtags, empty captions, thin carousels and missing pin titles", () => {
    expect(overallOf(checkDraft("INSTAGRAM_POST", { ...good, hashtags: Array.from({ length: 8 }, (_, i) => `#t${i}`) }))).toBe("BLOCKER");
    expect(overallOf(checkDraft("FACEBOOK_POST", { ...good, caption: "" }))).toBe("BLOCKER");
    expect(overallOf(checkDraft("INSTAGRAM_CAROUSEL", { ...good, slides: ["a"] }))).toBe("BLOCKER");
    expect(checkDraft("PINTEREST_PIN", good).map((x) => x.check)).toContain("Pin title");
  });

  it("flags French AI filler and missing asks", () => {
    const r = checkDraft("INSTAGRAM_POST", { ...good, caption: "Dans un monde où tout va vite, laissez-vous séduire par une élégance intemporelle." });
    expect(r.find((x) => x.check === "Sounds AI-written")?.status).toBe("blocker");
    expect(r.find((x) => x.check === "Call to action")?.status).toBe("warn");
  });
});

describe("calendar slots", () => {
  it("uses the channel's weekdays and never double-books a channel-day", () => {
    const taken = new Set<string>();
    const monday = new Date("2026-10-26T12:00:00Z"); // a Monday
    const a = nextSlot("INSTAGRAM_REEL", monday, taken)!;
    const b = nextSlot("INSTAGRAM_REEL", monday, taken)!;
    expect(a.getUTCDay()).toBe(1);
    expect(b.getUTCDay()).toBe(4);
    expect(taken.has(takenKey("INSTAGRAM_REEL", a))).toBe(true);
    expect(nextSlot("INSTAGRAM_CAROUSEL", monday, new Set(), 1)).toBeNull(); // Wednesday is beyond a 1-day horizon
  });
});
