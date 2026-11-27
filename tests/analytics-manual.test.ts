import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { XMark } from "@/components/icons/brand-marks";
import { channelById, type ManualChannel } from "@/lib/analytics-channels";
import { ManualPublishingState, plannedPosts } from "@/components/social/analytics/manual-publishing-state";
import type { ContentItem } from "@/components/workspace/content-panels";

const item = (id: string, channel: string, status: string, scheduledFor: string | null) => ({ id, channel, status, scheduledFor, title: id }) as unknown as ContentItem;
const NOW = new Date("2026-11-27T10:00:00Z");

describe("plannedPosts", () => {
  it("lists only the channel's posts still to go out, awaiting approval included, soonest first, undated last", () => {
    const items = [
      item("x-later", "X_POST", "SCHEDULED", "2026-12-05T09:00:00Z"),
      item("li", "LINKEDIN_POST", "SCHEDULED", "2026-11-28T09:00:00Z"),
      item("x-soon", "X_POST", "APPROVED", "2026-11-28T09:00:00Z"),
      item("x-wait", "X_POST", "AWAITING_APPROVAL", null),
      item("x-past", "X_POST", "SCHEDULED", "2026-11-20T09:00:00Z"),
      item("x-done", "X_POST", "PUBLISHED", "2026-11-29T09:00:00Z"),
    ];
    expect(plannedPosts(items, "X_POST", NOW).map((i) => i.id)).toEqual(["x-soon", "x-later", "x-wait"]);
    expect(plannedPosts(items, "LINKEDIN_POST", NOW).map((i) => i.id)).toEqual(["li"]);
  });
});

describe("ManualPublishingState", () => {
  it("explains why X sends no numbers and offers to plan X posts, never figures", () => {
    const html = renderToStaticMarkup(createElement(ManualPublishingState, { base: "/api/v1/workspaces/w/brands/b", channel: channelById("x") as ManualChannel, icon: XMark }));
    expect(html).toContain("X is published by hand");
    expect(html).toContain("Plan X posts");
    expect(html).toContain("cf_channel=X_POST");
    expect(html).toContain("Coming up on X");
    expect(html).toContain("cf_status=published");
    expect(html).not.toContain("Followers");
  });
});
