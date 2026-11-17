import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled card on the page: h2, optional description and actions, then the body inset by px-5. */
export function PageSection({ id, title, description, actions, className, children }: { id: string; title: string; description?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 id={`${id}-h`} className="font-display text-lg font-medium">{title}</h2>
          {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className={cn("px-5 py-4", className)}>{children}</div>
    </section>
  );
}
