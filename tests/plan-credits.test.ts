import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPlanCredits, planCredits } from "@/lib/plan-credits";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sub = (id: string | null) => ({ plan: id ? { id, credits: 100, renewsAt: "2026-12-01" } : null, unlimited: false, plans: [] });
/** Answers /credits and /subscription for whichever workspace the URL names. */
const answer = (credits: Record<string, number>) =>
  fetchMock.mockImplementation(async (url: string) => {
    const w = /workspaces\/([^/]+)\//.exec(url)![1];
    return url.endsWith("/credits") ? json({ credits: credits[w] }) : json(sub(`plan-${w}`));
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("plan and credits store", () => {
  it("reads credits and subscription once for concurrent loads", async () => {
    answer({ a1: 7 });
    await Promise.all([loadPlanCredits("a1"), loadPlanCredits("a1")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(planCredits("a1")).toMatchObject({ credits: 7, failed: false });
    expect(planCredits("a1").subscription?.plan?.id).toBe("plan-a1");
  });

  it("skips a load within 30 s unless forced", async () => {
    answer({ b1: 1 });
    await loadPlanCredits("b1");
    fetchMock.mockClear();
    await loadPlanCredits("b1");
    expect(fetchMock).not.toHaveBeenCalled();
    await loadPlanCredits("b1", true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockClear();
    vi.advanceTimersByTime(30_001);
    await loadPlanCredits("b1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the old values and flags a failure, without rejecting", async () => {
    answer({ c1: 9 });
    await loadPlanCredits("c1");
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError("down"));
    await expect(loadPlanCredits("c1", true)).resolves.toBeUndefined();
    expect(planCredits("c1")).toMatchObject({ credits: 9, failed: true });
    expect(planCredits("c1").subscription?.plan?.id).toBe("plan-c1");
  });

  it("keeps each workspace's answer when loads overlap", async () => {
    answer({ d1: 11, d2: 22 });
    await Promise.all([loadPlanCredits("d1"), loadPlanCredits("d2")]);
    expect(planCredits("d1").credits).toBe(11);
    expect(planCredits("d2").credits).toBe(22);
  });

  it("gives the same shared empty value to unknown workspaces", () => {
    expect(planCredits("unknown")).toBe(planCredits("unknown2"));
    expect(Object.isFrozen(planCredits("unknown"))).toBe(true);
    expect(planCredits("unknown")).toMatchObject({ credits: null, subscription: null, failed: false });
  });
});
