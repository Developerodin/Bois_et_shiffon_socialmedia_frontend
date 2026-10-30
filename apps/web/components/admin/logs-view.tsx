import { ActivityPickers } from "@/components/admin/activity-pickers";
import { LogTable } from "@/components/admin/log-table";
import { Pager, Segmented, withQuery } from "@/components/admin/ui";
import { LOG_FILTERS, PAGE, pageNumber, pickerOptions, platformLogs, type LogKind } from "@/server/services/platform-admin";
import { usdInrRate } from "@/server/usage/fx";

const KINDS: { value: LogKind; label: string; about: string }[] = [
  { value: "audit", label: "Audit", about: "Who did what: sign-ins, member and role changes, approvals, publishing, admin visits." },
  { value: "runs", label: "Agent runs", about: "Every agent run, who or what started it, and how it ended." },
  { value: "events", label: "Agent log", about: "The lines agents write as they work (the Agent Log people see in the app)." },
  { value: "calls", label: "AI calls", about: "Every AI call: task, tier and model, cost, speed, and whether the answer passed every check." },
];

/**
 * One log at a time, filterable and paged, for the platform (no workspaceId) or one workspace. On the platform page,
 * `?ws=` and `?user=` narrow every log to a workspace and a person.
 */
export async function LogsView({ path, query, workspaceId }: { path: string; query: { log?: string; status?: string; tests?: string; page?: string; ws?: string; user?: string }; workspaceId?: string }) {
  const kind = (KINDS.some((k) => k.value === query.log) ? query.log : "audit") as LogKind;
  const status = LOG_FILTERS[kind].some((f) => f.value === query.status) ? query.status : undefined;
  const tests = !workspaceId && kind === "calls" && query.tests === "1";
  const page = pageNumber(query.page);
  const ws = workspaceId ? undefined : query.ws || undefined;
  const user = workspaceId ? undefined : query.user || undefined;
  const [l, fx, options] = await Promise.all([
    platformLogs({ kind, workspaceId: workspaceId ?? ws, actorId: user, status, includeTests: tests, page }),
    usdInrRate(),
    workspaceId ? null : pickerOptions(ws, user),
  ]);
  const current = { log: kind === "audit" ? undefined : kind, ws, user, status, tests: tests ? "1" : undefined, page: page > 1 ? String(page) : undefined };

  return (
    <>
      <div className="flex flex-col gap-3">
        <Segmented label="Log" options={KINDS} value={kind} href={(v) => withQuery(path, { ws, user }, { log: v === "audit" ? undefined : v })} />
        {options ? <ActivityPickers ws={ws} user={user} options={options} hidden={{ log: current.log, status, tests: current.tests }} /> : null}
        <p className="max-w-prose text-sm text-muted-foreground">
          {KINDS.find((k) => k.value === kind)!.about} Newest first, {PAGE} a page; hover a time for the exact moment (UTC).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Show" options={[{ value: "", label: "All" }, ...LOG_FILTERS[kind]]} value={status ?? ""} href={(v) => withQuery(path, current, { status: v || undefined })} />
          {kind === "calls" && !workspaceId ? (
            <Segmented label="Test runs" options={[{ value: "", label: "Customers only" }, { value: "1", label: "With test runs" }]} value={tests ? "1" : ""} href={(v) => withQuery(path, current, { tests: v || undefined })} />
          ) : null}
        </div>
      </div>
      <LogTable kind={kind} rows={l.rows} fx={fx} platform={!workspaceId} />
      <Pager page={page} hasMore={l.hasMore} href={(p) => withQuery(path, current, { page: p > 1 ? String(p) : undefined })} />
    </>
  );
}
