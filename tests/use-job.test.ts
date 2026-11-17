import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_INTERVALS, fetchShared, nextDelay, putShared, sharedAt, sharedResponse, subscribeShared } from "@/components/workspace/use-job";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("nextDelay", () => {
  it("takes the step the elapsed time falls in", () => {
    expect(nextDelay(JOB_INTERVALS.storyRender, 0, 0, false)).toBe(3_000);
    expect(nextDelay(JOB_INTERVALS.storyRender, 61_000, 0, false)).toBe(10_000);
    expect(nextDelay(JOB_INTERVALS.reelRender, 0, 0, false)).toBe(5_000);
    expect(nextDelay(JOB_INTERVALS.reelRender, 130_000, 0, false)).toBe(10_000);
    expect(nextDelay(JOB_INTERVALS.reelRender, 700_000, 0, false)).toBe(30_000);
  });

  it("doubles per error up to a minute", () => {
    expect(nextDelay(JOB_INTERVALS.storyRender, 0, 1, false)).toBe(6_000);
    expect(nextDelay(JOB_INTERVALS.storyRender, 0, 10, false)).toBe(60_000);
  });

  it("waits a minute when rate limited", () => {
    expect(nextDelay(JOB_INTERVALS.storyRender, 0, 0, true)).toBe(60_000);
  });
});

describe("fetchShared", () => {
  it("sends one request for concurrent callers and shares the answer", async () => {
    fetchMock.mockImplementation(async () => json({ n: 1 }));
    const heard = vi.fn();
    const off = subscribeShared("/a", heard);
    const [x, y] = await Promise.all([fetchShared("/a"), fetchShared("/a")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(x).toEqual({ n: 1 });
    expect(y).toBe(x);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(sharedResponse("/a")).toBe(x);
    await fetchShared("/a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    off();
  });

  it("rejects every waiter and stores nothing when the request fails", async () => {
    fetchMock.mockImplementation(async () => json({ detail: "no" }, 500));
    const results = await Promise.allSettled([fetchShared("/b"), fetchShared("/b")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(sharedResponse("/b")).toBeUndefined();
  });

  it("sends a fresh request after the one in flight, never alongside it", async () => {
    let first!: (r: Response) => void;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((r) => (first = r)))
      .mockImplementationOnce(async () => json({ n: 2 }));
    const polled = fetchShared("/c");
    const fresh = fetchShared("/c", true);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first(json({ n: 1 }));
    await expect(polled).resolves.toEqual({ n: 1 });
    await expect(fresh).resolves.toEqual({ n: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sharedResponse("/c")).toEqual({ n: 2 });
  });
});

describe("putShared", () => {
  it("stores the answer, tells that URL's subscribers and stamps the time", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeShared("/put-a", a);
    const offB = subscribeShared("/put-b", b);
    const before = Date.now();
    putShared("/put-a", 1);
    expect(sharedResponse("/put-a")).toBe(1);
    expect(a).toHaveBeenCalledWith(1);
    expect(b).not.toHaveBeenCalled();
    expect(sharedAt("/put-a")).toBeGreaterThanOrEqual(before);
    offA();
    offB();
  });

  it("reports 0 for a URL never answered", () => {
    expect(sharedAt("/never")).toBe(0);
  });
});
