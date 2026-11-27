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

/**
 * Page header: crumbs or eyebrow and the page's actions. The title and its line of context are not shown (owner,
 * 2026-11-27: the sidebar already names the page); the title stays as the page's one h1 for screen readers.
 * `children` (the context line) is kept in the signature so callers needn't change; it isn't rendered.
 */
export function PageHeader({ eyebrow, title, crumbs, actions }: { eyebrow?: string; title: string; children?: ReactNode; crumbs?: { href?: string; label: string }[]; actions?: ReactNode }) {
  const lead = crumbs ? <Crumbs items={crumbs} /> : eyebrow ? <p className="text-xs text-primary">{eyebrow}</p> : null;
  if (!lead && !actions) return <h1 className="sr-only">{title}</h1>;
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        {lead}
        <h1 className="sr-only">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
