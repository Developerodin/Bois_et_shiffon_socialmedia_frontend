import { describe, expect, it } from "vitest";
import { channelFamily, chatChannel, chatRequestBody, contextLabel, suggestionsFor } from "@/lib/assistant-context";
import { CHANNEL_LABEL } from "@/lib/post-labels";
import { SOCIAL_ROWS } from "@/lib/social-channels";
import { CHAT_CHANNELS, isChatChannel } from "@/shared";

const titles = (page: string | null, channel: string | null) => suggestionsFor(page, channel).map((s) => s.title);
const q = (s: string) => new URLSearchParams(s);

describe("suggestionsFor", () => {
  it("gives each channel calendar its own starters", () => {
    expect(titles("calendar", "instagram")).toEqual(["Plan my next week's content", "Suggest Reel ideas for our collection", "Review Instagram posts awaiting approval"]);
    expect(titles("calendar", "PINTEREST_PIN")).toEqual(["Suggest Pin ideas for our products", "Organize content by board"]);
    expect(titles("calendar", "LINKEDIN_POST")).toEqual(["Create a professional brand update", "Review pending company posts"]);
    expect(titles("calendar", "X_POST")).toEqual(["Suggest short-form content", "Review scheduled posts"]);
    expect(titles("calendar", "THREADS_POST")).toEqual(["Generate conversation starters", "Review upcoming posts"]);
    expect(titles("calendar", "FACEBOOK_POST")).toContain("Review Facebook posts awaiting approval");
    expect(titles("calendar", "meta")).toContain("Review posts awaiting approval");
  });

  it("names the channel in every ask, so the answer is about it", () => {
    for (const s of suggestionsFor("calendar", "meta")) expect(s.ask).toMatch(/Facebook|Instagram/);
    for (const [c, word] of [["instagram", "Instagram"], ["PINTEREST_PIN", "Pinterest"], ["LINKEDIN_POST", "LinkedIn"], ["X_POST", "X"], ["THREADS_POST", "Threads"], ["FACEBOOK_POST", "Facebook"]])
      for (const s of suggestionsFor("calendar", c)) expect(s.ask).toContain(word);
  });

  it("treats each Instagram format as Instagram", () => {
    for (const c of ["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL", "INSTAGRAM_REEL", "INSTAGRAM_STORY"]) expect(titles("calendar", c)).toEqual(titles("calendar", "instagram"));
  });

  it("keeps today's starters with no channel or an unknown one", () => {
    expect(suggestionsFor("calendar", null)).toBe(suggestionsFor(null, null));
    expect(titles("calendar", "MYSPACE")).toEqual(titles(null, null));
    expect(titles("calendar", "__proto__")).toEqual(titles(null, null));
    expect(titles("products", null)).toContain("Explore my catalogue");
    expect(titles("__proto__", null)).toEqual(titles(null, null));
    expect(channelFamily(undefined)).toBeNull();
  });
});

describe("chatChannel and contextLabel", () => {
  it("reads a known channel only on the calendar", () => {
    expect(chatChannel("calendar", q("cf_channel=instagram"))).toBe("instagram");
    expect(chatChannel("calendar", q("cf_channel=PINTEREST_PIN&cf_status=awaiting"))).toBe("PINTEREST_PIN");
    expect(chatChannel("calendar", q("cf_channel=evil"))).toBeNull();
    expect(chatChannel("calendar", q(""))).toBeNull();
    expect(chatChannel("products", q("cf_channel=instagram"))).toBeNull();
  });

  it("names the channel calendar on the chip, else the page", () => {
    expect(contextLabel("calendar", "instagram")).toBe("Instagram calendar");
    expect(contextLabel("calendar", "meta")).toBe("Meta calendar");
    expect(contextLabel("calendar", "LINKEDIN_POST")).toBe("LinkedIn calendar");
    expect(contextLabel("calendar", null)).toBe("Content calendar");
    expect(contextLabel("products", null)).toBe("Products");
    expect(contextLabel("social", null)).toBeNull();
    expect(contextLabel(null, null)).toBeNull();
  });
});

describe("chatRequestBody", () => {
  it("sends the newest message with its page and channel", () => {
    expect(chatRequestBody("t1", ["a", "b"], "calendar", "meta")).toEqual({ id: "t1", message: "b", page: "calendar", channel: "meta" });
  });
  it("leaves out a missing page or channel, so the request is as before", () => {
    const body = chatRequestBody("t1", ["a"], "products", null);
    expect(body).toEqual({ id: "t1", message: "a", page: "products", channel: undefined });
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty("channel");
  });
});

// The server only notes channels it knows: every value the calendar's channel filter takes must be one of them.
describe("CHAT_CHANNELS", () => {
  it("covers every channel calendar the app opens", () => {
    for (const v of [...SOCIAL_ROWS.map((r) => r.filter), ...Object.keys(CHANNEL_LABEL)]) {
      expect(isChatChannel(v)).toBe(true);
      expect(chatChannel("calendar", q(`cf_channel=${v}`))).toBe(v);
    }
    for (const k of Object.keys(CHAT_CHANNELS)) expect(channelFamily(k)).not.toBeNull();
  });
});
