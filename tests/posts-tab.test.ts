import { describe, expect, it } from "vitest";
import { isStory } from "@/components/performance/posts-tab";
import type { PostInsightDto } from "@/shared";

const p = (channel: PostInsightDto["channel"]): PostInsightDto => ({ attemptId: "a", contentItemId: "c", title: null, channel, publishedAt: "2026-11-20T10:00:00Z", metrics: null, readAt: null, final: false });

describe("posts tab", () => {
  it("stories go to their own section", () => {
    expect(isStory(p("INSTAGRAM_STORY"))).toBe(true);
    expect(isStory(p("INSTAGRAM_POST"))).toBe(false);
  });
});
