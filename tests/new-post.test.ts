import { describe, expect, it } from "vitest";
import { COMPOSE_CHOICES, composeChoices, isWrittenChannel, postedByHand } from "@/lib/new-post";
import { draftPhotos } from "@/components/workspace/content-panels";
import { CHANNEL_PROVIDER } from "@/lib/social-channels";
import { CHANNEL_IMAGES, NEW_POST_CHANNELS, writtenPostProblem } from "@/shared";

const channels = (filter?: string) => composeChoices(filter).map((c) => c.channel);
const kind = (channel: string) => COMPOSE_CHOICES.find((c) => c.channel === channel)?.kind;

describe("composeChoices: what New post offers on a channel's calendar", () => {
  it("one channel: only that one, so the dialog starts on it", () => {
    for (const c of ["FACEBOOK_POST", "PINTEREST_PIN", "THREADS_POST", "LINKEDIN_POST", "X_POST", "INSTAGRAM_CAROUSEL"]) expect(channels(c)).toEqual([c]);
  });
  it("Meta: Facebook and the Instagram formats; Instagram: its four formats", () => {
    expect(channels("meta").sort()).toEqual(["FACEBOOK_POST", "INSTAGRAM_CAROUSEL", "INSTAGRAM_POST", "INSTAGRAM_REEL", "INSTAGRAM_STORY"]);
    expect(channels("instagram")).toEqual(["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL", "INSTAGRAM_REEL", "INSTAGRAM_STORY"]);
    expect(channels("meta")[0]).toBe("INSTAGRAM_POST");
  });
  it("no filter, or one it doesn't know, offers everything, starting on an Instagram post as before", () => {
    expect(channels()).toHaveLength(9);
    expect(channels("NOPE")).toEqual(channels());
    expect(channels()[0]).toBe("INSTAGRAM_POST");
  });
  it("Reels and stories hand off; nothing else is offered that the server can't make", () => {
    expect(kind("INSTAGRAM_REEL")).toBe("reel");
    expect(kind("INSTAGRAM_STORY")).toBe("story");
    const makes = COMPOSE_CHOICES.filter((c) => c.kind === "ai" || c.kind === "written").map((c) => c.channel);
    expect(makes.sort()).toEqual([...NEW_POST_CHANNELS].sort());
    expect(COMPOSE_CHOICES.filter((c) => c.kind === "written").every((c) => isWrittenChannel(c.channel))).toBe(true);
  });
  it("LinkedIn and X are published by hand; the rest publish through a connection", () => {
    expect(COMPOSE_CHOICES.filter((c) => postedByHand(c.channel)).map((c) => c.channel).sort()).toEqual(["LINKEDIN_POST", "X_POST"]);
    for (const c of COMPOSE_CHOICES) expect(c.channel in CHANNEL_PROVIDER).toBe(true);
  });
});

describe("the dialog's checks are the server's (shared/content-limits.ts)", () => {
  it("X stops at 280; a pin needs its image; one image at most elsewhere", () => {
    expect(writtenPostProblem("X_POST", { text: "a".repeat(281), photos: 0 })).toMatch(/280/);
    expect(writtenPostProblem("PINTEREST_PIN", { text: "d", pinTitle: "t", photos: 0 })).toMatch(/image/);
    expect(CHANNEL_IMAGES.FACEBOOK_POST).toEqual([0, 1]);
  });
});

describe("draftPhotos: publishing starts with the draft's own pictures", () => {
  const latest = (photoKeys: string[] | undefined, photoUrls: string[] | undefined) => ({ latest: { version: 1, body: { hook: "", caption: "c", hashtags: [], slides: [], script: [], pinTitle: "", altText: "", photoKeys }, photoUrls, byPerson: true, check: null, review: null } });
  it("pairs each key with its signed link", () => {
    expect(draftPhotos(latest(["w/b/a.jpg"], ["https://s/a"]))).toEqual([{ key: "w/b/a.jpg", previewUrl: "https://s/a" }]);
  });
  it("none when the pairs don't line up, or there are none", () => {
    expect(draftPhotos(latest(["w/b/a.jpg", "x/y/b.jpg"], ["https://s/a"]))).toEqual([]);
    expect(draftPhotos(latest(undefined, ["https://s/scene"]))).toEqual([]);
    expect(draftPhotos({ latest: null })).toEqual([]);
  });
});
