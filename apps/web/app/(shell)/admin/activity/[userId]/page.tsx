import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPickers } from "@/components/admin/activity-pickers";
import { Ago, Empty, Money, PageHeader, Pager, Pill, Stat, Table, withQuery } from "@/components/admin/ui";
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";
import { personSummary, personTimeline } from "@/server/services/activity";
import { PAGE, pickerOptions } from "@/server/services/platform-admin";
import { usdInrRate } from "@/server/usage/fx";

export const metadata = { title: "Person activity · Platform admin" };

const LABEL = { visit: "Page visit", action: "Action", task: "Agent task", ai: "AI call" } as const;

/** One person's timeline, with what they've cost in the header. Never chat text. */
export default async function AdminPersonActivity({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ ws?: string; page?: string }> }) {
  await requirePlatformAdminPage();
  const { userId } = await params;
  const q = await searchParams;
  const ws = q.ws || undefined;
  const page = Math.max(1, Number(q.page) || 1);
  const [s, t, options, fx] = await Promise.all([personSummary({ userId, workspaceId: ws }), personTimeline({ userId, workspaceId: ws, page }), pickerOptions(), usdInrRate()]);
  if (!s) notFound();
  const name = s.user.name ?? s.user.email;
  const path = `/admin/activity/${userId}`;
  const current = { ws, page: page > 1 ? String(page) : undefined };

  return (
    <>
      <PageHeader title={name} crumbs={[{ href: "/admin/activity", label: "Activity" }, { label: name }]}>
        {s.user.name ? `${s.user.email} · ` : ""}newest first, {PAGE} a page. An agent task’s AI calls are counted in its row. Chat text is never shown.{" "}
        <Link href={`/admin/people/${userId}`} className="underline underline-offset-4">
          Their workspaces and roles
        </Link>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="AI spend" value={<Money usd={s.aiUsd} fx={fx} />} hint={ws ? "in this workspace" : "everywhere"} />
        <Stat label="Other paid APIs" value={<Money usd={s.apiUsd} fx={fx} />} hint="maps, page speed, phone checks" />
      </div>
      <ActivityPickers ws={ws} options={options} person={false} />
      <Table
        wide
        head={["When", "What", "Detail", "Workspace", "Project", "Cost"]}
        numeric={[5]}
        empty="Nothing recorded for them here yet."
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
      <Pager page={page} hasMore={t.hasMore} href={(n) => withQuery(path, current, { page: n > 1 ? String(n) : undefined })} />
    </>
  );
}
