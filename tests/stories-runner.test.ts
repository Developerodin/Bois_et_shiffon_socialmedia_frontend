import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ claim: vi.fn(), complete: vi.fn(), updateMany: vi.fn(), run: vi.fn(), onFailure: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { job: { updateMany: m.updateMany } } }));
vi.mock("@/server/jobs/queue", async (orig) => ({ ...(await orig<object>()), claimNextJob: m.claim, completeJob: m.complete, holdLease: () => () => {} }));
vi.mock("@/server/stories/service", async (orig) => ({ ...(await orig<object>()), runStoryRender: m.run, onStoryRenderFailure: m.onFailure }));

import { runDueJobs } from "@/server/jobs/runner";
import { PublishingError } from "@/server/services/publishing";
import { STORY_RENDER_JOB } from "@/server/stories/service";

const job = { id: "j1", type: STORY_RENDER_JOB, payload: { itemId: "i1" }, attempts: 1, maxAttempts: 2, leasedBy: "w" };

beforeEach(() => {
  vi.clearAllMocks();
  m.claim.mockResolvedValueOnce(job).mockResolvedValue(null);
  m.updateMany.mockResolvedValue({ count: 1 });
  m.onFailure.mockResolvedValue(undefined);
});

describe("the runner and story renders", () => {
  it("doesn't retry a refused story render: dead on the first attempt, failure hook told it's final", async () => {
    const refusal = new PublishingError("Someone else changed this story. Your changes weren't saved.", 409, "story.stale");
    m.run.mockRejectedValue(refusal);
    await runDueJobs({ budgetMs: 5_000 });
    expect(m.updateMany.mock.calls[0][0].data.status).toBe("DEAD_LETTER");
    expect(m.onFailure).toHaveBeenCalledWith(job.payload, refusal, true);
  });

  it("retries any other render failure once", async () => {
    const crash = new Error("ffmpeg exited 1");
    m.run.mockRejectedValue(crash);
    await runDueJobs({ budgetMs: 5_000 });
    expect(m.updateMany.mock.calls[0][0].data.status).toBe("PENDING");
    expect(m.onFailure).toHaveBeenCalledWith(job.payload, crash, false);
  });

  it("a runner that lost its lease runs no failure hook (another runner holds the job)", async () => {
    m.run.mockRejectedValue(new Error("cut off"));
    m.updateMany.mockResolvedValue({ count: 0 }); // the fail write matched nothing: not this runner's lease any more
    await runDueJobs({ budgetMs: 5_000 });
    expect(m.onFailure).not.toHaveBeenCalled();
  });
});
