import { describe, expect, it } from "vitest";
import { socialLinks } from "@/server/research/crawl";
import { domainOf } from "@espanda/shared";

describe("competitor helpers", () => {
  it("normalises domains and rejects non-sites", () => {
    expect(domainOf("https://www.Tikamoon.com/fr/tables")).toBe("tikamoon.com");
    expect(domainOf("maisonsdumonde.com")).toBe("maisonsdumonde.com");
    for (const bad of ["javascript:alert(1)", "localhost", "", null, "10.0.0.5", "http://169.254.169.254/latest", "[::1]", "nas.local", "metadata.internal"]) expect(domainOf(bad), String(bad)).toBeNull();
  });

  it("finds one profile per platform and skips share links", () => {
    const s = socialLinks([
      "https://www.instagram.com/tikamoon/",
      "https://www.instagram.com/other",
      "https://www.facebook.com/sharer/sharer.php?u=x",
      "https://www.facebook.com/tikamoon",
      "https://fr.pinterest.com/tikamoon/",
      "javascript:alert(1)",
      "/relative",
    ]);
    expect(s).toEqual([
      { platform: "instagram", url: "https://www.instagram.com/tikamoon" },
      { platform: "facebook", url: "https://www.facebook.com/tikamoon" },
      { platform: "pinterest", url: "https://fr.pinterest.com/tikamoon" },
    ]);
  });
});
