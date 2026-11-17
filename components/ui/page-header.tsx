import Link from "next/link";
import type { ReactNode } from "react";

function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      {items.map((it, i) => (
        <span key={it.label}>
          {i ? " / " : ""}
          {it.href ? (
            <Link href={it.href} className="underline-offset-4 hover:underline">
              {it.label}
            </Link>
          ) : (
            <span className="text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Page header: crumbs or eyebrow, the one h1, a line of context, and the page's actions on the right. */
export function PageHeader({ eyebrow, title, children, crumbs, actions }: { eyebrow?: string; title: string; children?: ReactNode; crumbs?: { href?: string; label: string }[]; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        {crumbs ? <Crumbs items={crumbs} /> : eyebrow ? <p className="text-xs text-primary">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-medium tracking-tight text-balance">{title}</h1>
        {children ? <div className="max-w-prose text-sm text-muted-foreground">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
