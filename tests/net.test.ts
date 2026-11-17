import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError, requestId, send } from "@/lib/net";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("send", () => {
  it("tags every request with the client and its version, keeping the caller's headers", async () => {
    await send("/x");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-client")).toBe("web/dev");
    await send("/x", { headers: { a: "1" } });
    const h = new Headers(fetchMock.mock.calls[1][1].headers);
    expect(h.get("a")).toBe("1");
    expect(h.get("x-client")).toBe("web/dev");
  });

  it("times out after 30 s unless the call asks for longer, and keeps timeoutMs away from fetch", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    await send("/x");
    expect(spy).toHaveBeenLastCalledWith(30_000);
    await send("/x", { timeoutMs: 120_000 });
    expect(spy).toHaveBeenLastCalledWith(120_000);
    expect("timeoutMs" in fetchMock.mock.calls[1][1]).toBe(false);
  });

  it("fails with a timeout error when no answer comes in time", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new TypeError("aborted")))),
    );
    const err = await send("/x", { timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.failure).toBe("timeout");
  });
});

describe("requestId", () => {
  it("is a fresh uuid each time", () => {
    expect(requestId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId()).not.toBe(requestId());
  });
});
