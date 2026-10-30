import { beforeEach, describe, expect, it, vi } from "vitest";
import { logRun } from "@/server/ai/provider";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { aiWorkflowRun: { create } } }));
vi.mock("@/server/ai/model-config", () => ({ modelConfig: async () => ({}) }));

const ctx = { workspaceId: "w", brandId: "b", workflowId: "chat.turn", promptVersion: "1" };

describe("AI call rows record who caused them", () => {
  beforeEach(() => create.mockReset());

  it("writes the user on the row", async () => {
    await logRun({ ...ctx, userId: "u1" }, "openai", "light", "m", "SUCCEEDED", Date.now());
    expect(create.mock.calls[0][0].data.userId).toBe("u1");
  });

  it("leaves it empty for system calls", async () => {
    await logRun(ctx, "openai", "light", "m", "SUCCEEDED", Date.now());
    expect(create.mock.calls[0][0].data.userId).toBeUndefined();
  });
});
