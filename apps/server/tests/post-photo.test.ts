import { describe, expect, it } from "vitest";
import { ownMediaKey } from "@/server/services/publishing";

const scope = { workspaceId: "ws1", brandId: "b1" };

describe("ownMediaKey", () => {
  it("accepts the brand's uploads and Research's product photos", () => {
    expect(ownMediaKey(scope, "ws1/b1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg")).toBe(true);
    expect(ownMediaKey(scope, "ws1/b1/product-3-ab12cd.jpg")).toBe(true);
    expect(ownMediaKey(scope, "ws1/b1/logo.png")).toBe(true);
  });

  it("refuses another brand's file, folders and other types", () => {
    expect(ownMediaKey(scope, "ws1/b2/product-3.jpg")).toBe(false);
    expect(ownMediaKey(scope, "ws1/b1/x/product.jpg")).toBe(false);
    expect(ownMediaKey(scope, "ws1/b1/../b2/product.jpg")).toBe(false);
    expect(ownMediaKey(scope, "ws1/b1/reel.mp4")).toBe(false);
  });
});
