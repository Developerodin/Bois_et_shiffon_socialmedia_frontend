import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TaskDetailDto } from "@/shared";
import { tasksApi } from "@/lib/tasks-api";
import { TaskAttachments, TaskFiles } from "@/components/tasks/task-attachments";

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

describe("task file upload", () => {
  const doc = new File([new Uint8Array([0x50, 0x4b, 3, 4])], "Budget 2027.xlsx", { type: "" });
  const dto = { id: "f1", fileName: "Budget 2027.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: 4, createdById: "me", createdAt: "2026-11-27T10:00:00.000Z", url: "https://s/f1" };

  it("announces the type its extension names (not the browser's), PUTs it, then has the server check and keep it", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ fileId: "f1", url: "https://store/put", headers: { "Content-Type": dto.contentType } }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ file: dto }, 201));
    await expect(tasksApi.uploadFile("/api/b", "t1", doc)).resolves.toEqual(dto);
    const [slot, put, verify] = fetchMock.mock.calls;
    expect(slot[0]).toBe("/api/b/tasks/t1/files");
    expect(JSON.parse(slot[1].body)).toEqual({ fileName: "Budget 2027.xlsx", contentType: dto.contentType, bytes: 4 });
    expect(put[1]).toMatchObject({ method: "PUT", body: doc, headers: { "Content-Type": dto.contentType } });
    expect(verify[0]).toBe("/api/b/tasks/t1/files/f1");
    expect(verify[1].method).toBe("POST");
  });

  it("refuses an unknown extension before asking the server, and passes on the server's refusal", async () => {
    await expect(tasksApi.uploadFile("/api/b", "t1", new File(["x"], "run.exe"))).rejects.toMatchObject({ message: expect.stringContaining("Attach a PDF") });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock
      .mockResolvedValueOnce(json({ fileId: "f1", url: "https://store/put", headers: {} }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ title: "Files with macros can't be attached.", detail: "Files with macros can't be attached." }, 400));
    await expect(tasksApi.uploadFile("/api/b", "t1", doc)).rejects.toThrow();
  });
});

describe("the files list", () => {
  const task = (over: Partial<TaskDetailDto>) =>
    ({ id: "t1", attachments: [], files: [{ id: "f1", fileName: "<b>Devis</b>.pdf", contentType: "application/pdf", bytes: 2_500_000, createdById: "me", createdAt: "", url: "https://s/f1?x=1&y=2" }], clientVisible: false, viewerIsClient: false, ...over }) as unknown as TaskDetailDto;

  it("shows the name as text with a download link, Remove and Upload only for editors", () => {
    const html = renderToStaticMarkup(createElement(TaskFiles, { base: "/api/b", task: task({}), canEdit: false }));
    expect(html).toContain("&lt;b&gt;Devis&lt;/b&gt;.pdf");
    expect(html).toMatch(/<a href="https:\/\/s\/f1\?x=1&amp;y=2" download="" rel="noopener noreferrer"/);
    expect(html).toContain("PDF · 2.4 MB");
    expect(html).not.toContain("Upload file");
    expect(html).not.toContain("Remove");
    const editor = renderToStaticMarkup(createElement(TaskFiles, { base: "/api/b", task: task({}), canEdit: true }));
    expect(editor).toContain("Upload file");
    expect(editor).toContain("Remove");
  });

  it("tells staff when a client reviewer can download them; nothing shows for a reader with no files", () => {
    expect(renderToStaticMarkup(createElement(TaskFiles, { base: "/api/b", task: task({ clientVisible: true }), canEdit: true }))).toContain("A client reviewer can see this task");
    expect(renderToStaticMarkup(createElement(TaskFiles, { base: "/api/b", task: task({ clientVisible: true, viewerIsClient: true }), canEdit: false }))).not.toContain("A client reviewer");
    expect(renderToStaticMarkup(createElement(TaskFiles, { base: "/api/b", task: task({ files: [] }), canEdit: false }))).toBe("");
  });
});

describe("task file check while the server is busy", () => {
  it("asks for the check again on task.fileBusy, keeping the same slot", async () => {
    vi.useFakeTimers();
    const doc = new File(["%PDF-"], "a.pdf");
    fetchMock
      .mockResolvedValueOnce(json({ fileId: "f1", url: "https://store/put", headers: {} }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ title: "Busy", detail: "Busy checking other files.", code: "task.fileBusy" }, 429))
      .mockResolvedValueOnce(json({ file: { id: "f1" } }, 201));
    const done = tasksApi.uploadFile("/api/b", "t1", doc);
    await vi.advanceTimersByTimeAsync(1600);
    await expect(done).resolves.toEqual({ id: "f1" });
    expect(fetchMock.mock.calls.slice(2).map((c) => c[0])).toEqual(["/api/b/tasks/t1/files/f1", "/api/b/tasks/t1/files/f1"]);
    vi.useRealTimers();
  });
});
