import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { batchBody, noteSession, type ProposalRow } from "@/components/tasks/note-to-tasks-dialog";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string) as { requestId: string; tasks: { title: string }[] };

const row = (title: string, keep = true, over: Partial<ProposalRow> = {}): ProposalRow => ({ key: title, keep, title, description: "", areas: ["CONTENT"], ownerId: "", dueOn: "", priority: "NORMAL", ...over });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tasks from a note", () => {
  it("unticked proposals not sent", () => {
    const body = batchBody("r1", [row("Shoot the lookbook"), row("Call the printer", false), row("Fix the menu", true, { description: "  Top nav  ", ownerId: "u1", dueOn: "2026-11-30" })]);
    expect(body.requestId).toBe("r1");
    expect(body.tasks.map((t) => t.title)).toEqual(["Shoot the lookbook", "Fix the menu"]);
    // Blank optional fields are left out; filled ones go as typed (trimmed).
    expect(body.tasks[0]).toEqual({ title: "Shoot the lookbook", areas: ["CONTENT"], priority: "NORMAL" });
    expect(body.tasks[1]).toEqual({ title: "Fix the menu", description: "Top nav", areas: ["CONTENT"], priority: "NORMAL", ownerId: "u1", dueOn: "2026-11-30" });
  });

  it("same requestId reused on retry", async () => {
    fetchMock.mockResolvedValueOnce(json({ title: "Failed", detail: "Something broke" }, 500)).mockResolvedValueOnce(json({ tasks: [] }, 201));
    const session = noteSession();
    await expect(session.create("/api/b", [row("One")])).rejects.toThrow();
    await session.create("/api/b", [row("One")]);
    expect(bodyOf(0).requestId).toBe(bodyOf(1).requestId);
    expect(bodyOf(0).requestId).toMatch(/^[0-9a-f-]{36}$/);
    // A new opening of the dialog is a new request.
    expect(noteSession().requestId).not.toBe(session.requestId);
  });
});

describe("a proposal from the model", () => {
  it("keeps only real areas and a known priority", async () => {
    const { rowOf } = await import("@/components/tasks/note-to-tasks-dialog");
    const r = rowOf({ title: "Fix menu", areas: ["WEBSITE", "MARKETING", "SEO"], priority: "CRITICAL" }, 0);
    expect(r.areas).toEqual(["WEBSITE", "SEO"]);
    expect(r.priority).toBe("NORMAL");
    expect(rowOf({ title: "x", areas: ["CONTENT"], priority: "HIGH" }, 1).priority).toBe("HIGH");
  });
});
