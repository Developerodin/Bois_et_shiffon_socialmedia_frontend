import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Compass, type LucideIcon } from "lucide-react";
import { auth } from "@/auth";
import { loadShellContext } from "@/server/shell/load-shell-context";

const SECTIONS: Array<{
  id: string;
  title: string;
  icon: LucideIcon;
  empty: string;
}> = [
  {
    id: "approvals",
    title: "Needs your approval",
    icon: CheckCircle2,
    empty: "Nothing waiting on you. Drafts the agents prepare will queue here for sign-off.",
  },
  {
    id: "opportunities",
    title: "Opportunities",
    icon: Compass,
    empty: "No opportunities yet. Once agents start watching sources, ranked ideas will land here.",
  },
  {
    id: "issues",
    title: "Issues",
    icon: AlertTriangle,
    empty: "All clear. Stock, offer and source problems will be flagged here.",
  },
];

export default async function TodayPage() {
  // First run: no brand yet → the website step. Other pages stay reachable (e.g. Settings to invite people).
  const session = await auth();
  if (session?.user?.id) {
    const shell = await loadShellContext(session.user.id);
    if (shell.activeWorkspaceId && shell.brands.length === 0) redirect("/welcome");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <section
        aria-labelledby="today-hero"
        className="surface-glow rounded-3xl border border-border px-8 py-12 sm:px-12 sm:py-16"
      >
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Overnight summary
        </p>
        <h2
          id="today-hero"
          className="mt-5 max-w-3xl font-display text-4xl font-medium leading-[1.05] tracking-tight text-balance sm:text-6xl"
        >
          While you were away:{" "}
          <span className="text-muted-foreground">nothing to report yet.</span>
        </h2>
        <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          No agent has run for this brand so far. When they do, this line will
          sum up what they found, drafted and flagged overnight.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {SECTIONS.map(({ id, title, icon: Icon, empty }) => (
          <section key={id} aria-labelledby={`today-${id}`} className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2
                id={`today-${id}`}
                className="font-display text-xl font-medium tracking-tight"
              >
                {title}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">0</span>
            </div>
            <div className="flex flex-1 flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-6">
              <span
                className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-muted text-primary"
                aria-hidden="true"
              >
                <Icon className="size-4" />
              </span>
              <p className="text-sm text-muted-foreground">{empty}</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
