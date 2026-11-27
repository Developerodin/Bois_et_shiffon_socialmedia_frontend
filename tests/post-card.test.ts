import { describe, expect, it } from "vitest";
import { postCardDetails, postCardLine, type CardPost } from "@/lib/post-card";

const post = (channel: string, latest: CardPost["latest"], firstFrameUrl?: string | null): CardPost => ({ channel, latest, firstFrameUrl });

describe("postCardDetails", () => {
  it("names Instagram's formats and no other channel's", () => {
    expect(postCardDetails(post("INSTAGRAM_REEL", null)).format).toBe("Reel");
    expect(postCardDetails(post("INSTAGRAM_STORY", null)).format).toBe("Story");
    expect(postCardDetails(post("FACEBOOK_POST", null)).format).toBeNull();
  });
  it("takes a story's first frame and any other post's cover", () => {
    expect(postCardDetails(post("INSTAGRAM_STORY", { body: {}, photoUrls: ["cover"] }, "frame")).thumb).toBe("frame");
    expect(postCardDetails(post("INSTAGRAM_STORY", { body: {}, photoUrls: ["cover"] }, null)).thumb).toBeNull();
    expect(postCardDetails(post("INSTAGRAM_REEL", { body: {}, photoUrls: ["scene"] })).thumb).toBe("scene");
    expect(postCardDetails(post("LINKEDIN_POST", { body: {} })).thumb).toBeNull();
    expect(postCardDetails(post("X_POST", null)).thumb).toBeNull();
  });
  it("counts a carousel's pictures only", () => {
    expect(postCardDetails(post("INSTAGRAM_CAROUSEL", { body: {}, photoUrls: ["a", "b", "c"] })).pictures).toBe(3);
    expect(postCardDetails(post("INSTAGRAM_CAROUSEL", { body: {}, photoUrls: [] })).pictures).toBeNull();
    expect(postCardDetails(post("INSTAGRAM_POST", { body: {}, photoUrls: ["a"] })).pictures).toBeNull();
  });
  it("gives a pin's destination host, never a link that isn't http(s)", () => {
    expect(postCardDetails(post("PINTEREST_PIN", { body: { pinLink: "https://shop.example/p/1?x=2" } })).pinHost).toBe("shop.example");
    expect(postCardDetails(post("PINTEREST_PIN", { body: { pinLink: "javascript:alert(1)" } })).pinHost).toBeNull();
    expect(postCardDetails(post("PINTEREST_PIN", { body: {} })).pinHost).toBeNull();
    expect(postCardDetails(post("FACEBOOK_POST", { body: { pinLink: "https://shop.example" } })).pinHost).toBeNull();
  });
});

describe("postCardLine", () => {
  it("joins what is known and is empty for nothing", () => {
    expect(postCardLine({ format: "Carousel", pictures: 4, pinHost: null })).toBe("Carousel · 4 pictures");
    expect(postCardLine({ format: null, pictures: 1, pinHost: null })).toBe("1 picture");
    expect(postCardLine({ format: null, pictures: null, pinHost: "shop.example" })).toBe("Leads to shop.example");
    expect(postCardLine({ format: null, pictures: null, pinHost: null })).toBe("");
  });
});
