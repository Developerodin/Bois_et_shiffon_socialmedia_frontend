import { describe, expect, it } from "vitest";
import { mediaKey } from "@/server/storage/media";

describe("mediaKey tenant prefix", () => {
  const scope = { workspaceId: "ws1", brandId: "brandA" };

  it("prefixes workspace and brand", () => {
    expect(mediaKey(scope, "hero.jpg")).toBe("ws1/brandA/hero.jpg");
  });

  it("rejects traversal and nested paths", () => {
    expect(() => mediaKey(scope, "../brandB/hero.jpg")).toThrow();
    expect(() => mediaKey(scope, "a/b.jpg")).toThrow();
    expect(() => mediaKey(scope, "a..jpg")).toThrow();
    expect(() =>
      mediaKey({ workspaceId: "ws1", brandId: "x/../y" }, "a.jpg"),
    ).toThrow();
  });
});
