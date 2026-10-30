import { ActivityPickers } from "@/components/admin/activity-pickers";
import { LogTable } from "@/components/admin/log-table";
import { CursorPager, period as periodOf, PERIODS, Segmented, withQuery } from "@/components/admin/ui";
import { LOG_FILTERS, PAGE, parseCursor, peopleMatching, pickerOptions, platformLogs, type LogKind } from "@/server/services/platform-admin";
import { usdInrRate } from "@/server/usage/fx";

const KINDS: { value: LogKind; label: string; about: string }[] = [
  { value: "audit", label: "Audit", about: "Who did what: sign-ins, member and role changes, approvals, publishing, admin visits." },
  { value: "runs", label: "Agent runs", about: "Every agent run, who or what started it, and how it ended." },
  { value: "events", label: "Agent log", about: "The lines agents write as they work (the Agent Log people see in the app)." },
  { value: "calls", label: "AI calls", about: "Every AI call: task, tier and model, cost, speed, and whether the answer passed every check." },
];

/**
 * One log at a time, filterable and paged, for the platform (no workspaceId) or one workspace, over a period
 * (`?days=`). On the platform page, `?ws=` and `?who=` (part of a name or email) narrow every log to a workspace and
 * the people matching.
 */
export async function LogsView({ path, query, workspaceId }: { path: string; query: { log?: string; status?: string; tests?: string; days?: string; before?: string; ws?: string; who?: string }; workspaceId?: string }) {
  const kind = (KINDS.some((k) => k.value === query.log) ? query.log : "audit") as LogKind;
  const status = LOG_FILTERS[kind].some((f) => f.value === query.status) ? query.status : undefined;
  const tests = !workspaceId && kind === "calls" && query.tests === "1";
  const { value: days, days: n, param, span } = periodOf(query.days);
  const before = parseCursor(query.before);
  const ws = workspaceId ? undefined : query.ws || undefined;
  const who = workspaceId ? undefined : query.who?.trim() || undefined;
  const [l, fx, options] = await Promise.all([
    peopleMatching(who).then((actorIds) => platformLogs({ kind, workspaceId: workspaceId ?? ws, actorIds, status, includeTests: tests, days: n, before })),
    usdInrRate(),
    workspaceId ? null : pickerOptions(),
  ]);
  const current = { log: kind === "audit" ? undefined : kind, ws, who, days: param, status, tests: tests ? "1" : undefined };

  return (
    <>
      <div className="flex flex-col gap-3">
        <Segmented label="Log" options={KINDS} value={kind} href={(v) => withQuery(path, { ws, who, days: param }, { log: v === "audit" ? undefined : v })} />
        {options ? <ActivityPickers ws={ws} who={who} options={options} hidden={{ log: current.log, days: param, status, tests: current.tests }} /> : null}
        <p className="max-w-prose text-sm text-muted-foreground">
          {KINDS.find((k) => k.value === kind)!.about} {l.total.toLocaleString("en")} {l.total === 1 ? "entry" : "entries"}, {span}, newest first, {PAGE} a page; hover a time for the exact moment (UTC).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Period" options={PERIODS} value={days} href={(v) => withQuery(path, current, { days: v === "30" ? undefined : v })} />
          <Segmented label="Show" options={[{ value: "", label: "All" }, ...LOG_FILTERS[kind]]} value={status ?? ""} href={(v) => withQuery(path, current, { status: v || undefined })} />
          {kind === "calls" && !workspaceId ? (
            <Segmented label="Test runs" options={[{ value: "", label: "Customers only" }, { value: "1", label: "With test runs" }]} value={tests ? "1" : ""} href={(v) => withQuery(path, current, { tests: v || undefined })} />
          ) : null}
        </div>
      </div>
      <LogTable kind={kind} rows={l.rows} fx={fx} platform={!workspaceId} />
      <CursorPager newest={before ? withQuery(path, current, {}) : undefined} older={l.next ? withQuery(path, current, { before: l.next }) : undefined} />
    </>
  );
}
