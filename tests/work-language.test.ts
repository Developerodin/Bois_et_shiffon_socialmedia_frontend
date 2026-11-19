import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/components/settings/api", () => ({ request: api.request }));

import { ensureWorkLanguage, isRunCancelled, onLanguageQuestion, rememberLanguages } from "@/components/languages/languages";

beforeEach(() => api.request.mockReset());

describe("ensureWorkLanguage", () => {
  it("doesn't ask the server again once this tab knows the team language", async () => {
    rememberLanguages("/b/known", { workLanguage: "en", contentLanguage: "fr" });
    await ensureWorkLanguage("/b/known");
    expect(api.request).not.toHaveBeenCalled();
  });

  it("lets the run go ahead when the languages can't be read, or are already set", async () => {
    const stop = onLanguageQuestion(() => {});
    api.request.mockRejectedValueOnce(new Error("offline"));
    await expect(ensureWorkLanguage("/b/offline")).resolves.toBeUndefined();
    api.request.mockResolvedValueOnce({ workLanguage: "fr", contentLanguage: "fr" });
    await expect(ensureWorkLanguage("/b/set")).resolves.toBeUndefined();
    expect(api.request).toHaveBeenLastCalledWith("/b/set/languages");
    stop();
  });

  it("lets runs through unasked on a page with no dialog (the welcome flow)", async () => {
    api.request.mockResolvedValue({ workLanguage: null, contentLanguage: null });
    await expect(ensureWorkLanguage("/b/welcome")).resolves.toBeUndefined();
    expect(api.request).not.toHaveBeenCalled();
  });

  it("waits on the question when none is set; a second run for the same brand shares it, another brand's is cancelled", async () => {
    const stop = onLanguageQuestion(() => {});
    api.request.mockResolvedValue({ workLanguage: null, contentLanguage: "fr" });
    let settled = false;
    const first = ensureWorkLanguage("/b/unset");
    void first.then(() => (settled = true), () => (settled = true));
    expect(ensureWorkLanguage("/b/unset")).toBe(first);
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
    expect(api.request).toHaveBeenCalledTimes(1);
    const other = await ensureWorkLanguage("/b/other").catch((e: unknown) => e);
    expect(isRunCancelled(other)).toBe(true);
    stop();
  });
});
