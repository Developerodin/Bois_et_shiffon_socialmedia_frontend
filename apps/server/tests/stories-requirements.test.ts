import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  brandProfile: { findFirst: vi.fn() },
  contentItem: { findFirst: vi.fn() },
  integrationConnection: { findFirst: vi.fn() },
}));
const schedule = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/publishing", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/server/services/publishing")>()), schedulePublication: schedule }));

import { PublishingError, publishRequirements } from "@/server/services/publishing";
import { problemResponse } from "@/server/api/http-error";
import { autoPublish } from "@/server/services/automations";

beforeEach(() => vi.clearAllMocks());

describe("story publish requirements", () => {
  it("a story takes 3 to 5 frames and no images or video of its own", () => {
    expect(publishRequirements("INSTAGRAM_STORY")).toEqual({ provider: "INSTAGRAM", needsImage: false, minImages: 0, maxImages: 0, needsVideo: false, needsBoard: false, frames: [3, 5] });
  });
  it("other channels have no frames", () => {
    expect(publishRequirements("INSTAGRAM_POST")).not.toHaveProperty("frames");
  });
});

describe("PublishingError code", () => {
  it("carries a stable code into the problem response", async () => {
    const e = new PublishingError("x", 400, "story.frames");
    expect(e.code).toBe("story.frames");
    expect(new PublishingError("y").code).toBeUndefined();
    const res = problemResponse({ type: "t", title: e.message, status: e.status, code: e.code });
    expect(JSON.stringify(await res.json())).toContain('"code":"story.frames"');
  });
});

describe("autoPublish", () => {
  it("never schedules a story", async () => {
    db.brandProfile.findFirst.mockResolvedValue({ automations: { autoPublish: true } });
    db.contentItem.findFirst.mockResolvedValue({ channel: "INSTAGRAM_STORY", scheduledFor: new Date(Date.now() + 86_400_000), versions: [{ version: 1, body: {} }] });
    db.integrationConnection.findFirst.mockResolvedValue({ id: "c1" });
    await autoPublish({ workspaceId: "w1", brandId: "b1", userId: "u1" }, "i1");
    expect(schedule).not.toHaveBeenCalled();
  });
});
