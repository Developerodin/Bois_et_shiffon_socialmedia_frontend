import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "@/components/settings/api";
import { ProblemError, createBrand } from "@/components/context/api";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const stream = (...chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
        c.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  );
const sent = () => new Headers(fetchMock.mock.calls[0][1].headers);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({}));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request errors", () => {
  it("keeps the whole problem body on the error", async () => {
    fetchMock.mockResolvedValue(json({ title: "t", detail: "d", code: "render.alreadyDone", extra: 1 }, 409));
    const err = await request("/x").catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: "d", code: "render.alreadyDone" });
    expect((err.data as Record<string, unknown>).extra).toBe(1);
  });

  it("is the same class as ProblemError", () => {
    expect(new ApiError(400, "x")).toBeInstanceOf(ProblemError);
  });
});

describe("request headers", () => {
  it("sets JSON content-type for a string body", async () => {
    await request("/x", { method: "POST", body: "{}" });
    expect(sent().get("content-type")).toBe("application/json");
  });

  it("leaves content-type to the browser for FormData", async () => {
    await request("/x", { method: "POST", body: new FormData(), headers: {} });
    expect(sent().get("content-type")).toBeNull();
  });

  it("keeps caller headers next to the JSON default", async () => {
    await request("/x", { method: "POST", body: "{}", headers: { "x-a": "1" } });
    expect(sent().get("content-type")).toBe("application/json");
    expect(sent().get("x-a")).toBe("1");
  });
});

describe("request streams", () => {
  it("passes progress lines to onLine and resolves the result", async () => {
    fetchMock.mockResolvedValue(stream('{"type":"stage","stage":"reading"}\n{"type":"do', 'ne","result":{"x":1}}\n'));
    const onLine = vi.fn();
    await expect(request("/x", { onLine })).resolves.toEqual({ x: 1 });
    expect(onLine).toHaveBeenCalledTimes(1);
    expect(onLine).toHaveBeenCalledWith({ type: "stage", stage: "reading" });
    expect(sent().get("accept")).toBe("application/x-ndjson");
  });

  it("rejects with the error line as data", async () => {
    fetchMock.mockResolvedValue(stream('{"type":"error","status":402,"detail":"Needs a plan","planRequired":true}\n'));
    const err = await request("/x", { onLine: vi.fn() }).catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(402);
    expect((err.data as Record<string, unknown>).planRequired).toBe(true);
  });

  it("rejects with status 0 when the stream stops early", async () => {
    fetchMock.mockResolvedValue(stream('{"type":"stage"}\n'));
    const err = await request("/x", { onLine: vi.fn() }).catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
  });
});

describe("createBrand", () => {
  it("allows the slow timeout", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    await createBrand("w", { displayName: "A", websiteUrl: "https://a.co" });
    expect(spy).toHaveBeenLastCalledWith(120_000);
  });
});
