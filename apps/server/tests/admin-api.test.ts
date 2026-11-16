import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  admin: vi.fn(),
  listPeople: vi.fn(),
  listWorkspaces: vi.fn(),
  workspaceDetail: vi.fn(),
  personDetail: vi.fn(),
  platformLogs: vi.fn(),
  spendBreakdown: vi.fn(),
  recordWorkspaceView: vi.fn(),
  recordPersonView: vi.fn(),
  workspaceFind: vi.fn(),
  userFind: vi.fn(),
}));
vi.mock("@/server/auth/platform-admin", () => ({ platformAdmin: m.admin }));
vi.mock("@/server/db/prisma", () => ({ prisma: { workspace: { findUnique: m.workspaceFind }, user: { findUnique: m.userFind } } }));
vi.mock("@/server/usage/fx", () => ({ usdInrRate: async () => ({ rate: 84.5, from: "test" }) }));
vi.mock("@/server/services/platform-admin", async () => ({
  ...(await vi.importActual<object>("@/server/services/platform-admin")),
  listPeople: m.listPeople,
  listWorkspaces: m.listWorkspaces,
  workspaceDetail: m.workspaceDetail,
  personDetail: m.personDetail,
  platformLogs: m.platformLogs,
  spendBreakdown: m.spendBreakdown,
  recordWorkspaceView: m.recordWorkspaceView,
  recordPersonView: m.recordPersonView,
}));

import { GET as getPeople } from "@/app/api/v1/admin/people/route";
import { GET as getSpend } from "@/app/api/v1/admin/spend/route";
import { GET as getWorkspaces } from "@/app/api/v1/admin/workspaces/route";
import { GET as getWorkspace } from "@/app/api/v1/admin/workspaces/[workspaceId]/route";
import { POST as visitWorkspace } from "@/app/api/v1/admin/workspaces/[workspaceId]/visit/route";
import { POST as visitPerson } from "@/app/api/v1/admin/people/[userId]/visit/route";

const req = (path: string, init?: RequestInit) => new Request(`http://x/api/v1/admin/${path}`, init);
const ws = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });
const denied = () => new Response(null, { status: 403 });

beforeEach(() => {
  vi.clearAllMocks();
  m.admin.mockResolvedValue("admin1");
  m.listPeople.mockResolvedValue({ total: 120, hasMore: true, rows: [] });
  m.listWorkspaces.mockResolvedValue({ total: 3, customers30: 1.5, hasMore: false, rows: [] });
  m.spendBreakdown.mockResolvedValue({ aiUsd: 1, apiUsd: 0, calls: 2, apiCalls: 0, input: 0, cached: 0, output: 0, days: [], byWorkspace: [], byBrand: [], byModel: [], byTier: [], byTask: [], byApi: [] });
  m.workspaceDetail.mockResolvedValue({ workspace: { id: "w1", createdAt: new Date("2026-01-01T00:00:00Z") }, members: [], brands: [], roles: [], invitations: [] });
  m.workspaceFind.mockResolvedValue({ id: "w1" });
  m.userFind.mockResolvedValue({ id: "u1" });
});

describe("platform admin API", () => {
  it.each([
    ["people", () => getPeople(req("people"))],
    ["spend", () => getSpend(req("spend"))],
    ["workspaces/[id]", () => getWorkspace(req("workspaces/w1"), ws("w1"))],
    ["workspaces/[id]/visit", () => visitWorkspace(req("workspaces/w1/visit", { method: "POST" }), ws("w1"))],
  ])("answers 404 to a signed-in non-admin on %s, and runs nothing", async (_name, call) => {
    m.admin.mockResolvedValue(denied());
    expect((await call()).status).toBe(404);
    expect(m.listPeople).not.toHaveBeenCalled();
    expect(m.spendBreakdown).not.toHaveBeenCalled();
    expect(m.workspaceDetail).not.toHaveBeenCalled();
    expect(m.recordWorkspaceView).not.toHaveBeenCalled();
  });

  it("keeps the 401 for no session", async () => {
    m.admin.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await getPeople(req("people"))).status).toBe(401);
  });

  it("lists people with the page, the page count and the next page", async () => {
    const res = await getPeople(req("people?q=ann&page=2"));
    expect(res.status).toBe(200);
    expect(m.listPeople).toHaveBeenCalledWith({ q: "ann", page: 2 });
    expect(await res.json()).toMatchObject({ page: 2, pages: 3, next: "3", total: 120, rows: [] });
  });

  it("reports no next page on the last one", async () => {
    const body = await (await getWorkspaces(req("workspaces?sort=spend"))).json();
    expect(m.listWorkspaces).toHaveBeenCalledWith({ q: undefined, sort: "spend", page: 1 });
    expect(body).toMatchObject({ page: 1, pages: 1, next: null, usdInr: 84.5, customers30: 1.5 });
  });

  it("falls back to the default sort for an unknown one", async () => {
    await getWorkspaces(req("workspaces?sort=%27%3B--"));
    expect(m.listWorkspaces).toHaveBeenCalledWith(expect.objectContaining({ sort: "newest" }));
  });

  it("answers spend with the exchange rate, for one workspace when asked", async () => {
    const body = await (await getSpend(req("spend?days=7&workspaceId=w1&tests=1"))).json();
    expect(m.spendBreakdown).toHaveBeenCalledWith({ days: 7, workspaceId: "w1", includeTests: false });
    expect(body).toMatchObject({ aiUsd: 1, usdInr: 84.5 });
  });

  it("sends dates as ISO strings", async () => {
    const body = await (await getWorkspace(req("workspaces/w1"), ws("w1"))).json();
    expect(body.workspace.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reading a workspace does not record a view", async () => {
    expect((await getWorkspace(req("workspaces/w1"), ws("w1"))).status).toBe(200);
    expect(m.recordWorkspaceView).not.toHaveBeenCalled();
  });

  it("is 404 for a workspace that does not exist", async () => {
    m.workspaceDetail.mockResolvedValue(null);
    expect((await getWorkspace(req("workspaces/nope"), ws("nope"))).status).toBe(404);
  });

  it("records a workspace view once, as the admin, on POST visit", async () => {
    const res = await visitWorkspace(req("workspaces/w1/visit", { method: "POST" }), ws("w1"));
    expect(res.status).toBe(200);
    expect(m.recordWorkspaceView).toHaveBeenCalledTimes(1);
    expect(m.recordWorkspaceView).toHaveBeenCalledWith("w1", "admin1");
  });

  it("records nothing for a workspace that does not exist", async () => {
    m.workspaceFind.mockResolvedValue(null);
    expect((await visitWorkspace(req("workspaces/nope/visit", { method: "POST" }), ws("nope"))).status).toBe(404);
    expect(m.recordWorkspaceView).not.toHaveBeenCalled();
  });

  it("records a person view once, as the admin", async () => {
    const res = await visitPerson(req("people/u1/visit", { method: "POST" }), { params: Promise.resolve({ userId: "u1" }) });
    expect(res.status).toBe(200);
    expect(m.recordPersonView).toHaveBeenCalledTimes(1);
    expect(m.recordPersonView).toHaveBeenCalledWith("u1", "admin1");
  });
});
