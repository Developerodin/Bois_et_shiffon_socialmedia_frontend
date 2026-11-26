import { describe, expect, it } from "vitest";
import { syncStatus } from "@/components/data/synced-at";
import { clockTime, timeAgo } from "@/lib/time";
import type { DataSyncResult } from "@/shared";

// Times are built with the same helpers and `now`, so the strings hold in any locale and time zone.
const now = Date.parse("2026-11-25T12:00:00Z");
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
const last = (extra: Partial<DataSyncResult> = {}): DataSyncResult => ({ at: iso(-60_000), startedAt: iso(-180_000), okAt: iso(-60_000), reason: null, count: 3, error: null, ...extra });

describe("syncStatus", () => {
  it("running: when it started, if known", () => {
    expect(syncStatus({ state: "running", since: iso(-30_000) }, last(), now)).toEqual({ kind: "running", text: `Syncing… started ${clockTime(iso(-30_000), now)}`, lastSync: null });
    expect(syncStatus({ state: "running", since: null }, null, now)).toEqual({ kind: "running", text: "Syncing…", lastSync: null });
  });

  it("queued: 'in a moment' up to 30 s out (or with no time), the time beyond", () => {
    expect(syncStatus({ state: "queued", since: iso(30_000) }, null, now).text).toBe("Sync queued, starts in a moment");
    expect(syncStatus({ state: "queued", since: null }, null, now).text).toBe("Sync queued, starts in a moment");
    expect(syncStatus({ state: "queued", since: iso(31_000) }, null, now)).toEqual({ kind: "queued", text: `Sync queued, starts ${clockTime(iso(31_000), now)}`, lastSync: null });
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
