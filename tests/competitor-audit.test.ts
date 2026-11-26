import { describe, expect, it } from "vitest";
import { auditAllSummary, lastFailureNote, planAuditAll, readApproach, rowStatus } from "@/lib/competitor-audit";
import { dayDate } from "@/lib/time";

describe("lastFailureNote", () => {
  const blocked = "tikamoon.com blocks automated readers, so it can't be audited. Your credits were refunded.";
  const c = { domain: "tikamoon.com", auditError: blocked, auditBlocked: false, auditBlockedUntil: null, auditBlockedAt: null };

  it("says nothing without a failure", () => {
    expect(lastFailureNote({ ...c, auditError: null })).toBeNull();
  });

  it("while blocked: says the credits were refunded and when to try again", () => {
    const until = "2026-12-03T10:00:00.000Z";
    expect(lastFailureNote({ ...c, auditBlocked: true, auditBlockedUntil: until, auditBlockedAt: "2026-11-26T10:00:00.000Z" })).toEqual({
      text: `tikamoon.com blocks automated readers, so it can't be audited right now. Your credits were refunded. You can try again after ${dayDate(until)}.`,
      soft: true,
    });
    expect(lastFailureNote({ ...c, auditBlocked: true })?.text).toBe("tikamoon.com blocks automated readers, so it can't be audited right now. Your credits were refunded.");
  });

  it("after the block lifted: a soft note that invites another try, not the red error", () => {
    const at = "2026-11-18T10:00:00.000Z";
    expect(lastFailureNote({ ...c, auditBlockedAt: at })).toEqual({ text: `Last tried ${dayDate(at)}: the site blocked automated readers. You can try again.`, soft: true });
  });

  it("any other failure: the error in red", () => {
    expect(lastFailureNote({ ...c, auditError: "Could not read tikamoon.com" })).toEqual({ text: "Last audit failed: Could not read tikamoon.com", soft: false });
  });
});

describe("readApproach", () => {
  it("fills a partial audit's missing fields with empty values", () => {
    const empty = { positioning: "", audience: "", products: [], priceSignals: "", contentThemes: [], strengths: [], weaknesses: [] };
    expect(readApproach(null)).toEqual(empty);
    // A partial audit with no cited search keeps only its marker in the approach JSON.
    expect(readApproach({ partial: true } as never)).toEqual(empty);
  });

  it("keeps the fields search found", () => {
    expect(readApproach({ positioning: "Solid wood furniture.", products: ["Tables"] })).toMatchObject({ positioning: "Solid wood furniture.", products: ["Tables"], strengths: [] });
  });
});

const row = (id: string, over: Partial<Parameters<typeof rowStatus>[0]> = {}) => ({
  id,
  domain: `${id}.test`,
  auditError: null,
  auditBlocked: false,
  auditBlockedUntil: null,
  auditBlockedAt: null,
  aiMentions: null,
  auditRunning: false,
  audit: null,
  ...over,
});
const fresh = { stale: false, partial: false };
const stale = { stale: true, partial: false };

describe("rowStatus", () => {
  it("says auditing while a run is on, even over a block or an old audit", () => {
    expect(rowStatus(row("a", { auditRunning: true, auditBlocked: true, audit: stale }))).toEqual({ kind: "running", text: "auditing…" });
  });

  it("an active block replaces the scores and says when to try again", () => {
    const until = "2026-12-03T10:00:00.000Z";
    expect(rowStatus(row("a", { auditBlocked: true, auditBlockedUntil: until, auditError: "x", audit: fresh }))).toEqual({ kind: "blocked", text: `blocked · try after ${dayDate(until)}` });
  });

  it("shows scores, flagging a partial audit and keeping a later failure as a note", () => {
    expect(rowStatus(row("a", { audit: { stale: false, partial: true } }))).toEqual({ kind: "scores", partial: true, note: null });
    expect(rowStatus(row("a", { audit: stale, auditError: "Could not read" }))).toMatchObject({ kind: "scores", note: { text: "Last audit failed: Could not read", soft: false } });
  });

  it("without an audit: the failure in red if there was one, else not audited yet", () => {
    expect(rowStatus(row("a", { auditError: "Could not read" }))).toEqual({ kind: "failed", text: "Last audit failed: Could not read", soft: false });
    expect(rowStatus(row("a"))).toEqual({ kind: "none", text: "not audited yet" });
  });
});

describe("planAuditAll", () => {
  const list = [
    row("fresh", { audit: fresh, aiMentions: 9 }),
    row("blocked", { auditBlocked: true, aiMentions: 9 }),
    row("running", { auditRunning: true, aiMentions: 9 }),
    row("stale-2", { audit: stale, aiMentions: 2 }),
    row("new-0"),
    row("new-2", { aiMentions: 2 }),
    row("stale-5", { audit: stale, aiMentions: 5 }),
    row("stale-0", { audit: stale }),
  ];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("picks stale and never-audited sites, most named by AI first, never-audited before stale", () => {
    const plan = planAuditAll(list, { balance: 1000, auditCost: 10 });
    expect(ids(plan.candidates)).toEqual(["stale-5", "new-2", "stale-2", "new-0", "stale-0"]);
    expect(ids(plan.affordable)).toEqual(ids(plan.candidates));
    expect(plan.waiting).toEqual([]);
  });

  it("fits the balance: K = floor(balance / cost), the rest wait", () => {
    const plan = planAuditAll(list, { balance: 29, auditCost: 10 });
    expect(ids(plan.affordable)).toEqual(["stale-5", "new-2"]);
    expect(ids(plan.waiting)).toEqual(["stale-2", "new-0", "stale-0"]);
    expect(plan.cost).toBe(10);
  });

  it("doesn't cap a workspace with unlimited credits at its balance", () => {
    const plan = planAuditAll(list, { balance: 0, auditCost: 10, unlimited: true });
    expect(ids(plan.affordable)).toEqual(ids(plan.candidates));
    expect(plan.waiting).toEqual([]);
  });

  it("starts nothing without credits for one audit", () => {
    expect(planAuditAll(list, { balance: 9, auditCost: 10 }).affordable).toEqual([]);
    expect(planAuditAll(list, { balance: -5, auditCost: 10 }).affordable).toEqual([]);
  });
});

describe("auditAllSummary", () => {
  it("says what started and what waits", () => {
    const credits = Array.from({ length: 7 }, (_, i) => ({ id: String(i), reason: "credits" }));
    expect(auditAllSummary({ started: ["a"], skipped: credits })).toBe("Started 1 audit; 7 wait for credits.");
    expect(auditAllSummary({ started: ["a", "b"], skipped: [{ reason: "fresh" }] })).toBe("Started 2 audits; 1 was already running, fresh or unavailable.");
    expect(auditAllSummary({ started: ["a"], skipped: [{ reason: "failed" }, { reason: "failed" }, { reason: "running" }] })).toBe("Started 1 audit; 2 couldn't start; 1 was already running, fresh or unavailable.");
    expect(auditAllSummary({ started: [], skipped: [{ reason: "disabled" }, { reason: "disabled" }] })).toBe("Started 0 audits; 2 wait: site audits are turned off for this business.");
    expect(auditAllSummary({ started: [], skipped: [{ reason: "credits" }, { reason: "limit" }] })).toBe("Started 0 audits; 1 waits for credits; 1 waits for tomorrow (daily run limit).");
  });
});
