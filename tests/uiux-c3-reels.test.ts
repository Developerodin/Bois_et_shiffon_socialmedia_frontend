import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { downloadIfApproved, reelActions } from "@/components/reels/reel-actions";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("reelActions", () => {
  it("offers Approve, not Download, while awaiting approval", () => {
    expect(reelActions("AWAITING_APPROVAL", true)).toEqual({ approve: true, download: false, downloadWhy: "Approve it first to download." });
  });
  it("offers Download once approved, scheduled or published", () => {
    for (const s of ["APPROVED", "SCHEDULED", "PUBLISHED"]) expect(reelActions(s, true)).toEqual({ approve: false, download: true, downloadWhy: null });
  });
  it("shows neither to a role that can't approve", () => {
    expect(reelActions("AWAITING_APPROVAL", false)).toEqual({ approve: false, download: false, downloadWhy: "Someone who can approve reels approves it first." });
    expect(reelActions("PUBLISHED", false)).toMatchObject({ approve: false, download: false });
  });
  it("offers neither before there is anything to approve", () => {
    expect(reelActions("DRAFT_REVIEW", true)).toEqual({ approve: false, download: false, downloadWhy: null });
  });
});

describe("downloadIfApproved", () => {
  it("never sends while awaiting approval", async () => {
    const send = vi.fn(async () => "link");
    expect(await downloadIfApproved(async () => "AWAITING_APPROVAL", send)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it("sends once the fresh read shows an approved reel", async () => {
    const send = vi.fn(async () => "link");
    expect(await downloadIfApproved(async () => "APPROVED", send)).toBe("link");
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("reels copy", () => {
  it("no longer says downloading approves", () => {
    expect(read("components/reels/review-step.tsx")).not.toContain("Downloading approves");
  });
  it("keeps the reel card photo decorative, as its title sits beside it", () => {
    expect(read("components/reels/reel-card.tsx")).toContain('alt=""');
  });
});
