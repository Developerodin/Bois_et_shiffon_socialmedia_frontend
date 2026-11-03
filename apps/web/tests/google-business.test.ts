import { describe, expect, it } from "vitest";
import { originalReviewText } from "@/server/google/business";

describe("originalReviewText", () => {
  it("keeps a plain review as is", () => expect(originalReviewText("Great table, fast delivery.")).toBe("Great table, fast delivery."));
  it("takes the original when Google's translation comes first", () =>
    expect(originalReviewText("(Translated by Google) Very nice shop\n\n(Original)\nTrès belle boutique")).toBe("Très belle boutique"));
  it("drops a translation appended after the original", () =>
    expect(originalReviewText("Très belle boutique\n\n(Translated by Google)\nVery nice shop")).toBe("Très belle boutique"));
});
