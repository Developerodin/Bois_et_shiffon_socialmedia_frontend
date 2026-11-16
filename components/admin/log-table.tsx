import type { AdminLogRow as LogRow, LogKind } from "@espanda/shared";
import { Ago, Empty, Money, Pill, Table, type Fx } from "@/components/admin/ui";

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const runTone = (s: string) => (s === "SUCCEEDED" ? "good" : s === "FAILED" ? "bad" : "warn");
const levelTone = (l: string) => (l === "ERROR" ? "bad" : l === "WARN" ? "warn" : l === "SUCCESS" ? "good" : "muted");
const callTone = (s: string) => (s === "SUCCEEDED" ? "good" : s === "FAILED" ? "bad" : "warn");
const CALL_STATUS: Record<string, string> = { SUCCEEDED: "succeeded", FAILED: "failed", ESCALATED: "asked again", FELL_BACK: "used a backup" };
const str = (v: unknown) => (typeof v === "string" ? v : "");
/** A kind-specific field of a log row (each kind carries its own: action, agent, status…). */
const f = (r: LogRow, key: string) => (r as Record<string, unknown>)[key];
const n = (r: LogRow, key: string) => (typeof f(r, key) === "number" ? (f(r, key) as number) : null);

/** Internal ids are long: the last 6 characters, the full id on hover. */
const ShortId = ({ id }: { id: string }) => (
  <span className="font-mono text-xs text-muted-foreground" title={id}>
    …{id.slice(-6)}
  </span>
);

/** One page of a log. `platform`: rows from every workspace, so a Workspace column is shown. */
export function LogTable({ kind, rows, fx, platform }: { kind: LogKind; rows: LogRow[]; fx: Fx; platform?: boolean }) {
  const ws = (r: LogRow) => (platform ? [r.workspace ?? <span key="ws" className="text-muted-foreground">platform</span>] : []);
  const wsHead = platform ? ["Workspace"] : [];
  const project = (r: LogRow) => r.brand ?? <Empty key="p" />;

  if (kind === "audit") {
    return (
      <Table
        wide={platform}
        head={["When", "Who", "Action", "On", ...wsHead, "Project"]}
        empty="Nothing recorded."
        rows={rows.map((r) => [
          <Ago key="w" at={r.at} />,
          r.who ?? <span key="s" className="text-muted-foreground">system</span>,
          <span key="a" className="font-mono text-xs">{str(f(r, "action"))}</span>,
          <span key="e" className="whitespace-nowrap">
            {str(f(r, "entityType"))} <ShortId id={str(f(r, "entityId"))} />
          </span>,
          ...ws(r),
          project(r),
        ])}
      />
    );
  }
  if (kind === "runs") {
    return (
      <Table
        wide
        head={["When", "Agent", ...wsHead, "Project", "Started by", "Status", "Took", "Error"]}
        numeric={[platform ? 6 : 5]}
        empty="No runs."
        rows={rows.map((r) => [
          <Ago key="w" at={r.at} />,
          str(f(r, "agent")),
          ...ws(r),
          project(r),
          r.who ?? <span key="t" className="text-muted-foreground">{str(f(r, "trigger"))}</span>,
          <Pill key="s" tone={runTone(str(f(r, "status")))}>{str(f(r, "status")).toLowerCase()}</Pill>,
          n(r, "seconds") !== null ? `${n(r, "seconds")} s` : <Empty key="d" />,
          f(r, "error") ? (
            <span key="e" className="line-clamp-2 max-w-xs text-xs text-destructive" title={str(f(r, "error"))}>
              {str(f(r, "error"))}
            </span>
          ) : (
            <Empty key="e" />
          ),
        ])}
      />
    );
  }
  if (kind === "events") {
    return (
      <Table
        head={["When", "Agent", ...wsHead, "Project", "Level", "Message"]}
        empty="No lines."
        rows={rows.map((r) => [
          <Ago key="w" at={r.at} />,
          str(f(r, "agent")),
          ...ws(r),
          project(r),
          <Pill key="l" tone={levelTone(str(f(r, "level")))}>{str(f(r, "level")).toLowerCase()}</Pill>,
          <span key="m" className="block max-w-prose">{str(f(r, "message"))}</span>,
        ])}
      />
    );
  }
  return (
    <Table
      wide
      head={["When", "Task", ...wsHead, "Model", "Status", "Checks", "Tokens", "Time", "Cost"]}
      numeric={platform ? [6, 7, 8] : [5, 6, 7]}
      empty="No AI calls."
      rows={rows.map((r) => [
        <Ago key="w" at={r.at} />,
        <div key="t">
          <span className="font-mono text-xs">{str(f(r, "task"))}</span>
          {r.brand ? <p className="text-xs text-muted-foreground">{r.brand}</p> : null}
        </div>,
        ...ws(r),
        <span key="m" className="whitespace-nowrap font-mono text-xs">
          {str(f(r, "model"))}
          {f(r, "tier") ? <span className="text-muted-foreground"> · {str(f(r, "tier"))}</span> : null}
        </span>,
        <Pill key="s" tone={callTone(str(f(r, "status")))}>
          {CALL_STATUS[str(f(r, "status"))] ?? str(f(r, "status")).toLowerCase()}
        </Pill>,
        f(r, "checks") === null || f(r, "checks") === undefined ? <Empty key="c" /> : <Pill key="c" tone={f(r, "checks") ? "good" : "warn"}>{f(r, "checks") ? "passed" : "flagged"}</Pill>,
        n(r, "tokens") ? COMPACT.format(n(r, "tokens")!) : <Empty key="k" />,
        n(r, "ms") !== null ? `${(n(r, "ms")! / 1000).toFixed(1)} s` : <Empty key="ms" />,
        n(r, "usd") !== null ? <Money key="u" usd={n(r, "usd")!} fx={fx} /> : <Empty key="u" />,
      ])}
    />
  );
}
