import { describe, expect, it } from "vitest";
import { syncedKeys, syncStatus } from "@/components/data/synced-at";
import { pollEvery } from "@/components/performance/performance-tabs";
import { historyNote } from "@/components/performance/sales-tab";
import { clockTime, timeAgo } from "@/lib/time";
import type { DataSourceDto, DataSyncResult } from "@/shared";

// Times are built with the same helpers and `now`, so the strings hold in any locale and time zone.
const now = Date.parse("2026-11-25T12:00:00Z");
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
const last = (extra: Partial<DataSyncResult> = {}): DataSyncResult => ({ at: iso(-60_000), startedAt: iso(-180_000), okAt: iso(-60_000), reason: null, count: 3, error: null, ...extra });

describe("syncStatus", () => {
  it("running: when it started, if known", () => {
    expect(syncStatus({ state: "running", since: iso(-30_000), backfill: false }, last(), now)).toEqual({ kind: "running", text: `Syncing… started ${clockTime(iso(-30_000), now)}`, lastSync: null });
    expect(syncStatus({ state: "running", since: null, backfill: false }, null, now)).toEqual({ kind: "running", text: "Syncing…", lastSync: null });
  });

  it("queued: 'in a moment' up to 30 s out (or with no time), the time beyond", () => {
    expect(syncStatus({ state: "queued", since: iso(30_000), backfill: false }, null, now).text).toBe("Sync queued, starts in a moment");
    expect(syncStatus({ state: "queued", since: null, backfill: false }, null, now).text).toBe("Sync queued, starts in a moment");
    expect(syncStatus({ state: "queued", since: iso(31_000), backfill: false }, null, now)).toEqual({ kind: "queued", text: `Sync queued, starts ${clockTime(iso(31_000), now)}`, lastSync: null });
  });

  it("idle: the last success, and the last run's start and end (only the end on runs from before starts were kept)", () => {
    expect(syncStatus(null, last(), now)).toEqual({
      kind: "idle", text: `Updated ${timeAgo(iso(-60_000), now)}`, lastSync: `last sync ${clockTime(iso(-180_000), now)} – ${clockTime(iso(-60_000), now)}`,
    });
    expect(syncStatus(null, last({ startedAt: null }), now).lastSync).toBe(`last sync ended ${clockTime(iso(-60_000), now)}`);
  });

  it("idle with no success yet: 'Not synced yet', with the failed run if there was one", () => {
    expect(syncStatus(null, null, now)).toEqual({ kind: "idle", text: "Not synced yet", lastSync: null });
    expect(syncStatus(null, last({ okAt: null, reason: "failed" }), now).text).toBe("Not synced yet");
  });
});

describe("history (backfill) runs", () => {
  const src = (at: string, sync: DataSourceDto["sync"]): DataSourceDto => ({
    id: "s1", kind: "SHOPIFY_ORDERS", status: "ACTIVE", lastResult: last({ at }), sync, syncedThrough: null, reportsInZone: null,
  });
  const run = (backfill: boolean): DataSourceDto["sync"] => ({ state: "queued", since: null, backfill });

  it("backfill-only runs poll at 60 s; any other run brings 5 s back; none, no poll", () => {
    expect(pollEvery([src("a", run(true))])).toBe(60_000);
    expect(pollEvery([src("a", run(true)), src("b", run(false))])).toBe(5_000);
    expect(pollEvery([src("a", null)])).toBeNull();
  });

  it("numbers reload once when the chain ends, not after each window", () => {
    let keys = syncedKeys([src("t0", null)], []);
    expect(keys).toEqual(["t0"]);
    const seen = [keys.join("|")];
    for (const at of ["t1", "t2", "t3"]) {
      keys = syncedKeys([src(at, run(true))], keys);
      seen.push(keys.join("|"));
    }
    keys = syncedKeys([src("t4", null)], keys);
    seen.push(keys.join("|"));
    // Changes only once: at the end of the chain.
    expect(seen).toEqual(["t0", "t0", "t0", "t0", "t4"]);
  });
});

describe("Sales tab history note", () => {
  const src = (history: DataSourceDto["history"]): DataSourceDto => ({
    id: "s1", kind: "SHOPIFY_ORDERS", status: "ACTIVE", lastResult: null, sync: null, syncedThrough: null, reportsInZone: null, history,
  });
  it("mid-chain, not approved yet, and done", () => {
    expect(historyNote(src({ allOrders: true, visibleSince: null, through: "2025-05-01", loading: true }))).toMatch(/^Loading older orders: through /);
    expect(historyNote(src({ allOrders: true, visibleSince: null, through: null, loading: true }))).toBe("Loading older orders");
    expect(historyNote(src({ allOrders: false, visibleSince: "2026-09-25T00:00:00Z", through: null, loading: false }))).toMatch(/^Orders from .+ on \(Shopify hasn't approved older orders yet\)$/);
    expect(historyNote(src({ allOrders: true, visibleSince: null, through: null, loading: false }))).toBeNull();
    expect(historyNote(src(null))).toBeNull();
  });
});
