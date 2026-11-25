import type { LucideIcon } from "lucide-react";

/** Full-page error layout shared by the 404, page-error and crash screens (app/not-found, error, global-error). */
export function ErrorScreen({
  icon: Icon,
  code,
  title,
  description,
  reference,
  inline = false,
  kind,
  children,
}: {
  icon: LucideIcon;
  code: string;
  title: string;
  description: string;
  /** Error digest: lets support find the server log line. */
  reference?: string;
  /** Inside the shell (sidebar and top bar stay): fills the content area instead of the whole screen. */
  inline?: boolean;
  /** Which screen this is, as `data-error-screen` on the root: tests tell a 404 from an error without reading its wording. */
  kind?: "not-found" | "error" | "offline";
  children: React.ReactNode;
}) {
  const Wrapper = inline ? "div" : "main";
  return (
    <Wrapper data-error-screen={kind} className={inline ? "flex items-center justify-center px-6 py-16 text-foreground" : "flex min-h-dvh items-center justify-center bg-background px-6 py-16 text-foreground"}>
      <div className="surface-glow flex w-full max-w-xl flex-col items-start gap-5 rounded-2xl border border-border px-8 py-12 sm:px-12">
        <span className="inline-flex size-12 items-center justify-center rounded-full border border-border bg-muted text-primary" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <p className="text-xs text-primary">{code}</p>
        <h1 className="font-display text-4xl font-medium tracking-tight text-balance">{title}</h1>
        <p className="text-muted-foreground text-pretty">{description}</p>
        <div className="flex flex-wrap gap-3">{children}</div>
        {reference ? <p className="text-xs text-muted-foreground">Reference: {reference}</p> : null}
      </div>
    </Wrapper>
  );
}
