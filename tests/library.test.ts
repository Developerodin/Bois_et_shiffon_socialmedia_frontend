import { describe, expect, it } from "vitest";
import { MEDIA_MAX_BYTES } from "@/shared";
import { brandLookUrl, colorHint, initialSource, paletteAfter, photoCount, pickUploads, withFallback } from "@/components/library/api";

const file = (name: string, type: string, size = 1) => ({ name, type, size }) as File;
const photo = (key: string) => ({ key, url: `https://x/${key}`, title: "t", kind: null });

describe("pickUploads", () => {
  it("rejects a wrong type", () => {
    expect(pickUploads([file("a.heic", "image/heic")])).toEqual({ files: [], errors: ["a.heic isn't a JPG or PNG."] });
  });
  it("rejects an oversize file", () => {
    expect(pickUploads([file("b.png", "image/png", MEDIA_MAX_BYTES + 1)]).errors).toEqual(["b.png is over 4 MB. Images can be up to 4 MB."]);
  });
  it("keeps the first ten and says so", () => {
    const r = pickUploads(Array.from({ length: 12 }, (_, i) => file(`${i}.jpg`, "image/jpeg")));
    expect(r.files).toHaveLength(10);
    expect(r.errors).toEqual(["Up to 10 photos at a time; the first 10 are being added."]);
  });
  it("takes good files without errors", () => {
    const r = pickUploads([file("a.jpg", "image/jpeg"), file("b.png", "image/png"), file("c.jpg", "image/jpeg")]);
    expect(r.files).toHaveLength(3);
    expect(r.errors).toEqual([]);
  });
});

describe("initialSource", () => {
  const web = [photo("w")];
  const up = [photo("u")];
  it("opens on uploads when the selection is an upload", () => {
    expect(initialSource({ website: web, uploads: up }, "u")).toBe("uploads");
  });
  it("opens on uploads when there are no website photos", () => {
    expect(initialSource({ website: [], uploads: up })).toBe("uploads");
  });
  it("opens on website when the selection is a website photo", () => {
    expect(initialSource({ website: web, uploads: up }, "w")).toBe("website");
  });
  it("opens on website when there is nothing", () => {
    expect(initialSource({ website: [], uploads: [] })).toBe("website");
  });
});

describe("withFallback", () => {
  const list = [photo("a")];
  it("puts a photo the list lacks first", () => expect(withFallback(list, photo("n"))).toEqual([photo("n"), photo("a")]));
  it("leaves the list alone when it has the photo or there is none", () => {
    expect(withFallback(list, photo("a"))).toBe(list);
    expect(withFallback(list, null)).toBe(list);
  });
});

describe("paletteAfter", () => {
  it("appends, replaces and removes", () => {
    expect(paletteAfter(["#111111"], "new", "#222222")).toEqual(["#111111", "#222222"]);
    expect(paletteAfter(["#111111", "#222222"], 0, "#333333")).toEqual(["#333333", "#222222"]);
    expect(paletteAfter(["#111111", "#222222"], 0, null)).toEqual(["#222222"]);
  });
});

describe("colorHint", () => {
  const colors = ["#111111", "#222222"];
  it("flags an invalid code", () => expect(colorHint("#", colors, 0)).toBe("Use a hex code like #7C6754"));
  it("flags a duplicate at another index", () => expect(colorHint("222222", colors, 0)).toBe("That colour is already in the palette"));
  it("accepts its own slot", () => expect(colorHint("#111111", colors, 0)).toBeNull());
});

describe("photoCount", () => {
  it("pluralises", () => {
    expect(photoCount(1)).toBe("1 photo");
    expect(photoCount(0)).toBe("0 photos");
  });
});

it("builds the encoded look URL", () => {
  expect(brandLookUrl("w 1", "b")).toBe("/api/v1/workspaces/w%201/brands/b/assets");
});
