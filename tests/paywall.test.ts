import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "@/components/settings/api";
import { closePaywall, currentPaywall, onPaywallChange, refusalOf } from "@/lib/paywall";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const failure = (p: Promise<unknown>) => p.then(() => { throw new Error("expected a rejection"); }, (e: ApiError) => e);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  closePaywall();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refusalOf", () => {
  it("reads the credits shape", () => {
    expect(refusalOf({ insufficientCredits: true, balance: 3, needed: 10, title: "x" })).toEqual({
      insufficientCredits: true,
      balance: 3,
      needed: 10,
    });
  });
  it("reads the plan shape, preferring the title, then the detail", () => {
    expect(refusalOf({ planRequired: true, detail: "Needs a plan" })).toEqual({ planRequired: true, title: "Needs a plan" });
    expect(refusalOf({ planRequired: true, title: "T", detail: "D" })).toEqual({ planRequired: true, title: "T" });
    expect(refusalOf({ planRequired: true })).toEqual({ planRequired: true, title: "This needs a plan" });
  });
  it("is null for anything else", () => {
    expect(refusalOf({ title: "Payment Required" })).toBeNull();
    expect(refusalOf(undefined)).toBeNull();
    expect(refusalOf("<html>")).toBeNull();
  });
});

describe("the paywall through request", () => {
  it("opens on a 402 credits body and still rejects", async () => {
    fetchMock.mockResolvedValue(json({ title: "Payment Required", insufficientCredits: true, balance: 2, needed: 5 }, 402));
    const err = await failure(request("/x"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(402);
    expect(currentPaywall()).toEqual({ insufficientCredits: true, balance: 2, needed: 5 });
  });

  it("stays shut on a 402 that is not ours (HTML or unknown JSON)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>402</html>", { status: 402, headers: { "content-type": "text/html" } }));
    expect((await failure(request("/x"))).status).toBe(402);
    fetchMock.mockResolvedValueOnce(json({ title: "Payment Required" }, 402));
    expect((await failure(request("/x"))).status).toBe(402);
    expect(currentPaywall()).toBeNull();
  });

  it("stays shut on other statuses that carry the flags", async () => {
    fetchMock.mockResolvedValue(json({ planRequired: true, title: "T" }, 403));
    await failure(request("/x"));
    expect(currentPaywall()).toBeNull();
  });

  it("opens on a streamed 402 error line, with its detail as the title", async () => {
    const line = JSON.stringify({ type: "error", status: 402, detail: "Needs a plan", planRequired: true }) + "\n";
    fetchMock.mockResolvedValue(
      new Response(new Blob([line]).stream(), { headers: { "content-type": "application/x-ndjson" } }),
    );
    const err = await failure(request("/x", { onLine: () => {} }));
    expect(err.status).toBe(402);
    expect(currentPaywall()).toEqual({ planRequired: true, title: "Needs a plan" });
  });
});

describe("the paywall store", () => {
  it("closes, and tells listeners on open and close", async () => {
    const listener = vi.fn();
    const off = onPaywallChange(listener);
    fetchMock.mockResolvedValue(json({ planRequired: true, title: "T" }, 402));
    await failure(request("/x"));
    expect(listener).toHaveBeenCalledTimes(1);
    closePaywall();
    expect(currentPaywall()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    closePaywall();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
