import { describe, expect, it } from "vitest";
import type { Connection } from "@/components/settings/api";
import { facebookPage, postCardDetails, postCardLine, sameSignedObject, type CardPost } from "@/lib/post-card";

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

describe("sameSignedObject", () => {
  it("matches two signatures of one stored file and nothing else", () => {
    expect(sameSignedObject("https://s3.example/b/k.jpg?X-Amz-Date=1&sig=a", "https://s3.example/b/k.jpg?X-Amz-Date=2&sig=b")).toBe(true);
    expect(sameSignedObject("https://s3.example/b/k.jpg?sig=a", "https://s3.example/b/other.jpg?sig=a")).toBe(false);
    expect(sameSignedObject("https://s3.example/b/k.jpg", "https://cdn.example/b/k.jpg")).toBe(false);
    expect(sameSignedObject("not a url", "not a url")).toBe(false);
  });
});

describe("facebookPage", () => {
  const conn = (id: string, displayName: string, over: Partial<Connection> = {}): Connection => ({ id, provider: "META", displayName, status: "ACTIVE", lastError: null, tokenExpiresAt: null, connectedAt: "2026-11-01T00:00:00Z", ...over });
  const fb = (publishConnectionId?: string | null) => ({ channel: "FACEBOOK_POST", publishConnectionId });
  it("names the Page of the scheduled or published attempt", () => {
    expect(facebookPage(fb("c2"), [conn("c1", "Oak"), conn("c2", "Oak Outlet")])).toBe("Oak Outlet");
    // Its account still names it once that connection stops working.
    expect(facebookPage(fb("c2"), [conn("c2", "Oak Outlet", { status: "ERROR" })])).toBe("Oak Outlet");
  });
  it("says nothing when the attempt's account is gone, never guessing another Page", () => {
    expect(facebookPage(fb("gone"), [conn("c1", "Oak")])).toBeNull();
  });
  it("falls back to the one working Facebook Pages connection", () => {
    expect(facebookPage(fb(), [conn("c1", "Oak"), conn("ig", "oak.ig", { provider: "INSTAGRAM" }), conn("old", "Old", { status: "REVOKED" })])).toBe("Oak");
    expect(facebookPage(fb(null), [conn("c1", "Oak")])).toBe("Oak");
  });
  it("says nothing with several Pages and none chosen, none, or connections unknown", () => {
    expect(facebookPage(fb(), [conn("c1", "Oak"), conn("c2", "Oak Outlet")])).toBeNull();
    expect(facebookPage(fb(), [])).toBeNull();
    expect(facebookPage(fb("c1"), null)).toBeNull();
  });
  it("is only for Facebook Posts", () => {
    expect(facebookPage({ channel: "INSTAGRAM_POST", publishConnectionId: "c1" }, [conn("c1", "Oak")])).toBeNull();
  });
  it("reaches the card line", () => {
    expect(postCardLine(postCardDetails({ ...fb(), latest: null }, [conn("c1", "Oak")]))).toBe("Page: Oak");
    expect(postCardLine(postCardDetails({ ...fb(), latest: null }))).toBe("");
  });
});
