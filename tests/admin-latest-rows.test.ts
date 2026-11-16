import { beforeEach, describe, expect, it, vi } from "vitest";

const sf = vi.hoisted(() => ({ serverFetch: vi.fn() }));
vi.mock("@/lib/server-fetch", () => ({
  serverFetch: sf.serverFetch,
  api: (s: TemplateStringsArray, ...v: string[]) => s.reduce((a, p, i) => a + p + (i < v.length ? encodeURIComponent(v[i]) : ""), ""),
}));

import AdminOverview from "@/app/(shell)/admin/page";
import AdminWorkspaceOverview from "@/app/(shell)/admin/workspaces/[workspaceId]/page";

/** The log URLs a page asked the Server for (the page stops at its first await; only the requests matter). */
async function logRequests(render: () => Promise<unknown>) {
  await render().catch(() => {});
  return sf.serverFetch.mock.calls.map(([path]) => path as string).filter((p) => p.startsWith("/api/v1/admin/logs"));
}

beforeEach(() => {
  vi.clearAllMocks();
  sf.serverFetch.mockRejectedValue(new Error("not needed"));
});

// The Logs page defaults to the last 30 days; these "latest" sections list the newest rows from all time, as before.
describe("the admin overviews' latest activity and agent runs", () => {
  it("ask the platform overview's log for all time", async () => {
    expect(await logRequests(() => AdminOverview())).toEqual(["/api/v1/admin/logs?days=all"]);
  });

  it("ask the workspace overview's audit and runs logs for all time", async () => {
    const paths = await logRequests(() => AdminWorkspaceOverview({ params: Promise.resolve({ workspaceId: "w1" }) }));
    expect(paths).toEqual(["/api/v1/admin/logs?workspaceId=w1&days=all", "/api/v1/admin/logs?workspaceId=w1&log=runs&days=all"]);
  });
});
