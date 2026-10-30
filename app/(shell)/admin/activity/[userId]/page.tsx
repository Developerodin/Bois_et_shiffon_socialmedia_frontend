import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPickers } from "@/components/admin/activity-pickers";
import { Ago, CursorPager, Empty, Money, PageHeader, period as periodOf, PERIODS, Pill, Segmented, Stat, Table, withQuery } from "@/components/admin/ui";
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";
import { NO_WORKSPACE, personSummary, personTimeline } from "@/server/services/activity";
import { PAGE, parseCursor, pickerOptions } from "@/server/services/platform-admin";
import { usdInrRate } from "@/server/usage/fx";

export const metadata = { title: "Person activity · Platform admin" };

const LABEL = { visit: "Page visit", action: "Action", task: "Agent task", ai: "AI call" } as const;

/** One person's timeline, with what they've cost in the header. Never chat text. */
export default async function AdminPersonActivity({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ ws?: string; days?: string; before?: string }> }) {
  await requirePlatformAdminPage();
  const { userId } = await params;
  const q = await searchParams;
  const ws = q.ws || undefined;
  const workspaceId = ws === NO_WORKSPACE ? null : ws; // null: only what happened outside any workspace
  const { value: days, days: n, param, span } = periodOf(q.days);
  const before = parseCursor(q.before);
  const [s, t, options, fx] = await Promise.all([personSummary({ userId, workspaceId, days: n }), personTimeline({ userId, workspaceId, days: n, before }), pickerOptions(), usdInrRate()]);
  if (!s.user && !t.total) notFound(); // a deleted account still shows what it left behind
  const name = s.user ? (s.user.name ?? s.user.email) : "(deleted user)";
  const path = `/admin/activity/${userId}`;
  const current = { ws, days: param };

  return (
    <>
      <PageHeader title={name} crumbs={[{ href: "/admin/activity", label: "Activity" }, { label: name }]}>
        {s.user?.name ? `${s.user.email} · ` : ""}
        {t.total.toLocaleString("en")} {t.total === 1 ? "entry" : "entries"}, {span}, newest first, {PAGE} a page. An agent task’s AI calls are counted in its row. Chat text is never shown.{" "}
        {s.user ? (
          <Link href={`/admin/people/${userId}`} className="underline underline-offset-4">
            Their workspaces and roles
          </Link>
        ) : null}
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="AI spend" value={<Money usd={s.aiUsd} fx={fx} />} hint={`${workspaceId === null ? "outside any workspace" : ws ? "in this workspace" : "everywhere"}, ${span}`} />
        <Stat label="Other paid APIs" value={<Money usd={s.apiUsd} fx={fx} />} hint="maps, page speed, phone checks" />
      </div>
      <div className="flex flex-col gap-3">
        <ActivityPickers ws={ws} options={options} person={false} noWorkspace hidden={{ days: param }} />
        <Segmented label="Period" options={PERIODS} value={days} href={(v) => withQuery(path, current, { days: v === "30" ? undefined : v })} />
      </div>
      <Table
        wide
        head={["When", "What", "Detail", "Workspace", "Project", "Cost"]}
        numeric={[5]}
        empty="Nothing recorded for them here in this period."
        rows={t.items.map((i) => [
          <Ago key="w" at={i.at} />,
          <Pill key="k" tone={i.kind === "task" && i.status === "FAILED" ? "bad" : "muted"}>
            {i.kind === "visit" ? `${LABEL.visit} · ${i.platform}` : LABEL[i.kind]}
          </Pill>,
          <div key="d" className="min-w-0 max-w-sm">
            <span className="font-mono text-xs">{i.detail}</span>
            {i.kind === "task" || i.kind === "ai" ? <p className="text-xs text-muted-foreground">{[i.model, i.status?.toLowerCase()].filter(Boolean).join(" · ")}</p> : null}
          </div>,
          i.workspace ?? <Empty key="ws" />,
          i.brand ?? <Empty key="b" />,
          typeof i.usd === "number" ? <Money key="c" usd={i.usd} fx={fx} /> : <Empty key="c" />,
        ])}
      />
      <CursorPager newest={before ? withQuery(path, current, {}) : undefined} older={t.next ? withQuery(path, current, { before: t.next }) : undefined} />
    </>
  );
}
