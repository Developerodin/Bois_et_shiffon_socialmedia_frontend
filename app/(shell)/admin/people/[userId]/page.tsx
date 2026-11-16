import Link from "next/link";
import type { AdminPerson } from "@espanda/shared";
import { AccessMatrix } from "@/components/admin/access";
import { LogTable } from "@/components/admin/log-table";
import { Ago, day, PageHeader, Pill, Section, Stat, when } from "@/components/admin/ui";
import { api, serverFetch } from "@/lib/server-fetch";

export const metadata = { title: "Person · Platform admin" };

/** One person across the platform. Read-only; the visit is recorded in the audit log. */
export default async function AdminPerson({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  // Recorded alongside the read (a missing person is a 404 from both).
  const [p] = await Promise.all([serverFetch<AdminPerson>(api`/api/v1/admin/people/${userId}`), serverFetch(api`/api/v1/admin/people/${userId}/visit`, { method: "POST" })]);
  const audit = p.audit;

  return (
    <>
      <PageHeader title={p.user.name ?? p.user.email} crumbs={[{ href: "/admin/people", label: "People" }, { label: p.user.name ?? p.user.email }]}>
        {p.user.name ? `${p.user.email} · ` : ""}joined {day(p.user.createdAt)} · read-only; this visit is recorded in the audit log.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Account" value={<span className="text-lg">{p.user.status.toLowerCase()}</span>} hint={p.user.isPlatformAdmin ? "platform admin" : "not a platform admin"} />
        <Stat label="Workspaces" value={p.workspaces.length.toLocaleString("en")} hint={`${p.workspaces.reduce((n, w) => n + w.projects.length, 0)} project roles`} />
        <Stat label="Last sign-in" value={<span className="text-lg">{p.lastSignIn ? <Ago at={p.lastSignIn} /> : "never recorded"}</span>} hint={`signs in with ${p.user.signIn.join(" or ")}`} />
        <Stat label="Agent runs started" value={p.runsStarted.toLocaleString("en")} />
      </div>

      <Section id="workspaces" title="Workspaces and what they can do" description="Their role in each workspace and project, and every permission it gives them there, with the role that grants it.">
        {p.workspaces.length ? (
          <div className="flex flex-col gap-4">
            {p.workspaces.map((w) => (
              <article key={w.id} className="rounded-xl border border-border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <Link href={`/admin/workspaces/${w.id}/people`} className="font-medium underline-offset-4 hover:underline">
                      {w.name}
                    </Link>
                    <p className="text-xs text-muted-foreground" title={when(w.joinedAt)}>
                      member since {day(w.joinedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Pill tone="good">{w.role ?? "no role"}</Pill>
                    {w.projects.map((pr) => (
                      <Pill key={pr.id}>{`${pr.name}: ${pr.role}`}</Pill>
                    ))}
                  </div>
                </header>
                <details className="group">
                  <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="group-open:hidden">Show their {w.permissions.length} workspace permissions{w.projects.length ? ` and ${w.projects.length} project role${w.projects.length === 1 ? "" : "s"}` : ""}</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <div className="border-t border-border">
                    <AccessMatrix columns={[{ key: "ws", label: "Workspace", grants: w.permissions }, ...w.projects.map((pr) => ({ key: pr.id, label: `${pr.name} (extra)`, grants: pr.permissions }))]} />
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">Not in any workspace.</p>
        )}
      </Section>

      <Section id="activity" title="Their recent actions" description="Their page visits, agent tasks and spend are on their Activity page.">
        <Link href={`/admin/activity/${userId}`} className="text-sm underline underline-offset-4">
          See their activity
        </Link>
        <LogTable kind="audit" rows={audit} fx={null} platform />
      </Section>
    </>
  );
}
