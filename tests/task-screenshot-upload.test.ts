import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TaskDetailDto } from "@/shared";
import { tasksApi } from "@/lib/tasks-api";
import { TaskAttachments } from "@/components/tasks/task-attachments";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "shot.jpg", { type: "image/jpeg" });
const attachment = { id: "a1", mediaUploadId: "u1", role: "BEFORE", createdById: "me", createdAt: "2026-11-23T10:00:00.000Z", url: "https://s/a1" };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("task screenshot upload", () => {
  it("asks for a slot, PUTs the photo there, checks it, then attaches it", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ uploadId: "u1", url: "https://store/put", headers: { "Content-Type": "image/jpeg" } }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ status: "VERIFIED", previewUrl: "https://s/p" }))
      .mockResolvedValueOnce(json({ attachment }, 201));
    await expect(tasksApi.uploadScreenshot("/api/b", "t1", file, "BEFORE", true)).resolves.toEqual(attachment);
    const [slot, put, verify, attach] = fetchMock.mock.calls;
    expect(slot[0]).toBe("/api/b/stories/uploads");
    expect(JSON.parse(slot[1].body)).toEqual({ kind: "photo", contentType: "image/jpeg", bytes: 3, rightsConfirmed: true });
    expect(put[0]).toBe("https://store/put");
    expect(put[1]).toMatchObject({ method: "PUT", body: file, headers: { "Content-Type": "image/jpeg" } });
    expect(verify[0]).toBe("/api/b/stories/uploads/u1");
    expect(verify[1].method).toBe("POST");
    expect(attach[0]).toBe("/api/b/tasks/t1/attachments");
    expect(JSON.parse(attach[1].body)).toEqual({ mediaUploadId: "u1", role: "BEFORE" });
  });
  it("stops with the server's reason when the photo is refused", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ uploadId: "u1", url: "https://store/put", headers: {} }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ status: "REJECTED", reason: "That photo is too small.", code: "story.small" }));
    await expect(tasksApi.uploadScreenshot("/api/b", "t1", file, "AFTER", true)).rejects.toMatchObject({ message: "That photo is too small." });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("sends the person's own answer about the photo's rights", async () => {
    fetchMock.mockResolvedValueOnce(json({ title: "Refused", detail: "Confirm you may use this photo." }, 400));
    await expect(tasksApi.uploadScreenshot("/api/b", "t1", file, "AFTER", false)).rejects.toThrow();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).rightsConfirmed).toBe(false);
  });
  it("says so when the file can't reach storage", async () => {
    fetchMock.mockResolvedValueOnce(json({ uploadId: "u1", url: "https://store/put", headers: {} }, 201)).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(tasksApi.uploadScreenshot("/api/b", "t1", file, "AFTER", true)).rejects.toMatchObject({ message: "Couldn't upload the photo. Try again." });
  });
});

describe("the screenshot slots", () => {
  it("ask for the photo's rights and hold the upload until they're ticked", () => {
    const task = { id: "t1", attachments: [] } as unknown as TaskDetailDto;
    const html = renderToStaticMarkup(createElement(TaskAttachments, { base: "/api/b", task, roles: ["BEFORE", "AFTER"], canEdit: true, slots: true }));
    expect(html).toContain("I have the right to use this photo");
    expect(html).toContain("to upload.");
    expect(html.match(/type="file"[^>]*disabled=""/g)).toHaveLength(2);
  });
});
