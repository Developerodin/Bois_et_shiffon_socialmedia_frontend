import { beforeEach, describe, expect, it, vi } from "vitest";
import { platformLogs, type LogKind } from "@/server/services/platform-admin";

const m = vi.hoisted(() => ({ audit: vi.fn(), runs: vi.fn(), events: vi.fn(), calls: vi.fn(), none: vi.fn(), count: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    auditEvent: { findMany: m.audit, count: m.count },
    agentRun: { findMany: m.runs, count: m.count },
    agentEvent: { findMany: m.events, count: m.count },
    aiWorkflowRun: { findMany: m.calls, count: m.count },
    user: { findMany: m.none },
    brand: { findMany: m.none },
    workspace: { findMany: m.none },
  },
}));

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset().mockResolvedValue([]));
  m.count.mockResolvedValue(0);
});
const where = (source: keyof typeof m) => m[source].mock.calls[0][0].where;

describe("platformLogs filters every tab by person", () => {
  it.each<[LogKind, keyof typeof m, object]>([
    ["audit", "audit", { actorUserId: { in: ["u1"] } }],
    ["runs", "runs", { triggeredByUserId: { in: ["u1"] } }],
    ["events", "events", { run: { triggeredByUserId: { in: ["u1"] } } }],
    ["calls", "calls", { userId: { in: ["u1"] } }],
  ])("%s", async (kind, source, filter) => {
    await platformLogs({ kind, actorIds: ["u1"], workspaceId: "w1" });
    const w = where(source);
    expect(w.AND?.[0] ?? w).toEqual(expect.objectContaining({ workspaceId: "w1", ...filter }));
  });
});

describe("platformLogs keyset paging", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${String(99 - i).padStart(3, "0")}`, createdAt: new Date(1000 - i), workspaceId: null, brandId: null, actorUserId: null, action: "x" }));

  it("reads after the cursor, newest first, and counts every match", async () => {
    m.audit.mockResolvedValue(rows(51));
    m.count.mockResolvedValue(1234);
    const before = { at: new Date(2000), id: "a500" };
    const l = await platformLogs({ kind: "audit", days: 7, before });
    expect(where("audit").AND[1]).toEqual({ OR: [{ createdAt: { lt: before.at } }, { createdAt: before.at, id: { lt: "a500" } }] });
    expect(+where("audit").AND[0].createdAt.gte).toBeGreaterThan(Date.now() - 7.01 * 86_400_000);
    expect(m.audit.mock.calls[0][0].orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(l).toMatchObject({ total: 1234, hasMore: true, next: `${1000 - 49}~a050` });
    expect(l.rows).toHaveLength(50);
  });

  it("the Agent Log pages by its rising id", async () => {
    await platformLogs({ kind: "events", before: { at: new Date(0), id: "77" } });
    expect(where("events")).toMatchObject({ id: { lt: 77 } });
  });

  it("no next cursor on the last page", async () => {
    m.audit.mockResolvedValue(rows(3));
    expect((await platformLogs({ kind: "audit" })).next).toBeUndefined();
  });
});
